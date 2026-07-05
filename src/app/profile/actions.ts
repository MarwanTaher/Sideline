"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { changePlayerPassword } from "@/lib/password-reset";

export interface ChangePasswordState {
  ok: boolean;
  message: string;
}

const schema = z
  .object({
    current: z.string(),
    password: z.string().min(6, "New password must be at least 6 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "New passwords do not match.",
    path: ["confirm"],
  });

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (playerId == null) {
    return { ok: false, message: "You must be signed in as a player." };
  }

  try {
    const parsed = schema.parse({
      current: formData.get("current") ?? "",
      password: formData.get("password") ?? "",
      confirm: formData.get("confirm") ?? "",
    });
    // playerId comes from the session, never from the form.
    return await changePlayerPassword(Number(playerId), parsed.current, parsed.password);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: "Could not update your password." };
  }
}
