"use server";

import { z } from "zod";
import { consumeResetToken, getResetTokenInfo } from "@/lib/password-reset";

export interface ResetActionState {
  ok: boolean;
  message: string;
}

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6, "Password must be at least 6 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export async function resetPasswordAction(
  _prev: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  try {
    const parsed = schema.parse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });

    // Public endpoint — re-validate the token server-side before writing.
    const info = await getResetTokenInfo(parsed.token);
    if (!info.valid) {
      return { ok: false, message: "This reset link is no longer valid." };
    }

    return await consumeResetToken(parsed.token, parsed.password);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: err.issues.map((i) => i.message).join(" ") };
    }
    return { ok: false, message: "Something went wrong." };
  }
}
