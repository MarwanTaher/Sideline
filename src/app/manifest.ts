import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sideline",
    short_name: "Sideline",
    description: "Leaderboard, matches, and team balancing.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0D0D0D",
    theme_color: "#0D0D0D",
    icons: [
      // Vector for any renderer that prefers it.
      {
        src: "/logo-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // Raster icons — required for Chrome/Android installability.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the installed icon → jump straight to a common task. Keep to
    // the handful of things people do most days.
    shortcuts: [
      {
        name: "Set availability",
        short_name: "Availability",
        url: "/matches",
      },
      {
        name: "Leaderboard",
        short_name: "Leaderboard",
        url: "/leaderboard",
      },
      {
        name: "My profile",
        short_name: "Profile",
        url: "/profile",
      },
    ],
  };
}
