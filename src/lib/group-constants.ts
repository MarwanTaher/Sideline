/**
 * Group (tenant) constants and types. Client-safe: no database imports.
 * See docs/platform/00-OVERVIEW.md.
 */

export type GroupStatus = "active" | "suspended" | "archived";

export type Group = {
  id: number;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  status: GroupStatus;
};

/**
 * The founding group, seeded by migration 0040. Until M2 adds group-aware
 * routing, every request belongs to this group.
 */
export const FOUNDING_GROUP = {
  id: 1,
  slug: "krakow-pyramids",
  name: "Krakow Pyramids",
} as const;
