"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MatchTeam, MatchTeamPlayer } from "@/lib/matches";
import { teamGridColumns } from "@/lib/team-constants";
import {
  KITS,
  LINES,
  formationLabel,
  kitFor,
  layoutFormation,
  normLine,
  type FieldFeatures,
  type balanceSummary,
} from "@/lib/field-view";

/* Match overview Field view: kit-coloured pitches (swipeable), formation
 * layout, "me" glow, live goals/MOTM, tap-for-card, admin balance meter and a
 * shareable lineup image. Each piece obeys an admin feature switch. */

export type FieldLive = {
  stats: Record<number, { goals: number; assists: number }>;
  motmId: number | null;
};
export type FieldBalance = ReturnType<typeof balanceSummary>;

type Kit = { bg: string; fg: string };
const BRAND: Kit = KITS.green;

type Props = {
  teams: MatchTeam[];
  matchId: number;
  myPlayerId: number | null;
  features: FieldFeatures;
  live: FieldLive | null;
  balance: FieldBalance | null;
};

export function FieldView({ teams, matchId, myPlayerId, features, live, balance }: Props) {
  const [selected, setSelected] = useState<MatchTeamPlayer & { kit: Kit } | null>(null);
  const kitOf = (t: MatchTeam): Kit => (features.kits ? kitFor(t.teamNo, t.color) : BRAND);
  const shown = teams.filter((t) => t.players.length > 0);
  const list = shown.length ? shown : teams;

  const pitches = list.map((team) => (
    <Pitch
      key={team.teamNo}
      team={team}
      kit={kitOf(team)}
      features={features}
      myPlayerId={myPlayerId}
      live={features.live ? live : null}
      onTap={features.card ? (p) => setSelected({ ...p, kit: kitOf(team) }) : undefined}
    />
  ));

  return (
    <div>
      {balance && features.balance ? <BalanceMeter balance={balance} teams={list} kitOf={kitOf} /> : null}

      {features.swipe && list.length > 1 ? (
        <Swipe teams={list} kitOf={kitOf} myPlayerId={myPlayerId}>
          {pitches}
        </Swipe>
      ) : (
        <div className={`grid gap-4 ${teamGridColumns(list.length)}`}>{pitches}</div>
      )}

      {features.share ? <ShareButton matchId={matchId} /> : null}

      {selected ? (
        <PlayerSheet
          player={selected}
          kit={selected.kit}
          live={features.live ? live : null}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

// ── Swipe carousel ────────────────────────────────────────────────────────

function Swipe({
  teams,
  kitOf,
  myPlayerId,
  children,
}: {
  teams: MatchTeam[];
  kitOf: (t: MatchTeam) => Kit;
  myPlayerId: number | null;
  children: React.ReactNode[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function go(i: number, smooth = true) {
    const el = ref.current?.children[i] as HTMLElement | undefined;
    if (!el || !ref.current) return;
    ref.current.scrollTo({ left: el.offsetLeft - ref.current.offsetLeft, behavior: smooth ? "smooth" : "instant" });
  }

  // Open on the viewer's own team (the scroll event then syncs the tab).
  useEffect(() => {
    const mine = teams.findIndex((t) => t.players.some((p) => p.playerId === myPlayerId));
    if (mine > 0) go(mine, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el || !el.children.length) return;
    const w = (el.children[0] as HTMLElement).offsetWidth || 1;
    setActive(Math.min(teams.length - 1, Math.round(el.scrollLeft / w)));
  }

  return (
    <div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {teams.map((t, i) => {
          const kit = kitOf(t);
          const on = i === active;
          return (
            <button
              key={t.teamNo}
              type="button"
              onClick={() => go(i)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition"
              style={
                on
                  ? { backgroundColor: kit.bg, color: kit.fg, borderColor: kit.bg }
                  : { borderColor: `${kit.bg}66` }
              }
            >
              {!on ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kit.bg }} /> : null}
              {t.name?.trim() || `Team ${t.teamNo}`}
            </button>
          );
        })}
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="-mx-1 flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((c, i) => (
          <div key={i} className="w-full shrink-0 snap-start px-1 sm:w-1/2 lg:w-1/3">
            {c}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5 sm:hidden">
        {teams.map((t, i) => (
          <span
            key={t.teamNo}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === active ? 16 : 6, backgroundColor: i === active ? kitOf(t).bg : "#a3a3a366" }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Pitch ─────────────────────────────────────────────────────────────────

function Pitch({
  team,
  kit,
  features,
  myPlayerId,
  live,
  onTap,
}: {
  team: MatchTeam;
  kit: Kit;
  features: FieldFeatures;
  myPlayerId: number | null;
  live: FieldLive | null;
  onTap?: (p: MatchTeamPlayer) => void;
}) {
  const node = (p: MatchTeamPlayer) => (
    <Node
      player={p}
      kit={kit}
      me={features.glow && p.playerId === myPlayerId}
      stat={live?.stats[p.playerId]}
      motm={live?.motmId != null && live.motmId === p.playerId}
      onTap={onTap}
    />
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 p-3"
      style={{ borderColor: `${kit.bg}aa`, backgroundColor: "#0b0d0b" }}
    >
      <div className="relative z-10 flex items-center justify-between gap-2 px-1 pb-2">
        <span
          className="min-w-[5ch] max-w-[70%] truncate rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest"
          style={{ backgroundColor: kit.bg, color: kit.fg }}
        >
          {team.name?.trim() || `Team ${team.teamNo}`}
        </span>
        <span className="shrink-0 text-[10px] text-neutral-400">
          {features.formation ? (
            <span className="mr-1.5 font-bold text-neutral-200">{formationLabel(team.players.map((p) => p.position))}</span>
          ) : null}
          {team.players.length} players
        </span>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl">
        <PitchSurface />
        {features.formation ? (
          <div className="relative z-10 aspect-[3/4] w-full">
            {layoutFormation(team.players, (p) => p.position).map((s) => (
              <div
                key={s.item.playerId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                {node(s.item)}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative z-10 flex min-h-[340px] flex-col justify-around gap-3 px-2 py-4">
            {LINES.map((line) => {
              const row = team.players.filter((p) => normLine(p.position) === line);
              return row.length ? (
                <div key={line} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  {row.map((p) => (
                    <div key={p.playerId}>{node(p)}</div>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

function Avatar({ player, kit, size }: { player: MatchTeamPlayer; kit: Kit; size: number }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-full border-2 shadow-lg"
      style={{ width: size, height: size, borderColor: kit.bg, backgroundColor: "#141614" }}
    >
      {player.photoUrl ? (
        <Image src={player.photoUrl} alt={player.name} fill sizes={`${size}px`} className="rounded-full object-cover" />
      ) : (
        <span className="font-bold text-neutral-300" style={{ fontSize: size * 0.3 }}>
          {initialsOf(player.name)}
        </span>
      )}
    </div>
  );
}

function Node({
  player,
  kit,
  me,
  stat,
  motm,
  onTap,
}: {
  player: MatchTeamPlayer;
  kit: Kit;
  me: boolean;
  stat?: { goals: number; assists: number };
  motm: boolean;
  onTap?: (p: MatchTeamPlayer) => void;
}) {
  const body = (
    <>
      <div className="relative">
        <div
          className={`rounded-full ${me ? "field-me-glow" : ""}`}
          style={me ? ({ "--glow": kit.bg } as React.CSSProperties) : undefined}
        >
          <Avatar player={player} kit={kit} size={44} />
        </div>
        {motm ? <span className="absolute -left-2 -top-3 text-base drop-shadow" aria-label="Man of the match">👑</span> : null}
        {player.isGuest ? (
          <span
            className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#141614]"
            style={{ backgroundColor: "#818cf8" }}
            title="Guest"
          />
        ) : null}
      </div>
      <span className="max-w-[64px] truncate text-center text-[10px] font-semibold text-neutral-100">
        {player.name.split(" ")[0]}
      </span>
      {stat && (stat.goals > 0 || stat.assists > 0) ? (
        <span className="-mt-0.5 flex gap-1 rounded-full bg-black/50 px-1.5 text-[9px] font-bold leading-4 text-white">
          {stat.goals > 0 ? <span>⚽{stat.goals > 1 ? stat.goals : ""}</span> : null}
          {stat.assists > 0 ? <span>🅰{stat.assists > 1 ? stat.assists : ""}</span> : null}
        </span>
      ) : null}
    </>
  );
  const cls = "flex w-16 flex-col items-center gap-1";
  return onTap ? (
    <button type="button" onClick={() => onTap(player)} className={`${cls} transition active:scale-95`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function PitchSurface() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{ background: "repeating-linear-gradient(0deg, #14361b 0px, #14361b 28px, #123016 28px, #123016 56px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.06), transparent 60%)" }}
      />
      <div className="absolute inset-3 rounded-lg border border-white/20" />
      <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
      <div className="absolute left-1/2 top-3 h-[12%] w-[44%] -translate-x-1/2 border border-t-0 border-white/20" />
      <div className="absolute left-1/2 top-3 h-[5%] w-[20%] -translate-x-1/2 border border-t-0 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-[12%] w-[44%] -translate-x-1/2 border border-b-0 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-[5%] w-[20%] -translate-x-1/2 border border-b-0 border-white/20" />
    </div>
  );
}

// ── Balance meter (admins) ────────────────────────────────────────────────

function BalanceMeter({
  balance,
  teams,
  kitOf,
}: {
  balance: FieldBalance;
  teams: MatchTeam[];
  kitOf: (t: MatchTeam) => Kit;
}) {
  if (balance.teams.length < 2) return null;
  const max = Math.max(...balance.teams.map((t) => t.avg), 1);
  const verdict = {
    fair: { text: "Balanced", cls: "text-emerald-600 dark:text-emerald-400" },
    close: { text: "Close", cls: "text-amber-600 dark:text-amber-400" },
    uneven: { text: "Uneven", cls: "text-red-600 dark:text-red-400" },
  }[balance.verdict];
  return (
    <div className="mb-4 rounded-2xl border border-black/[0.06] p-3 text-xs dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Team balance <span className="font-normal text-neutral-400">· admins only</span></span>
        <span className={`font-bold ${verdict.cls}`}>
          {verdict.text} · {balance.spreadPct}% gap
        </span>
      </div>
      <div className="space-y-1.5">
        {balance.teams.map((s) => {
          const team = teams.find((t) => t.teamNo === s.teamNo);
          const kit = team ? kitOf(team) : BRAND;
          return (
            <div key={s.teamNo} className="flex items-center gap-2">
              <span className="w-20 truncate">{team?.name?.trim() || `Team ${s.teamNo}`}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full rounded-full" style={{ width: `${(s.avg / max) * 100}%`, backgroundColor: kit.bg }} />
              </div>
              <span className="w-8 text-right tabular-nums text-neutral-500">{Math.round(s.avg)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Player card ───────────────────────────────────────────────────────────

const FORM_CLS: Record<string, string> = {
  W: "bg-emerald-500 text-white",
  D: "bg-neutral-400 text-white",
  L: "bg-red-500 text-white",
};

function PlayerSheet({
  player,
  kit,
  live,
  onClose,
}: {
  player: MatchTeamPlayer;
  kit: Kit;
  live: FieldLive | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<string[] | null>(null);
  const stat = live?.stats[player.playerId];

  useEffect(() => {
    if (player.isGuest) return;
    let alive = true;
    fetch(`/api/players/${player.playerId}/form`)
      .then((r) => (r.ok ? r.json() : { form: [] }))
      .then((d: { form?: string[] }) => alive && setForm(d.form ?? []))
      .catch(() => alive && setForm([]));
    return () => {
      alive = false;
    };
  }, [player.playerId, player.isGuest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={player.name}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl dark:bg-neutral-900"
        style={{ borderTop: `4px solid ${kit.bg}` }}
      >
        <div className="flex items-center gap-4">
          <Avatar player={player} kit={kit} size={64} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{player.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
              <span className="rounded px-1.5 py-0.5 font-semibold" style={{ backgroundColor: kit.bg, color: kit.fg }}>
                {normLine(player.position)}
              </span>
              {player.isGuest ? <span>Guest{player.hostName ? ` of ${player.hostName}` : ""}</span> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl text-neutral-400">
            ×
          </button>
        </div>

        {live ? (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Goals" value={stat?.goals ?? 0} />
            <Stat label="Assists" value={stat?.assists ?? 0} />
            <Stat label="MOTM" value={live.motmId === player.playerId ? "👑" : "—"} />
          </div>
        ) : null}

        {!player.isGuest ? (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">Recent form</div>
            <div className="mt-1.5 flex h-6 gap-1.5">
              {form === null ? (
                <span className="text-xs text-neutral-400">Loading…</span>
              ) : form.length === 0 ? (
                <span className="text-xs text-neutral-400">No finished matches yet</span>
              ) : (
                form.map((r, i) => (
                  <span key={i} className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${FORM_CLS[r] ?? ""}`}>
                    {r}
                  </span>
                ))
              )}
            </div>
            <Link
              href={`/players/${player.playerId}`}
              className="mt-5 block rounded-xl py-2.5 text-center text-sm font-semibold"
              style={{ backgroundColor: kit.bg, color: kit.fg }}
            >
              View profile
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-neutral-100 py-2 dark:bg-neutral-800">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
    </div>
  );
}

// ── Share ─────────────────────────────────────────────────────────────────

function ShareButton({ matchId }: { matchId: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/lineup-image`);
      if (!res.ok) throw new Error(res.status === 403 ? "Only players in this match can share." : "Couldn't build the image.");
      const blob = await res.blob();
      const file = new File([blob], `lineup-${matchId}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Lineups" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium transition active:scale-95 disabled:opacity-50 dark:border-white/15"
      >
        {busy ? "Preparing…" : "📤 Share lineup"}
      </button>
      {err ? <span className="text-xs text-red-500">{err}</span> : null}
    </div>
  );
}
