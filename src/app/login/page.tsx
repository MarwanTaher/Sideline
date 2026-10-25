import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export const metadata = {
  title: "Sign in · Sideline",
};

/** Only allow relative, same-site callback paths (guards against open redirects). */
function safeCallback(url: string | undefined): string {
  if (!url) return "/";
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return "/";
  }
  return url;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const target = safeCallback(callbackUrl);

  const session = await auth();
  if (session?.user) {
    redirect(target);
  }

  const players = await db
    .select({ id: schema.players.id, name: schema.players.name })
    .from(schema.players)
    .where(eq(schema.players.active, 1))
    .orderBy(asc(schema.players.name));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <LoginForm players={players} callbackUrl={target} />
    </main>
  );
}
