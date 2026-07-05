"use server";

import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";

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
    return await requestPasswordReset(playerId);
  } catch {
    return { ok: false, message: "Could not send the reset request." };
  }
}
