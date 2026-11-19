import "server-only";
import { cache } from "react";
import { sqlClient } from "./db";
import { FOUNDING_GROUP, type Group } from "./group-constants";

/**
 * Group context for server code. In M1 there is one group, so this only
 * loads the founding group; M2 replaces it with per-request resolution from
 * the URL (docs/platform/02-M2-GROUP-SCOPED-APP.md §4).
 *
 * Nothing calls this yet. It requires migration 0040.
 */
export const getFoundingGroup = cache(async (): Promise<Group> => {
  const rows = (await sqlClient.query(
    `SELECT id, slug, name, timezone, currency, locale, status
       FROM groups WHERE id = $1`,
    [FOUNDING_GROUP.id],
  )) as Group[];
  const group = rows[0];
  if (!group) throw new Error("Founding group is missing: apply drizzle/0040_groups.sql");
  return group;
});
