"use server";

import { z } from "zod";
import { headers } from "next/headers";
import {
  createSelfRegisteredPlayer,
  DuplicateNameError,
} from "@/lib/players-admin";
import { setPlayerPassword } from "@/lib/password-reset";
import { notify } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

export interface RegisterState {
  ok: boolean;
  message: string;
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(60, "Name is too long.");
const positionSchema = z.enum(["GK", "DEF", "MID", "FWD"]);
const passwordSchema = z
  .string()
    .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

/**
 * Public self-registration with instant activation. Creates an active player
 * with a password so they can sign in immediately, and notifies admins that a
 * new player has joined. Names must be unique (case-insensitive).
 */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  try {
    // Throttle sign-ups per client to prevent scripted account flooding.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await rateLimit(`register:${ip}`, 5, 3600);
    if (!allowed) {
      return {
        ok: false,
        message: "Too many sign-ups from this device. Please try again later.",
      };
    }

    const name = nameSchema.parse(formData.get("name"));
    const position = positionSchema.parse(formData.get("position"));
    const password = passwordSchema.parse(formData.get("password"));
    const confirm = String(formData.get("confirm") ?? "");

    if (password !== confirm) {
      return { ok: false, message: "Passwords don't match." };
    }

    let playerId: number;
    try {
      playerId = await createSelfRegisteredPlayer(name, position);
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        return {
          ok: false,
          message:
            "That name is already taken. If it's you, ask an admin to reset your password.",
        };
      }
      throw err;
    }

    await setPlayerPassword(playerId, password);

    // Let admins know a new player has joined (never block registration on this).
    try {
      await notify("new_player", {
        title: "New player joined \u26bd",
        body: `${name} (${position}) just registered.`,
        url: "/players",
        tag: `new-player-${playerId}`,
      });
    } catch {
      // ignore push errors
    }

    return {
      ok: true,
      message: "You're all set! You can sign in now with your name and password.",
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Something went wrong.",
    };
  }
}
