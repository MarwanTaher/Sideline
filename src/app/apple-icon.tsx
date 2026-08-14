import { ImageResponse } from "next/og";

// Apple touch icon (iOS applies its own rounded-corner mask).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0D0D0D",
          display: "flex",
          position: "relative",
        }}
      >
        {/* Speed lines (white) */}
        <div
          style={{
            position: "absolute",
            left: 45,
            top: 58,
            width: 72,
            height: 6,
            background: "#FFFFFF",
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 36,
            top: 87,
            width: 81,
            height: 6,
            background: "#FFFFFF",
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 45,
            top: 116,
            width: 72,
            height: 6,
            background: "#FFFFFF",
            borderRadius: 3,
          }}
        />
        {/* Vertical accent (brand emerald) */}
        <div
          style={{
            position: "absolute",
            left: 131,
            top: 50,
            width: 6,
            height: 81,
            background: "#059669",
            borderRadius: 3,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
