"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { StoryViewer } from "@/components/story-viewer";
import type { StoryGroup, StoryItem, StoryViewer as Viewer } from "@/lib/stories";
import {
  deleteStoryAction,
  getStoryViewersAction,
  markStoryViewedAction,
  postStoryAction,
  reactToStoryAction,
} from "@/app/stories-actions";

const REACTIONS = ["🔥", "😂", "👏", "⚽", "😮", "❤️"];
const MAX_LIVE = 5;
const MAX_CAPTION = 120;

type Props = {
  groups: StoryGroup[];
  me: { name: string; photoUrl: string | null };
  canModerate: boolean;
  match: { id: number; label: string } | null;
};

/** Home: 24-hour photo stories row, composer and full-screen viewer (S-1). */
export function StoriesRow({ groups, me, canModerate, match }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());

  const mine = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);
  const ordered = mine ? [mine, ...others] : others;
  const isSeen = (s: StoryItem) => s.seen || seen.has(s.id);
  const groupSeen = (g: StoryGroup) => g.isMine || g.stories.every(isSeen);

  const close = useCallback(() => {
    setOpen(null);
    router.refresh();
  }, [router]);
  const markSeen = useCallback((id: number) => setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);

  return (
    <>
      <div className="-mx-4 mb-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <button
              type="button"
              aria-label={mine ? "View your story" : "Add a story"}
              onClick={() => (mine ? setOpen(0) : setComposing(true))}
              className="block rounded-full"
            >
              <StoryRing variant={mine ? "seen" : "empty"}>
                <Avatar name={me.name} photoUrl={me.photoUrl} size="lg" />
              </StoryRing>
            </button>
            <button
              type="button"
              aria-label="Add a story"
              onClick={() => setComposing(true)}
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold leading-none text-white ring-2 ring-white dark:ring-neutral-950"
            >
              +
            </button>
          </div>
          <span className="w-full truncate text-center text-[11px] text-neutral-500">Your story</span>
        </div>

        {others.map((g) => {
          const fresh = !groupSeen(g);
          return (
            <button
              key={g.playerId}
              type="button"
              onClick={() => setOpen(ordered.indexOf(g))}
              className="flex w-16 shrink-0 flex-col items-center gap-1"
            >
              <StoryRing variant={fresh ? "fresh" : "seen"}>
                <Avatar name={g.name} photoUrl={g.photoUrl} size="lg" />
              </StoryRing>
              <span className={`w-full truncate text-center text-[11px] ${fresh ? "font-semibold" : "text-neutral-500"}`}>
                {g.name.split(/\s+/)[0]}
              </span>
            </button>
          );
        })}
      </div>

      {open != null && ordered[open] ? (
        <GroupViewer
          key={ordered[open].playerId}
          group={ordered[open]}
          canModerate={canModerate}
          isSeen={isSeen}
          onSeen={markSeen}
          onClose={close}
          onEnd={() => {
            const next = ordered.findIndex((g, i) => i > open && !groupSeen(g));
            if (next >= 0) setOpen(next);
            else close();
          }}
        />
      ) : null}

      {composing ? (
        <Composer
          match={match}
          liveCount={mine?.stories.length ?? 0}
          onClose={() => setComposing(false)}
          onPosted={() => {
            setComposing(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/** Fixed-size concentric ring: 48px avatar + 3px gap + 3px ring = 60px, centred on a grid. */
function StoryRing({ variant, children }: { variant: "fresh" | "seen" | "empty"; children: ReactNode }) {
  const ring =
    variant === "fresh"
      ? "bg-gradient-to-tr from-emerald-500 via-lime-400 to-amber-400"
      : variant === "seen"
        ? "bg-neutral-300 dark:bg-neutral-700"
        : "border-2 border-dashed border-neutral-300 dark:border-neutral-700";
  return (
    <span className={`grid h-[60px] w-[60px] place-items-center rounded-full ${ring}`}>
      <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-white dark:bg-neutral-950">
        {children}
      </span>
    </span>
  );
}

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${Math.max(1, min)}m` : `${Math.floor(min / 60)}h`;
}

function matchDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function GroupViewer({
  group,
  canModerate,
  isSeen,
  onSeen,
  onClose,
  onEnd,
}: {
  group: StoryGroup;
  canModerate: boolean;
  isSeen: (s: StoryItem) => boolean;
  onSeen: (id: number) => void;
  onClose: () => void;
  onEnd: () => void;
}) {
  const router = useRouter();
  const [reactions, setReactions] = useState<Record<number, string | null>>({});
  const [sheet, setSheet] = useState<{ storyId: number; viewers: Viewer[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [start] = useState(() => {
    const i = group.stories.findIndex((s) => !isSeen(s));
    return i < 0 ? 0 : i;
  });

  const stories = useRef(group.stories);
  const onIndex = useCallback(
    (i: number) => {
      const s = stories.current[i];
      if (!s || group.isMine || s.seen) return;
      onSeen(s.id);
      void markStoryViewedAction(s.id);
    },
    [group.isMine, onSeen],
  );

  const react = (s: StoryItem, emoji: string) => {
    const current = s.id in reactions ? reactions[s.id] : s.myReaction;
    const next = current === emoji ? null : emoji;
    setReactions((r) => ({ ...r, [s.id]: next }));
    navigator.vibrate?.(15);
    void reactToStoryAction(s.id, next).then((res) => {
      if (!res.ok) setReactions((r) => ({ ...r, [s.id]: current }));
    });
  };

  const openViewers = async (storyId: number) => {
    setSheet({ storyId, viewers: null });
    const viewers = await getStoryViewersAction(storyId);
    setSheet((cur) => (cur && cur.storyId === storyId ? { storyId, viewers: viewers ?? [] } : cur));
  };

  const remove = async (storyId: number) => {
    if (!window.confirm("Delete this story?")) return;
    setBusy(true);
    const res = await deleteStoryAction(storyId);
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Could not delete.");
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <StoryViewer
      count={group.stories.length}
      startIndex={start}
      durationMs={10_000}
      hold={sheet != null || busy}
      onIndex={onIndex}
      onEnd={onEnd}
      onClose={onClose}
      closeLabel="Close story"
      render={(i) => {
        const s = group.stories[i];
        const mineReaction = s.id in reactions ? reactions[s.id] : s.myReaction;
        return (
          <div className="relative h-full w-full bg-neutral-950">
            <Image src={s.imageUrl} alt={s.caption ?? `${group.name}'s story`} fill unoptimized className="object-contain" />

            <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pr-14 pt-[max(1.75rem,calc(env(safe-area-inset-top)+1.25rem))] text-white">
              <Avatar name={group.name} photoUrl={group.photoUrl} size="sm" />
              <span className="truncate text-sm font-semibold drop-shadow">{group.isMine ? "Your story" : group.name}</span>
              <span className="text-xs text-white/70 drop-shadow">{ago(s.createdAt)}</span>
              {s.matchId && s.matchPlayedOn ? (
                <Link
                  href={`/matches/${s.matchId}`}
                  className="ml-1 truncate rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur hover:bg-white/30"
                >
                  ⚽ {matchDate(s.matchPlayedOn)}
                </Link>
              ) : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16 text-white">
              {s.caption ? <p className="mb-3 text-center text-base font-medium drop-shadow">{s.caption}</p> : null}
              {group.isMine ? (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => void openViewers(s.id)}
                    className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/25"
                  >
                    👁 Seen by
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(s.id)}
                    className="rounded-full px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-white/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  {REACTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-label={`React ${e}`}
                      aria-pressed={mineReaction === e}
                      onClick={() => react(s, e)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl transition active:scale-90 ${
                        mineReaction === e ? "scale-110 bg-white/35 ring-2 ring-white" : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                  {canModerate ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="Delete story (admin)"
                      onClick={() => void remove(s.id)}
                      className="ml-1 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg text-red-300 hover:bg-white/20 disabled:opacity-50"
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {sheet && sheet.storyId === s.id ? (
              <div className="absolute inset-x-0 bottom-0 z-30 max-h-[60%] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-neutral-900 dark:bg-neutral-900 dark:text-white">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Seen by {sheet.viewers ? sheet.viewers.length : "…"}
                  </h3>
                  <button type="button" onClick={() => setSheet(null)} className="rounded-full px-2 py-1 text-sm text-neutral-500 hover:bg-black/5">
                    Done
                  </button>
                </div>
                {sheet.viewers && sheet.viewers.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nobody yet.</p>
                ) : null}
                <ul className="space-y-2">
                  {(sheet.viewers ?? []).map((v, vi) => (
                    <li key={vi} className="flex items-center gap-3">
                      <Avatar name={v.name} photoUrl={v.photoUrl} size="sm" />
                      <span className="flex-1 truncate text-sm">{v.name}</span>
                      {v.emoji ? <span className="text-xl">{v.emoji}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      }}
    />
  );
}

/** Downscale on the phone so uploads stay ~150–300 KB. */
async function resizeImage(file: File, max = 1080): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let quality = 0.82;
  for (;;) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("encode failed");
    if (blob.size <= 950 * 1024 || quality <= 0.4) return blob;
    quality -= 0.15;
  }
}

function Composer({
  match,
  liveCount,
  onClose,
  onPosted,
}: {
  match: { id: number; label: string } | null;
  liveCount: number;
  onClose: () => void;
  onPosted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [linkMatch, setLinkMatch] = useState(match != null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = liveCount >= MAX_LIVE;

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const blob = await resizeImage(file);
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("Couldn't read that photo. Try a JPEG or PNG.");
    }
  };

  const share = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("image", new File([image.blob], "story.jpg", { type: "image/jpeg" }));
    fd.set("caption", caption);
    if (linkMatch && match) fd.set("matchId", String(match.id));
    const res = await postStoryAction(fd).catch(() => ({ ok: false, error: "Could not post the story." }));
    setBusy(false);
    if (res.ok) onPosted();
    else setError(res.error ?? "Could not post the story.");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="New story">
      <div className="m-0 w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:m-3 sm:rounded-3xl dark:bg-neutral-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">New story</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5">
            Cancel
          </button>
        </div>

        {full ? (
          <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            You already have {MAX_LIVE} live stories. Delete one or wait for one to expire.
          </p>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex aspect-[4/5] max-h-[50vh] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
            >
              {image ? (
                <Image src={image.url} alt="Preview" fill unoptimized className="object-contain" />
              ) : (
                <span>📷 Take or choose a photo</span>
              )}
            </button>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={caption}
                maxLength={MAX_CAPTION}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption…"
                className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-neutral-950"
              />
              <span className="w-12 text-right text-[11px] tabular-nums text-neutral-400">
                {caption.length}/{MAX_CAPTION}
              </span>
            </div>
            {match ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={linkMatch} onChange={(e) => setLinkMatch(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                Link to {match.label}
              </label>
            ) : null}
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={!image || busy}
              onClick={() => void share()}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? "Sharing…" : "Share for 24h"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
