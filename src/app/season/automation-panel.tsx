"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AutomationConfig, AutomationOccurrence } from "@/lib/match-automation";
import { WEEKDAYS, calendarDates, occurrenceTimes, mergeCalendarDates } from "@/lib/match-recurrence";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/banner";
import { formatMinor } from "@/lib/format-money";
import { automationAction } from "./automation-actions";
import { LocationPicker } from "../matches/location-picker";

type Props = {
  seasonId: number; startDate: string; endDate: string | null; coreCap: number; coreCount: number;
  baseRate: number; extensionRate: number; ready: boolean; isSuper: boolean;
  config: AutomationConfig; occurrences: AutomationOccurrence[];
  audit: Array<{ event: string; actor: string; createdAt: string }>;
  serverNow: number;
};
const inputClass = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
const initial = { ok: false, message: "" };
const localTime = (instant: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", dateStyle: "medium", timeStyle: "short" }).format(new Date(instant));

export default function AutomationPanel(props: Props) {
  const [state, action, pending] = useActionState(automationAction, initial);
  const [weekday, setWeekday] = useState(props.config.weekday);
  const [kickoffTime, setKickoffTime] = useState(props.config.kickoffTime);
  const [openingWeekday, setOpeningWeekday] = useState(props.config.openingWeekday);
  const [openingTime, setOpeningTime] = useState(props.config.openingTime);
  const [capacity, setCapacity] = useState(props.config.maxPlayers);
  let dates: string[] = [];
  let previewError = "";
  try {
    if (props.endDate) dates = calendarDates(props.startDate, props.endDate, weekday);
    for (const date of dates) occurrenceTimes(date, { weekday, kickoffTime, openingWeekday, openingTime });
    if (props.config.scheduledDates) {
      const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Warsaw",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(props.serverNow));
      const cutoff = [today,...props.occurrences.filter((o) => o.matchId != null).map((o) => o.date)].sort().at(-1)!;
      dates = mergeCalendarDates(props.config.scheduledDates,dates,props.occurrences.map((o) => o.date),cutoff);
    }
  } catch (error) {
    previewError = error instanceof Error ? error.message : "Invalid schedule.";
  }
  const byDate = new Map(props.occurrences.map((o) => [o.date, o]));
  const baseDays = dates.filter((date) => !byDate.get(date)?.waiveCost).length;
  const textField = (name: string, label: string, value: string | number, type = "number", min = 1, max = 300) => (
    <label className="block text-sm"><span className="mb-1 block text-neutral-500">{label}</span>
      <input className={inputClass} name={name} type={type} defaultValue={value} required min={min} max={max} />
    </label>
  );
  return (
    <section className="mt-5 space-y-5 pb-12">
      <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-lg font-semibold">Weekly match automation</h2>
        <p className="mt-1 text-sm text-neutral-500">Europe/Warsaw · {props.startDate} to {props.endDate ?? "set a season end date"}</p>
        <p className="mt-2 text-sm">{props.coreCount}/{props.coreCap} existing core subscribers · {formatMinor(props.baseRate)} guaranteed per booking + {formatMinor(props.extensionRate)} optional extension.</p>
        <p className="mt-2 text-sm">Status: <strong>{!props.config.enabled ? "Disabled" : props.config.paused ? "Paused" : props.config.lastError ? "Needs attention" : dates.length && !previewError && Date.parse(occurrenceTimes(dates[dates.length-1], {weekday,kickoffTime,openingWeekday,openingTime}).kickoffAt) < props.serverNow ? "Season finished" : "Enabled"}</strong></p>
        {props.coreCount < props.coreCap ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">The core group is not full. Unoccupied places become available at public opening.</p> : null}
        {!props.ready ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">The existing season go-live checklist is incomplete. Save a draft, then ask a super-admin to confirm readiness before enabling.</p> : null}
        {props.isSuper ? <Link className="mt-2 inline-block text-sm underline" href="/admin/accounts?tab=seasons">Existing core, dates, terms and go-live controls</Link> : null}
        {props.config.lastError ? <FeedbackMessage ok={false} message={props.config.lastError} /> : null}
      </div>
      <form action={action} className="space-y-4 rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <input type="hidden" name="seasonId" value={props.seasonId} />
        <input type="hidden" name="intent" value="save" />
        <h3 className="font-semibold">Schedule and pitch</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Match weekday<select className={inputClass} name="weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
          <label className="text-sm">Kickoff<input className={inputClass} type="time" name="kickoffTime" value={kickoffTime} onChange={(e) => setKickoffTime(e.target.value)} required /></label>
          <label className="text-sm">Public opening weekday<select className={inputClass} name="openingWeekday" value={openingWeekday} onChange={(e) => setOpeningWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
          <label className="text-sm">Public opening time<input className={inputClass} type="time" name="openingTime" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} required /></label>
          {textField("baseMinutes", "Base duration (minutes)", props.config.baseMinutes, "number", 30, 300)}
          {textField("extensionMinutes", "Optional extension (minutes)", props.config.extensionMinutes, "number", 0, 120)}
          <label className="text-sm">Total capacity<input className={inputClass} name="maxPlayers" type="number" min={props.coreCap} max={60} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label>
          {textField("extensionThreshold", "Participants needed for admin-confirmed extension", props.config.extensionThreshold, "number", 1, 60)}
          {textField("numTeams", "Teams", props.config.numTeams, "number", 2, 5)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="statsScoringEnabled" defaultChecked={props.config.statsScoringEnabled} />Stats scoring enabled</label>
        </div>
        <p className="text-sm">Pitch: {props.config.locationName}</p>
        <LocationPicker initialName={props.config.locationName} initialLat={props.config.locationLat}
          initialLng={props.config.locationLng} initialVenue={props.config.venue} />
        <p className="text-sm">{props.coreCap} core + {Math.max(0, capacity - props.coreCap)} public = {capacity} total. Core absences release additional places.</p>
        <p className="text-xs text-neutral-500">Core signup and season reserve offers remain separate. Player changes and seat swaps lock 24 elapsed hours before kickoff. Prices and core commitments reuse existing season controls.</p>
        <p className="text-sm">{dates.length} bookings · {formatMinor(baseDays * props.baseRate)} guaranteed · up to {formatMinor(dates.filter((date) => !["skipped", "cancelled"].includes(byDate.get(date)?.state ?? "")).length * props.extensionRate)} in optional extensions.</p>
        <FeedbackMessage ok={false} message={previewError} />
        <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={props.config.enabled} />Enable automation (creates the first future match)</label>
        <label className="flex items-center gap-2 text-sm"><input name="paused" type="checkbox" defaultChecked={props.config.paused} />Pause creation and scheduled public opening</label>
        <p className="text-xs text-neutral-500">Template edits affect future matches only. Existing responses, kickoff times, payments and invoices are not overwritten.</p>
        <Button type="submit" pending={pending} pendingLabel="Saving..." disabled={!!previewError}>Review and save settings</Button>
      </form>
      <FeedbackMessage ok={state.ok} message={state.message} />
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="seasonId" value={props.seasonId} /><input type="hidden" name="intent" value="retry" />
        <label className="text-sm">Existing draft match ID to link (optional)<input name="linkMatchId" type="number" min={1} className={inputClass} /></label>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Retrying...">Retry / link next match</Button>
      </form>
      <details className="rounded-2xl border border-black/10 p-4 dark:border-white/10" open>
        <summary className="cursor-pointer font-semibold">Contract calendar and occurrence controls</summary>
        <ul className="mt-3 space-y-3">
          {dates.map((date) => {
            const occurrence = byDate.get(date);
            let times: ReturnType<typeof occurrenceTimes> | null = null;
            if (!previewError) times = occurrenceTimes(date, { weekday, kickoffTime, openingWeekday, openingTime });
            return <li key={date} className="rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
              <strong>{date}</strong>{" · "}{occurrence?.state ?? (times && Date.parse(times.kickoffAt) < props.serverNow ? "Missed - not automatically backfilled" : "Planned")}
              {occurrence?.matchId ? <Link className="ml-2 underline" href={`/matches/${occurrence.matchId}/availability`}>Open match #{occurrence.matchId}</Link> : null}
              <p className="mt-1 text-xs text-neutral-500">{occurrence ? `Stored kickoff ${localTime(occurrence.kickoffAt)}; signup ${localTime(occurrence.opensAt)}` : times ? `Kickoff ${localTime(times.kickoffAt)}; signup ${localTime(times.opensAt)}; lock ${localTime(times.locksAt)}` : "Fix the schedule to preview deadlines."}</p>
              {occurrence?.notificationError ? <FeedbackMessage ok={false} message={`Notification retry needed: ${occurrence.notificationError}`} /> : null}
              {occurrence?.matchId && occurrence.state === "scheduled" ? <div className="mt-2 flex flex-wrap gap-2">{(["restore", "apply"] as const).map((intent) => <form action={action} key={intent}><input type="hidden" name="seasonId" value={props.seasonId} /><input type="hidden" name="matchId" value={occurrence.matchId!} /><input type="hidden" name="intent" value={intent} /><Button size="sm" variant="secondary" pending={pending} pendingLabel="Updating...">{intent === "restore" ? "Restore scheduled opening" : "Apply pitch/capacity template"}</Button></form>)}</div> : null}
            </li>;
          })}
        </ul>
      </details>
      <form action={action} className="space-y-3 rounded-2xl border border-amber-500/30 p-4">
        <input type="hidden" name="seasonId" value={props.seasonId} /><input type="hidden" name="intent" value="skip" />
        <h3 className="font-semibold">Skip / cancel a booking</h3>
        <label className="block text-sm">Scheduled date<select name="date" className={inputClass}>{dates.map((date) => <option key={date}>{date}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="cost" value="keep" defaultChecked />Keep the guaranteed pitch cost (default contract obligation)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="cost" value="waive" />Pitch provider waived the base cost</label>
        <p className="text-xs text-neutral-500">This closes a linked match and advances automation. Already-issued invoices and confirmed extension costs require explicit admin billing review; they are not silently changed.</p>
        <Button variant="danger" pending={pending} pendingLabel="Cancelling...">Confirm skip / cancellation</Button>
      </form>
      <div><h3 className="font-semibold">Recent activity</h3><ul className="mt-2 space-y-2 text-xs text-neutral-500">{props.audit.map((entry, i) => <li key={i}>{localTime(entry.createdAt)} · {entry.event} · {entry.actor}</li>)}</ul></div>
    </section>
  );
}
