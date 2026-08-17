import sharp from "sharp";

// Brand mark → raster app icons (PWA install + Apple touch). Run after any
// change to the mark/accent: `node scripts/gen-icons.mjs`.
const EMERALD = "#10b981";

const lines = `
  <rect x="50" y="65" width="80" height="6" rx="3" fill="#FFFFFF" />
  <rect x="40" y="97" width="90" height="6" rx="3" fill="#FFFFFF" />
  <rect x="50" y="129" width="80" height="6" rx="3" fill="#FFFFFF" />
  <rect x="145" y="55" width="6" height="90" rx="3" fill="${EMERALD}" />`;

// Rounded tile on a transparent field (browser/Android "any" icons).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="180" height="180" rx="40" fill="#0D0D0D"/>${lines}</svg>`;

// Full-bleed field (maskable + iOS, which apply their own corner mask).
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#0D0D0D"/>${lines}</svg>`;

const targets = [
  { svg: rounded, size: 192, out: "public/icon-192.png" },
  { svg: rounded, size: 512, out: "public/icon-512.png" },
  { svg: fullBleed, size: 512, out: "public/icon-maskable-512.png" },
  { svg: fullBleed, size: 180, out: "public/apple-touch-icon.png" },
];

for (const { svg, size, out } of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
