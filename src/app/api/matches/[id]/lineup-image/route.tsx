import { ImageResponse } from "next/og";
import { auth } from "@/auth";
import { getMatchDetail, isPlayerInMatch } from "@/lib/matches";
import { matchLabel } from "@/lib/format";
import { formationLabel, kitFor, layoutFormation } from "@/lib/field-view";
import { getFieldFeatures } from "@/lib/field-view-settings";

export const dynamic = "force-dynamic";

const W = 1080;

/** PNG of every team's lineup for sharing (members of the match and admins). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in", { status: 401 });
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId <= 0) return new Response("Not found", { status: 404 });

  const role = session.user.role;
  const admin = role === "admin" || role === "super";
  const pid = session.user.playerId;
  const member = pid != null && (await isPlayerInMatch(matchId, Number(pid)));
  if (!admin && !member) return new Response("Forbidden", { status: 403 });
  if (!admin && !(await getFieldFeatures()).share) return new Response("Disabled", { status: 403 });

  const match = await getMatchDetail(matchId);
  const teams = match?.teams.filter((t) => t.players.length > 0) ?? [];
  if (!match || teams.length === 0) return new Response("No teams", { status: 404 });

  const cols = teams.length;
  const pitchW = Math.floor((W - 80 - (cols - 1) * 24) / cols);
  const pitchH = Math.round(pitchW * (cols > 2 ? 1.55 : 1.3));
  const H = 200 + pitchH + 90;
  const node = cols > 2 ? 64 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 40,
          background: "linear-gradient(160deg, #0b1f14 0%, #0a0f0c 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 800 }}>
          <span style={{ marginRight: 14 }}>⚽</span> Lineups
          <span style={{ marginLeft: "auto", fontSize: 32, fontWeight: 500, opacity: 0.8 }}>{matchLabel(match.playedOn)}</span>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 40 }}>
          {teams.map((t) => {
            const kit = kitFor(t.teamNo, t.color);
            const spots = layoutFormation(t.players, (p) => p.position);
            return (
              <div key={t.teamNo} style={{ display: "flex", flexDirection: "column", width: pitchW }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                  <span
                    style={{
                      background: kit.bg,
                      color: kit.fg,
                      padding: "6px 16px",
                      borderRadius: 10,
                      fontSize: 26,
                      fontWeight: 800,
                    }}
                  >
                    {(t.name?.trim() || `Team ${t.teamNo}`).slice(0, 18)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 22, opacity: 0.7 }}>
                    {formationLabel(t.players.map((p) => p.position))}
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    width: pitchW,
                    height: pitchH,
                    borderRadius: 20,
                    border: `4px solid ${kit.bg}`,
                    background: "repeating-linear-gradient(0deg, #14361b 0px, #14361b 40px, #123016 40px, #123016 80px)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: pitchH / 2,
                      height: 2,
                      background: "rgba(255,255,255,0.25)",
                    }}
                  />
                  {spots.map((s) => (
                    <div
                      key={s.item.playerId}
                      style={{
                        position: "absolute",
                        left: (s.x / 100) * pitchW - node,
                        top: (4 + s.y * 0.88) / 100 * pitchH - node / 2,
                        width: node * 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: node,
                          height: node,
                          borderRadius: node,
                          background: kit.bg,
                          color: kit.fg,
                          border: "3px solid rgba(255,255,255,0.85)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: node * 0.36,
                          fontWeight: 800,
                        }}
                      >
                        {initials(s.item.name)}
                      </div>
                      <span style={{ marginTop: 6, fontSize: cols > 2 ? 20 : 24, fontWeight: 700 }}>
                        {s.item.name.split(" ")[0].slice(0, 12)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24, opacity: 0.6 }}>Sideline</div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "private, no-store" } },
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
