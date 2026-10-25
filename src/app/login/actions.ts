"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/password-reset";
import { rateLimit } from "@/lib/rate-limit";

export interface RequestResetState {
  ok: boolean;
  message: string;
}

const playerIdSchema = z.coerce.number().int().positive();

export async function requestResetAction(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  try {
    const playerId = playerIdSchema.parse(formData.get("playerId"));

    // Throttle reset requests per client and per target to prevent abuse and
    // notification flooding.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const [byIp, byTarget] = await Promise.all([
      rateLimit(`reset-ip:${ip}`, 10, 3600),
      rateLimit(`reset-id:${playerId}`, 3, 3600),
    ]);
    if (!byIp.allowed || !byTarget.allowed) {
      return {
        ok: false,
        message: "Too many reset requests. Please try again later.",
      };
    }

    return await requestPasswordReset(playerId);
  } catch {
    return { ok: false, message: "Could not send the reset request." };
  }
}
