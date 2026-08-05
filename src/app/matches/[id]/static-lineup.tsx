import Image from "next/image";
import type { MatchTeam, MatchTeamPlayer } from "@/lib/matches";
import { teamGridColumns } from "@/lib/team-constants";

/* Read-only pitch view of a saved draft, shown on the match overview. Mirrors
 * the Lineup Builder's look but has no drag/drop or controls. */

const BRAND = "#a6ce39";
const ROW_ORDER = ["FWD", "MID", "DEF", "GK"] as const;
type Row = (typeof ROW_ORDER)[number];

function normPos(value: string): Row {
  const s = value.toUpperCase();
  return (ROW_ORDER as readonly string[]).includes(s) ? (s as Row) : "MID";
}

function groupByRow(players: MatchTeamPlayer[]): Record<Row, MatchTeamPlayer[]> {
  const byRow: Record<Row, MatchTeamPlayer[]> = { FWD: [], MID: [], DEF: [], GK: [] };
  for (const p of players) byRow[normPos(p.position)].push(p);
  return byRow;
}

export function StaticLineup({ teams }: { teams: MatchTeam[] }) {
  return (
    <div
      className={`grid gap-4 ${teamGridColumns(teams.length)}`}
    >
      {teams.map((team) => (
        <StaticPitch key={team.teamNo} team={team} />
      ))}
    </div>
  );
}

function StaticPitch({ team }: { team: MatchTeam }) {
  const byRow = groupByRow(team.players);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3"
      style={{ borderColor: `${BRAND}66`, backgroundColor: "#0b0d0b" }}
    >
      <div className="relative z-10 flex items-center justify-between gap-2 px-1 pb-2">
        <span
          className="min-w-[5ch] max-w-[70%] truncate rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black"
          style={{ backgroundColor: BRAND }}
        >
          {team.name?.trim() || `Team ${team.teamNo}`}
        </span>
        <span className="shrink-0 text-[10px] text-neutral-500">
          {team.players.length} players
        </span>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl">
        <PitchSurface />
        <div className="relative z-10 flex min-h-[340px] flex-col justify-between gap-3 px-2 py-4">
          {ROW_ORDER.map((row) => (
            <div
              key={row}
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
            >
              {byRow[row].length === 0 ? (
                <EmptySlot label={row} />
              ) : (
                byRow[row].map((p) => <StaticNode key={p.playerId} player={p} />)
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// Faint dashed placeholder shown when a position row has no players.
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex w-16 flex-col items-center gap-1 opacity-40">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-white/30" />
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </span>
    </div>
  );
}

function StaticNode({ player }: { player: MatchTeamPlayer }) {
  return (
    <div className="flex w-16 flex-col items-center gap-1">
      <div className="relative">
        <div
          className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 shadow-lg"
          style={{ borderColor: BRAND, backgroundColor: "#141614" }}
        >
          {player.photoUrl ? (
            <Image
              src={player.photoUrl}
              alt={player.name}
              fill
              sizes="44px"
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-xs font-bold text-neutral-300">
              {initialsOf(player.name) || "?"}
            </span>
          )}
          {player.isGuest ? (
            <span
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#141614]"
              style={{ backgroundColor: "#818cf8" }}
              title="Guest"
            />
          ) : null}
        </div>
      </div>
      <span className="max-w-[64px] truncate text-center text-[10px] font-semibold text-neutral-100">
        {player.name.split(" ")[0]}
      </span>
    </div>
  );
}

function PitchSurface() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, #14361b 0px, #14361b 28px, #123016 28px, #123016 56px)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.06), transparent 60%)",
        }}
      />
      {/* Pitch lines */}
      <div className="absolute inset-3 rounded-lg border border-white/20" />
      <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      {/* Goal boxes */}
      <div className="absolute left-1/2 top-3 h-8 w-20 -translate-x-1/2 border border-t-0 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-8 w-20 -translate-x-1/2 border border-b-0 border-white/20" />
    </div>
  );
}
