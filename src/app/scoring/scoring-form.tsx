"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveScoringConfigAction, type ScoringConfigState } from "./actions";
import type { ScoringConfigView } from "@/lib/scoring-config";

const INITIAL: ScoringConfigState = { ok: false, message: "" };

function NumberField({
  label,
  name,
  defaultValue,
  min,
  step = 1,
  help,
}: {
  label: string;
  name: string;
  defaultValue: number;
  min: number;
  step?: number;
  help?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        step={step}
        className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
      />
      {help ? <span className="mt-1 block text-xs text-neutral-500">{help}</span> : null}
    </label>
  );
}

export function ScoringForm({ config }: { config: ScoringConfigView }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveScoringConfigAction, INITIAL);
  const [statPct, setStatPct] = useState(config.statWeightPct);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const peerPct = 100 - statPct;

  return (
    <form action={formAction} className="mt-6 space-y-8">
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Peer / stats blend</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Configure how peer votes and approved stats combine into a player&apos;s final ranking.
        </p>
        <div className="mt-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <label className="block text-sm">
            <span className="font-medium">Stats weight: {statPct}%</span>
            <input
              type="range"
              name="statWeightPct"
              min={0}
              max={100}
              step={5}
              value={statPct}
              onChange={(e) => setStatPct(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <p className="mt-2 text-sm text-neutral-500">
            Final blend: <span className="font-medium text-neutral-800 dark:text-neutral-200">Peer {peerPct}%</span>{" "}
            / <span className="font-medium text-neutral-800 dark:text-neutral-200">Stats {statPct}%</span>. Peer
            weight is always 100 − stats weight. Stats scoring uses approved goals/assists for matches where
            &quot;Include stats in scoring&quot; is enabled.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Confidence thresholds</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Unranked min matches"
            name="unratedMinMatches"
            defaultValue={config.unratedMinMatches}
            min={0}
            help="Matches played before a player leaves the unranked pool."
          />
          <NumberField
            label="Provisional min valid peer votes"
            name="provisionalMinValidPeerVotes"
            defaultValue={config.provisionalMinValidPeerVotes}
            min={0}
            help="Valid peer votes before a rating stops being provisional."
          />
          <NumberField
            label="Peer full-confidence votes"
            name="peerFullConfidenceVotes"
            defaultValue={config.peerFullConfidenceVotes}
            min={1}
            help="Votes at which peer rating reaches full confidence."
          />
          <NumberField
            label="Match-count full confidence"
            name="matchCountFullConfidence"
            defaultValue={config.matchCountFullConfidence}
            min={1}
            help="Matches at which overall data reaches full confidence."
          />
          <NumberField
            label="Neutral score"
            name="neutralScore"
            defaultValue={config.neutralScore}
            min={0}
            step={1}
            help="Score that low-confidence ratings are damped toward (0–100)."
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Awards thresholds</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Minimum valid votes required for a player to qualify for awards.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Per-match minimum valid votes"
            name="awardsMatchMinValidVotes"
            defaultValue={config.awardsMatchMinValidVotes}
            min={0}
          />
          <NumberField
            label="Overall minimum valid votes"
            name="awardsOverallMinValidVotes"
            defaultValue={config.awardsOverallMinValidVotes}
            min={0}
          />
        </div>
      </section>

      {state.message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
