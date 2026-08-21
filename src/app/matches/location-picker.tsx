"use client";

import { useState, useTransition } from "react";
import { searchPlacesAction } from "./actions";
import { googleMapsUrl, osmEmbedUrl } from "@/lib/geo-links";
import type { PlaceResult } from "@/lib/geo";

const inputCls =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

export function LocationPicker({
  initialName = "",
  initialLat = null,
  initialLng = null,
}: {
  initialName?: string;
  initialLat?: number | null;
  initialLng?: number | null;
}) {
  const [name, setName] = useState(initialName);
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasLoc = lat != null && lng != null;
  const shortName = name.split(",")[0]?.trim() || name;

  function runSearch() {
    const q = query.trim();
    if (q.length < 3) return;
    startTransition(async () => {
      const res = await searchPlacesAction(q);
      setResults(res);
      setSearched(true);
    });
  }

  function pick(p: PlaceResult) {
    setName(p.name);
    setLat(p.lat);
    setLng(p.lng);
    setResults([]);
    setQuery("");
    setSearched(false);
  }

  function clear() {
    setName("");
    setLat(null);
    setLng(null);
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Field location</span>

      {/* Submitted with the parent form */}
      <input type="hidden" name="locationName" value={name} />
      <input type="hidden" name="locationLat" value={lat ?? ""} />
      <input type="hidden" name="locationLng" value={lng ?? ""} />

      {hasLoc ? (
        <div className="rounded-xl border border-black/[0.06] bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{shortName}</p>
              <p className="truncate text-xs text-neutral-500">{name}</p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 rounded-lg border border-black/15 px-2.5 py-1 text-xs font-medium transition hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-neutral-800"
            >
              Change
            </button>
          </div>
          <iframe
            title="Location preview"
            src={osmEmbedUrl(lat, lng)}
            className="mt-3 h-40 w-full rounded-lg border border-black/10 dark:border-white/10"
            loading="lazy"
          />
          <a
            href={googleMapsUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-400"
          >
            Open in Google Maps <span aria-hidden>↗</span>
          </a>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Search a pitch, park or address…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={pending || query.trim().length < 3}
              className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? "…" : "Search"}
            </button>
          </div>

          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-black/5 overflow-hidden rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
              {results.map((p, i) => (
                <li key={`${p.lat},${p.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="w-full px-3 py-2 text-left text-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : searched && !pending ? (
            <p className="mt-2 text-xs text-neutral-500">No matches. Try a more specific name.</p>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              Optional. Search picks the exact spot so players get directions and a matchday forecast.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
