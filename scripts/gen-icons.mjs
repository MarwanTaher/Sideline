// One-off icon generator: rasterises the brand mark into the PNG sizes that
// Android/Chrome and iOS need for install/home-screen. Run with `node scripts/gen-icons.mjs`.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const publicDir = join(process.cwd(), "public");
const BG = "#0D0D0D";

// The brand mark (rounded square + pitch lines) on a 200x200 viewBox.
const mark = readFileSync(join(publicDir, "logo-mark.svg"));

// Full-bleed variant: the mark scaled onto a solid square so maskable/iOS icons
// have no transparent corners (iOS/Android apply their own mask).
function fullBleedSvg(inner) {
  // inner = fraction of the canvas the mark occupies (safe zone for maskable).
  const pad = (1 - inner) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
      `<rect width="200" height="200" fill="${BG}"/>` +
      `<g transform="translate(${pad * 200},${pad * 200}) scale(${inner})">` +
      `<rect x="50" y="65" width="80" height="6" fill="#FFFFFF"/>` +
      `<rect x="40" y="97" width="90" height="6" fill="#FFFFFF"/>` +
      `<rect x="50" y="129" width="80" height="6" fill="#FFFFFF"/>` +
      `<rect x="145" y="55" width="6" height="90" fill="#A6CE39"/>` +
      `</g></svg>`,
  );
}

async function render(svg, size, out, bg) {
  let img = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  await img.png().toFile(join(publicDir, out));
  console.log("wrote", out);
}

await render(mark, 192, "icon-192.png");
await render(mark, 512, "icon-512.png");
// Maskable: mark within the ~80% safe zone on an opaque background.
await render(fullBleedSvg(0.72), 512, "icon-maskable-512.png");
// iOS home-screen icon: opaque, full-bleed, slightly larger mark.
await render(fullBleedSvg(0.86), 180, "apple-touch-icon.png");
