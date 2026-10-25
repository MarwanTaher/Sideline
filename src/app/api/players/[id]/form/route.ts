import { auth } from "@/auth";
import { getRecentForm } from "@/lib/home";

export const dynamic = "force-dynamic";

/** Last-5 W/D/L for the Field view player card. Signed-in members only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Sign in" }, { status: 401 });
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) return Response.json({ error: "Not found" }, { status: 404 });
  const form = await getRecentForm(playerId, 5);
  return Response.json(
    { form: form.map((f) => f.result) },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
