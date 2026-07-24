/**
 * Client-safe WhatsApp / Web Share helpers. Pure functions, no server imports,
 * so they can be used from both client components and server code.
 *
 * The group lives on WhatsApp, so sharing flows there: we never build an in-app
 * comment thread. `navigator.share()` opens the native sheet (user picks
 * WhatsApp); the `wa.me` link is the universal fallback that also works on
 * desktop.
 */

/** Build a `wa.me` deep link that pre-fills a message (and any link within it). */
export function waMeUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}


