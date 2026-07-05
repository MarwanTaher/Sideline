"use server";

import { signIn } from "@/auth";
import { resolvePlayerFromAccessToken } from "@/lib/access-tokens";

/** Complete a magic-link sign-in from a player access token. */
export async function magicLoginAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;
  const resolved = await resolvePlayerFromAccessToken(token);
  if (!resolved) return;
  await signIn("credentials", {
    role: "token",
    identifier: token,
    redirectTo: "/profile",
  });
}
