import { buildMatchIcs } from "@/lib/calendar-ics";
import { getBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return new Response("Not found", { status: 404 });
  }
  const baseUrl = await getBaseUrl();
  const ics = await buildMatchIcs(matchId, baseUrl);
  if (!ics) return new Response("Not found", { status: 404 });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="match-${matchId}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
