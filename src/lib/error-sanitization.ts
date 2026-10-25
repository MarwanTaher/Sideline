const SECRET_ASSIGNMENT =
  /\b(authorization|bearer|token|password|secret|api[_-]?key|access[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi;

export function sanitizeErrorMessage(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgres://[REDACTED]")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
}
