import "server-only";
import { cache } from "react";
import { getSetting, setSetting } from "./feature-settings";
import {
  sanitizeMomentCopy,
  sanitizeVariants,
  type MomentCopyOverrides,
  type MomentKind,
} from "./moment-copy";

const MOMENT_COPY_KEY = "moment_copy";

/** Admin-written pop-up copy (M-1). Read once per request. */
export const getMomentCopy = cache(async (): Promise<MomentCopyOverrides> => {
  const raw = await getSetting(MOMENT_COPY_KEY);
  if (!raw) return {};
  try {
    return sanitizeMomentCopy(JSON.parse(raw));
  } catch {
    return {};
  }
});

/** Replace one kind's variants; an empty list resets it to the built-in copy. */
export async function setMomentCopyForKind(kind: MomentKind, variants: unknown): Promise<void> {
  const current = { ...(await getMomentCopy()) };
  const clean = sanitizeVariants(variants);
  if (clean.length > 0) current[kind] = clean;
  else delete current[kind];
  await setSetting(MOMENT_COPY_KEY, JSON.stringify(current));
}
