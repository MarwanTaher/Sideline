"use client";

import { useRef, useState, useTransition } from "react";
import { playFart } from "@/lib/silly-sounds";
import { MomentCard, MomentsOverlay } from "@/components/moments-overlay";
import {
  COPY_LIMITS,
  MOMENT_KINDS,
  MOMENT_KIND_INFO,
  defaultMomentView,
  momentView,
  sanitizeVariants,
  type CopyVariant,
  type Moment,
  type MomentCopyOverrides,
  type MomentKind,
} from "@/lib/moment-copy";
import {
  deleteTapSoundAction,
  saveMomentCopyAction,
  setTapSpamEnabledAction,
  uploadTapSoundAction,
} from "./messages-actions";

const sampleMoment = (kind: MomentKind): Moment => ({
  id: 0,
  kind,
  matchId: 0,
  payload: MOMENT_KIND_INFO[kind].sample,
  createdAt: "",
});

const input =
  "w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-neutral-950";

/** Admin control › Messages: rewrite the celebration and bummer pop-ups. */
export default function MessagesAdmin({
  overrides,
  name,
  tapSpam,
}: {
  overrides: MomentCopyOverrides;
  name: string;
  tapSpam: { enabled: boolean; sounds: { url: string; name: string }[] };
}) {
  const groups = [
    { key: "celebration", title: "Celebrations" },
    { key: "bummer", title: "Bummers" },
  ] as const;
  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm text-neutral-500">
        Write your own pop-up text. Add a few versions and one is picked at random. Types without custom
        text keep the built-in messages.
      </p>
      <TapSoundsAdmin enabled={tapSpam.enabled} sounds={tapSpam.sounds} />
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{g.title}</h2>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-neutral-900">
            {MOMENT_KINDS.filter((k) => MOMENT_KIND_INFO[k].group === g.key).map((kind) => (
              <KindEditor key={kind} kind={kind} saved={overrides[kind] ?? []} name={name} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KindEditor({ kind, saved, name }: { kind: MomentKind; saved: CopyVariant[]; name: string }) {
  const info = MOMENT_KIND_INFO[kind];
  const [variants, setVariants] = useState<CopyVariant[]>(saved);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [playing, setPlaying] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const def = defaultMomentView(sampleMoment(kind));
  const dirty = JSON.stringify(variants) !== JSON.stringify(saved);

  const update = (i: number, patch: Partial<CopyVariant>) =>
    setVariants((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const save = (next: CopyVariant[]) =>
    start(async () => {
      const res = await saveMomentCopyAction(kind, next);
      if (res.ok) {
        setVariants(sanitizeVariants(next));
        setPreviewIdx(0);
      }
      setMsg(res.ok ? { ok: true, text: next.length ? "Saved" : "Back to default" } : { ok: false, text: res.error ?? "Error" });
    });

  const shown = variants[Math.min(previewIdx, variants.length - 1)];
  const preview = shown
    ? momentView({ ...sampleMoment(kind), id: 0 }, { overrides: { [kind]: [shown] }, name })
    : def;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="text-xl">{def.emoji}</span>
        <span className="flex-1 text-sm font-medium">{info.label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            saved.length
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-neutral-500/10 text-neutral-500"
          }`}
        >
          {saved.length ? `Custom · ${saved.length}` : "Default"}
        </span>
        <span className="text-neutral-400 transition group-open:rotate-90">›</span>
      </summary>

      <div className="space-y-3 px-4 pb-4">
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-950">
          <span className="font-medium">Built-in:</span> {def.title} — {def.body}
        </p>

        {variants.map((v, i) => (
          <div
            key={i}
            onFocusCapture={() => setPreviewIdx(i)}
            className={`space-y-2 rounded-xl border p-3 ${
              i === previewIdx ? "border-emerald-500/50" : "border-black/10 dark:border-white/10"
            }`}
          >
            <div className="flex gap-2">
              <input
                aria-label="Emoji"
                placeholder={def.emoji}
                value={v.emoji ?? ""}
                maxLength={16}
                onChange={(e) => update(i, { emoji: e.target.value })}
                className={`${input} w-16 text-center`}
              />
              <input
                aria-label="Title"
                placeholder="Title"
                value={v.title}
                maxLength={COPY_LIMITS.title}
                onChange={(e) => update(i, { title: e.target.value })}
                className={input}
              />
              <button
                type="button"
                aria-label="Remove version"
                onClick={() => setVariants((list) => list.filter((_, j) => j !== i))}
                className="rounded-lg px-2 text-neutral-400 hover:bg-black/5 hover:text-red-600 dark:hover:bg-white/5"
              >
                ✕
              </button>
            </div>
            <textarea
              aria-label="Message"
              placeholder="Message"
              rows={2}
              value={v.body}
              maxLength={COPY_LIMITS.body}
              onChange={(e) => update(i, { body: e.target.value })}
              className={input}
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {variants.length < COPY_LIMITS.variants ? (
            <button
              type="button"
              onClick={() => {
                setVariants((list) => [...list, { title: "", body: "" }]);
                setPreviewIdx(variants.length);
              }}
              className="rounded-lg border border-dashed border-black/20 px-2.5 py-1.5 font-medium text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              + Add version
            </button>
          ) : null}
          <span>
            Placeholders:{" "}
            {info.placeholders.map((p) => (
              <code key={p} className="mr-1 rounded bg-neutral-100 px-1 dark:bg-neutral-800">{`{${p}}`}</code>
            ))}
          </span>
        </div>

        <div className="relative flex justify-center rounded-2xl bg-neutral-900/80 py-2">
          <MomentCard view={preview} animate={false} />
          <button
            type="button"
            onClick={() => setPlaying((n) => n + 1)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-lg transition hover:bg-emerald-50 active:scale-95"
          >
            ▶ Play
          </button>
        </div>
        {playing > 0 ? (
          <MomentsOverlay
            key={playing}
            moments={[{ ...sampleMoment(kind), id: 0 }]}
            overrides={shown ? { [kind]: [shown] } : undefined}
            name={name}
            preview
            onClose={() => setPlaying(0)}
          />
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => save(variants)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {saved.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => save([])}
              className="rounded-xl px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-black/5 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              Reset to default
            </button>
          ) : null}
          {msg ? (
            <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function TapSoundsAdmin({ enabled, sounds }: { enabled: boolean; sounds: { url: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Error"));
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("sound", file);
    run(() => uploadTapSoundAction(fd));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Tap-spam sound</h2>
      <div className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Play a sound on IN / OUT spam</span>
            <span className="block text-xs text-neutral-500">
              Once someone taps 3 times within 1.5 s, every further tap plays it (with vibration and smoke) until they
              stop for a second. That phone only. Players can mute it in Profile.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={pending}
            onClick={() => run(() => setTapSpamEnabledAction(!enabled))}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
              enabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>

        <ul className="space-y-1.5 text-sm">
          {sounds.length === 0 ? (
            <li className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950">
              <span className="text-neutral-500">Default: 3 random fart sounds</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => playFart(i)}
                    className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    ▶ {i + 1}
                  </button>
                ))}
              </span>
            </li>
          ) : (
            sounds.map((s) => (
              <li key={s.url} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950">
                <span className="flex-1 truncate">{s.name}</span>
                <button
                  type="button"
                  onClick={() => void new Audio(s.url).play().catch(() => {})}
                  className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                >
                  ▶ Play
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteTapSoundAction(s.url))}
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>

        {sounds.length < 3 ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".mp3,.ogg,.m4a,audio/mpeg,audio/ogg,audio/mp4,audio/x-m4a,audio/aac"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-neutral-800"
            >
              {pending ? "Working…" : "Upload a sound"}
            </button>
            <span className="text-xs text-neutral-500">MP3 / OGG / M4A, max 200 KB, up to 3. Custom sounds replace the default.</span>
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
