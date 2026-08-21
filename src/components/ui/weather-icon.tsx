import * as React from "react";

/**
 * Line-style weather icons matching the app's icon language (1.8px rounded
 * strokes) with tasteful accents: amber sun/lightning, sky-blue rain, slate
 * snow, cloud in currentColor so it adapts to the theme.
 */
export type WeatherIconProps = {
  code: number;
  className?: string;
};

const AMBER = "#f59e0b";
const SKY = "#0ea5e9";
const SLATE = "#94a3b8";

const cloud = (
  <path
    d="M7 17.5h8.2a3.3 3.3 0 0 0 .4-6.57 4.4 4.4 0 0 0-8.43-1.2A3.15 3.15 0 0 0 7 17.5z"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinejoin="round"
  />
);

function Sun({ cx = 12, cy = 12, r = 4 }: { cx?: number; cy?: number; r?: number }) {
  const ray = r + 2.5;
  const d = r + 4.5;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={AMBER} strokeWidth="1.8" />
      <g stroke={AMBER} strokeWidth="1.8" strokeLinecap="round">
        <path d={`M${cx} ${cy - d}v${d - ray}`} />
        <path d={`M${cx} ${cy + ray}v${d - ray}`} />
        <path d={`M${cx - d} ${cy}h${d - ray}`} />
        <path d={`M${cx + ray} ${cy}h${d - ray}`} />
        <path d={`M${cx - d * 0.7} ${cy - d * 0.7}l${(d - ray) * 0.7} ${(d - ray) * 0.7}`} />
        <path d={`M${cx + ray * 0.7} ${cy + ray * 0.7}l${(d - ray) * 0.7} ${(d - ray) * 0.7}`} />
        <path d={`M${cx + d * 0.7} ${cy - d * 0.7}l-${(d - ray) * 0.7} ${(d - ray) * 0.7}`} />
        <path d={`M${cx - ray * 0.7} ${cy + ray * 0.7}l-${(d - ray) * 0.7} ${(d - ray) * 0.7}`} />
      </g>
    </>
  );
}

function Rain({ heavy = false }: { heavy?: boolean }) {
  const drops = heavy ? [7.5, 12, 16.5] : [9, 15];
  return (
    <g stroke={SKY} strokeWidth="1.8" strokeLinecap="round">
      {drops.map((x) => (
        <path key={x} d={`M${x} 19l-1 2.5`} />
      ))}
    </g>
  );
}

function Snow() {
  return (
    <g stroke={SLATE} strokeWidth="1.6" strokeLinecap="round">
      {[8, 12, 16].map((x) => (
        <React.Fragment key={x}>
          <path d={`M${x} 19.3v2.6`} />
          <path d={`M${x - 1.1} 19.9l2.2 1.4`} />
          <path d={`M${x + 1.1} 19.9l-2.2 1.4`} />
        </React.Fragment>
      ))}
    </g>
  );
}

function Bolt() {
  return <path d="M12.5 18l-2.5 3.5h2.2L11.5 24l3.5-4.2h-2.2z" fill={AMBER} />;
}

function Fog() {
  return (
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
      <path d="M6 19.5h9" />
      <path d="M8 22h8" />
    </g>
  );
}

/** WMO weather code → the glyph shown. */
export function WeatherIcon({ code, className = "h-5 w-5" }: WeatherIconProps) {
  let glyph: React.ReactNode;

  if (code === 0) {
    glyph = <Sun />;
  } else if (code === 1 || code === 2) {
    glyph = (
      <>
        <Sun cx={9} cy={8} r={2.6} />
        {cloud}
      </>
    );
  } else if (code === 3 || code === 45 || code === 48) {
    glyph = (
      <>
        {cloud}
        {code !== 3 ? <Fog /> : null}
      </>
    );
  } else if (code >= 51 && code <= 57) {
    glyph = (
      <>
        {cloud}
        <Rain />
      </>
    );
  } else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    glyph = (
      <>
        {cloud}
        <Rain heavy />
      </>
    );
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    glyph = (
      <>
        {cloud}
        <Snow />
      </>
    );
  } else if (code >= 95) {
    glyph = (
      <>
        {cloud}
        <Bolt />
      </>
    );
  } else {
    glyph = cloud;
  }

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden="true">
      {glyph}
    </svg>
  );
}
