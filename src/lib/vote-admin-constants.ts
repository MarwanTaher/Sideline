// Client-safe vote-scope constants (no DB imports).

export type ScopeStatus = "in_scope" | "out_of_scope" | "removed_from_calculation";

export const SCOPE_OPTIONS: ScopeStatus[] = [
  "in_scope",
  "out_of_scope",
  "removed_from_calculation",
];
