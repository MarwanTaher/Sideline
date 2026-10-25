import { ImageResponse } from "next/og";
import { getMatchDigest, scorelineText } from "@/lib/match-digest";
import { shortenName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Match result";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);
  const digest = Number.isFinite(matchId) ? await getMatchDigest(matchId) : null;

  const scoreline = digest ? scorelineText(digest) : "";
  const dateLabel = digest?.playedOnLabel ?? "";
  const motm = digest?.motm ? shortenName(digest.motm.name) : "";
  const topScorer = digest?.topScorer ? shortenName(digest.topScorer.name) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          <span style={{ marginRight: 16 }}>⚽</span> Sideline
          <span style={{ marginLeft: "auto", fontSize: 30, fontWeight: 500, opacity: 0.85 }}>{dateLabel}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {digest && digest.teams.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
              {digest.teams.map((t, i) => (
                <div key={t.teamNo} style={{ display: "flex", alignItems: "center", gap: 40 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ fontSize: 34, opacity: 0.9, maxWidth: 320, overflow: "hidden" }}>{t.name}</span>
                    <span style={{ fontSize: 150, fontWeight: 800, lineHeight: 1 }}>{t.goals}</span>
                  </div>
                  {i < digest.teams.length - 1 ? (
                    <span style={{ fontSize: 70, opacity: 0.6 }}>–</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 60, fontWeight: 700 }}>{scoreline || `Match ${matchId}`}</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 48, fontSize: 34 }}>
          {motm ? (
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: 12 }}>🏆</span> MOTM: {motm}
            </span>
          ) : null}
          {topScorer ? (
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: 12 }}>⚽</span> Top scorer: {topScorer}
            </span>
          ) : null}
        </div>
      </div>
    ),
    { ...size },
  );
}
