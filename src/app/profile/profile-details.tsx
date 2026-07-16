"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  updateContactAction,
  uploadPhotoAction,
  removePhotoAction,
  type ContactState,
} from "./actions";

const CONTACT_INIT: ContactState = { ok: false, message: "" };
const PHOTO_TILT = "rotate(-4deg)";

interface ProfileDetailsProps {
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
}

/**
 * Downscale + centre-crop the selected image to a square JPEG on the client so
 * uploads stay small and every avatar is framed consistently.
 */
async function processImage(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
      "image/jpeg",
      0.85,
    );
  });
}

export default function ProfileDetails({
  name,
  position,
  email,
  phone,
  photoUrl,
}: ProfileDetailsProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [contactState, contactAction, contactPending] = useActionState(
    updateContactAction,
    CONTACT_INIT,
  );

  const [currentPhoto, setCurrentPhoto] = useState<string | null>(photoUrl);
  const [photoBusy, startPhoto] = useTransition();
  const [photoMsg, setPhotoMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (contactState.ok) router.refresh();
  }, [contactState, router]);

  useEffect(() => {
    setCurrentPhoto(photoUrl);
  }, [photoUrl]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPhotoMsg(null);
    startPhoto(async () => {
      try {
        const processed = await processImage(file);
        const fd = new FormData();
        fd.append("photo", processed, "photo.jpg");
        const res = await uploadPhotoAction(fd);
        setPhotoMsg({ ok: res.ok, text: res.message });
        if (res.ok) {
          setCurrentPhoto(res.url ?? null);
          router.refresh();
        }
      } catch {
        setPhotoMsg({ ok: false, text: "Could not process that image." });
      }
    });
  }

  function onRemovePhoto() {
    setPhotoMsg(null);
    startPhoto(async () => {
      const res = await removePhotoAction();
      setPhotoMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setCurrentPhoto(null);
        router.refresh();
      }
    });
  }

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      {/* Photo */}
      <div className="flex shrink-0 flex-col items-center gap-3">
        <div
          className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-brand/70 bg-neutral-100 shadow-lg dark:bg-neutral-800"
          style={{ transform: PHOTO_TILT }}
        >
          {currentPhoto ? (
            <Image
              src={currentPhoto}
              alt={name}
              fill
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-neutral-400">
              {initials || "?"}
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickFile}
        />
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
          >
            {photoBusy ? "Working…" : currentPhoto ? "Change photo" : "Upload photo"}
          </button>
          {currentPhoto ? (
            <button
              type="button"
              onClick={onRemovePhoto}
              disabled={photoBusy}
              className="text-xs text-neutral-400 transition hover:text-red-500 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        {photoMsg ? (
          <p
            className={`text-center text-xs ${
              photoMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
            }`}
          >
            {photoMsg.text}
          </p>
        ) : null}
      </div>

      {/* Identity + contact form */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
          {position ? (
            <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
              {position}
            </span>
          ) : null}
        </div>

        <form action={contactAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-500">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={email ?? ""}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
              />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-xs font-medium text-neutral-500">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={phone ?? ""}
                placeholder="+1 555 123 4567"
                autoComplete="tel"
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={contactPending}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {contactPending ? "Saving…" : "Save details"}
            </button>
            {contactState.message ? (
              <span
                className={`text-sm ${
                  contactState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                }`}
              >
                {contactState.message}
              </span>
            ) : (
              <span className="text-xs text-neutral-400">
                Private — only visible to you and admins.
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
