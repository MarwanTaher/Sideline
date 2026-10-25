"use client";

import { useState, useTransition } from "react";
import {
  FIELD_FEATURES,
  FIELD_FEATURE_KEYS,
  KITS,
  KIT_KEYS,
  defaultKit,
  type FieldFeature,
  type FieldFeatures,
  type KitKey,
} from "@/lib/field-view";
import { setFieldFeatureAction, setTeamColorAction } from "./field-actions";

/* Lineup Builder card: per-match team kit colours plus the global Field view
 * feature switches. Both save instantly. */

export function FieldSettings({
  matchId,
  numTeams,
  teamNames,
  teamColors,
  features,
}: {
  matchId: number;
  numTeams: number;
  teamNames: Record<number, string>;
  teamColors: Record<number, KitKey>;
  features: FieldFeatures;
}) {
  const [colors, setColors] = useState(teamColors);
  const [flags, setFlags] = useState(features);
  const [openTeam, setOpenTeam] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  function pickColor(teamNo: number, kit: KitKey) {
    const prev = colors;
    setColors({ ...colors, [teamNo]: kit });
    setOpenTeam(null);
    start(async () => {
      const r = await setTeamColorAction(matchId, teamNo, kit);
      if (!r.ok) {
        setColors(prev);
        setErr(r.error ?? "Couldn't save.");
      } else setErr(null);
    });
  }

  function toggle(key: FieldFeature) {
    const next = !flags[key];
    setFlags({ ...flags, [key]: next });
    start(async () => {
      const r = await setFieldFeatureAction(key, next);
      if (!r.ok) {
        setFlags((f) => ({ ...f, [key]: !next }));
        setErr(r.error ?? "Couldn't save.");
      } else setErr(null);
    });
  }

  const teams = Array.from({ length: numTeams }, (_, i) => i + 1);

  return (
    <details className="mt-4 rounded-2xl border border-black/[0.06] p-4 dark:border-white/10">
      <summary className="cursor-pointer select-none text-sm font-semibold">🎨 Field view — kits &amp; features</summary>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Team colours (this match)</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {teams.map((n) => {
            const key = colors[n] ?? defaultKit(n);
            const kit = KITS[key];
            return (
              <div key={n} className="relative">
                <button
                  type="button"
                  disabled={!flags.kits}
                  onClick={() => setOpenTeam(openTeam === n ? null : n)}
                  className="flex items-center gap-2 rounded-full border border-black/10 py-1 pl-1 pr-3 text-sm disabled:opacity-40 dark:border-white/15"
                >
                  <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: kit.bg }} />
                  {teamNames[n]?.trim() || `Team ${n}`}
                </button>
                {openTeam === n ? (
                  <div className="absolute left-0 top-full z-20 mt-1 grid w-48 grid-cols-5 gap-2 rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/15 dark:bg-neutral-900">
                    {KIT_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        title={KITS[k].label}
                        aria-label={KITS[k].label}
                        onClick={() => pickColor(n, k)}
                        className={`h-7 w-7 rounded-full border-2 transition active:scale-90 ${
                          k === key ? "border-neutral-900 dark:border-white" : "border-black/10"
                        }`}
                        style={{ backgroundColor: KITS[k].bg }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {!flags.kits ? <p className="mt-1 text-xs text-neutral-400">Turn on “Team kit colours” to use these.</p> : null}
      </div>

      <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-400">Features (all matches)</div>
      <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
        {FIELD_FEATURE_KEYS.map((k) => (
          <li key={k} className="flex items-center justify-between gap-3 py-2">
            <div>
              <div className="text-sm font-medium">{FIELD_FEATURES[k].label}</div>
              <div className="text-xs text-neutral-500">{FIELD_FEATURES[k].hint}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flags[k]}
              aria-label={FIELD_FEATURES[k].label}
              onClick={() => toggle(k)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${flags[k] ? "bg-emerald-600" : "bg-neutral-300 dark:bg-neutral-700"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${flags[k] ? "left-[22px]" : "left-0.5"}`}
              />
            </button>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
    </details>
  );
}
