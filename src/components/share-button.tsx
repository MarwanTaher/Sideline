"use client";

import { useState } from "react";
import { waMeUrl } from "@/lib/share";

interface ShareButtonProps {
  /** Message body to share. A URL should already be embedded in the text. */
  text: string;
  /** Optional title used by the native share sheet. */
  title?: string;
  /** Optional explicit URL passed to the native share sheet. */
  url?: string;
  /** Button label. Defaults to "Share to WhatsApp". */
  label?: string;
  className?: string;
}

/**
 * One-tap share. Prefers the native share sheet (`navigator.share`) so mobile
 * users land straight in WhatsApp; falls back to a `wa.me` deep link on
 * desktop or unsupported browsers.
 */
export function ShareButton({
  text,
  title,
  url,
  label = "Share to WhatsApp",
  className,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareData: ShareData = { text, ...(title ? { title } : {}), ...(url ? { url } : {}) };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to wa.me.
      }
    }
    if (typeof window !== "undefined") {
      window.open(waMeUrl(text), "_blank", "noopener,noreferrer");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleShare}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#1fb457]"
        }
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.35-.5.05-.98.23-3.3-.69-2.79-1.1-4.56-3.96-4.7-4.15-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.24-.27.53-.34.71-.34.18 0 .36 0 .51.01.16.01.39-.06.6.46.24.58.79 1.94.86 2.08.07.14.12.3.02.49-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.18-.27.36-.23.6-.14.24.09 1.55.73 1.81.86.27.14.44.21.51.32.07.11.07.66-.17 1.34Z" />
        </svg>
        {label}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg border border-black/15 px-2.5 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-900"
        title="Copy message"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
