import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export const metadata = {
  title: "Sign in · Sideline",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const players = await db
    .select({ id: schema.players.id, name: schema.players.name })
    .from(schema.players)
    .where(eq(schema.players.active, 1))
    .orderBy(asc(schema.players.name));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <LoginForm players={players} />
    </main>
  );
}
