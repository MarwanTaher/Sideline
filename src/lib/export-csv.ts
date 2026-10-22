export type CsvValue = string | number | boolean | Date | null | undefined;

export function escapeCsvCell(value: CsvValue): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safeText =
    typeof value === "string" && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: readonly CsvValue[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}
