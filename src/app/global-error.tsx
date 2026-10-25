"use client";

import { useEffect } from "react";

/**
 * Root error boundary — catches errors thrown in the root layout itself (which
 * a route-level `error.tsx` cannot). It must render its own <html>/<body>.
 * Without it, a crash in the layout tree produces a fully blank page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#0d0d0d",
          color: "#f5f5f5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "22rem", fontSize: "0.875rem", color: "#a3a3a3", margin: 0 }}>
          The app hit an unexpected error while loading. Please reload the page.
        </p>
        {error.digest ? (
          <p style={{ fontSize: "0.75rem", color: "#737373", margin: 0 }}>
            Ref: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#ffffff",
            color: "#0d0d0d",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
