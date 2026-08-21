import "server-only";

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Free place search via OpenStreetMap Nominatim (no API key). Results are
 * cached to respect Nominatim's fair-use policy. Returns [] on any failure so
 * callers can degrade gracefully.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Sideline football app (availability + matchday)",
        "Accept-Language": "en",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return data
      .map((d) => ({ name: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}
