/**
 * Minimal, dependency-free Markdown -> styled HTML renderer used to produce the
 * review PDFs. Supports only the subset used by the review docs: ATX headings,
 * bold, inline code, links, pipe tables, ordered/unordered lists, blockquotes,
 * horizontal rules and paragraphs. Not a general Markdown engine.
 *
 * Usage: node scripts/md-to-html.mjs <input.md> <output.html> "<Doc Title>"
 */
import { readFileSync, writeFileSync } from "node:fs";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline: `code`, **bold**, [text](url). Order matters. */
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t, href) => `<a href="${href}">${t}</a>`,
  );
  return out;
}

function renderTable(rows) {
  // rows: array of raw "| a | b |" lines; row[1] is the --- separator.
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = cells(rows[0]);
  const aligns = cells(rows[1]).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    if (l && r) return "center";
    if (r) return "right";
    return "left";
  });
  let html = '<table><thead><tr>';
  header.forEach((h, i) => {
    html += `<th style="text-align:${aligns[i] || "left"}">${inline(h)}</th>`;
  });
  html += "</tr></thead><tbody>";
  for (let r = 2; r < rows.length; r++) {
    const c = cells(rows[r]);
    html += "<tr>";
    c.forEach((cell, i) => {
      html += `<td style="text-align:${aligns[i] || "left"}">${inline(cell)}</td>`;
    });
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (/^\s*$/.test(line)) {
      flushPara();
      i++;
      continue;
    }
    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      flushPara();
      out.push("<hr />");
      i++;
      continue;
    }
    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }
    // Table (needs a separator row next)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      flushPara();
      const tbl = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        tbl.push(lines[i]);
        i++;
      }
      out.push(renderTable(tbl));
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      out.push("<ul>");
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push("</ul>");
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      out.push("<ol>");
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push("</ol>");
      continue;
    }
    // Paragraph text
    para.push(line.trim());
    i++;
  }
  flushPara();
  return out.join("\n");
}

const CSS = `
  :root { --ink:#14181f; --muted:#5b6472; --line:#e2e6ec; --accent:#1f6feb; --accent-soft:#eef4ff; --code-bg:#f4f6f9; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:"Segoe UI",-apple-system,Helvetica,Arial,sans-serif; color:var(--ink); line-height:1.55; font-size:10.8pt; margin:0; padding:0 46px 56px; }
  h1 { font-size:24pt; letter-spacing:-0.02em; margin:34px 0 4px; }
  h1:first-child { margin-top:8px; }
  h2 { font-size:15pt; margin:26px 0 8px; padding-bottom:6px; border-bottom:2px solid var(--accent); letter-spacing:-0.01em; page-break-after:avoid; }
  h3 { font-size:12pt; margin:18px 0 4px; page-break-after:avoid; }
  h4 { font-size:10.8pt; margin:12px 0 4px; }
  p { margin:7px 0; }
  ul,ol { margin:7px 0; padding-left:22px; }
  li { margin:3px 0; }
  a { color:var(--accent); text-decoration:none; }
  code { font-family:"Cascadia Code","Consolas",monospace; background:var(--code-bg); border-radius:4px; padding:1px 5px; font-size:9.4pt; }
  strong { font-weight:600; }
  hr { border:none; border-top:1px solid var(--line); margin:20px 0; }
  blockquote { margin:12px 0; padding:8px 14px; border-left:4px solid var(--accent); background:var(--accent-soft); border-radius:0 6px 6px 0; color:var(--ink); }
  table { width:100%; border-collapse:collapse; margin:12px 0; font-size:9.6pt; page-break-inside:avoid; }
  th,td { border:1px solid var(--line); padding:6px 9px; vertical-align:top; }
  th { background:#f7f9fc; font-weight:600; }
  tbody tr:nth-child(even) td { background:#fafbfd; }
  @page { size:A4; margin:16mm 14mm; }
`;

const [, , inPath, outPath, title] = process.argv;
if (!inPath || !outPath) {
  console.error("Usage: node scripts/md-to-html.mjs <in.md> <out.html> [title]");
  process.exit(1);
}
const md = readFileSync(inPath, "utf-8");
const body = mdToHtml(md);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>${
  title || "Document"
}</title><style>${CSS}</style></head><body>${body}</body></html>`;
writeFileSync(outPath, html, "utf-8");
console.log(`Wrote ${outPath}`);
