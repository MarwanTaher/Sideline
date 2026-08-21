// Client-safe helpers for building map links/embeds (no server-only imports).

/** Deep link that opens the coordinates in the Google Maps app / site. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** OpenStreetMap embeddable map (no API key) centered on the marker. */
export function osmEmbedUrl(lat: number, lng: number): string {
  const d = 0.006;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}
