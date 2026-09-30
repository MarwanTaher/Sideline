"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MIN_TEAMS, MAX_TEAMS } from "@/lib/team-constants";
import {
  createMatch,
  getMatchSeasonId,
  updateMatchSettings,
  setMatchdayStatus,
  setMatchStatus,
  deleteMatch,
} from "@/lib/match-admin";
import { searchPlaces, type PlaceResult } from "@/lib/geo";
import { getActiveSubscriptionSeason } from "@/lib/season-subscriptions";
import { revalidateScores } from "@/lib/scores-cache";

export interface MatchActionState {
  ok: boolean;
  message: string;
}

/** Server-side authorization gate — never trust the client. */
async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "super") {
    throw new Error("Not authorized");
  }
}

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const timeSchema = z.string().trim().min(1, "Match time is required.");
const numTeamsSchema = z.coerce
  .number()
  .int()
  .min(MIN_TEAMS, `Teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}.`)
  .max(MAX_TEAMS, `Teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}.`);
const matchIdSchema = z.coerce.number().int().positive();
const matchdaySchema = z.enum(["draft", "active", "closed"]);
const statusSchema = z.enum(["open", "closed"]);

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => i.message).join(" ");
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Pull an optional field location (name + coordinates) out of the form. */
function parseLocation(formData: FormData): {
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  venue: "indoor" | "outdoor" | null;
} {
  const name = String(formData.get("locationName") ?? "").trim() || null;
  const latRaw = String(formData.get("locationLat") ?? "").trim();
  const lngRaw = String(formData.get("locationLng") ?? "").trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  const validLat = lat != null && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const validLng = lng != null && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;
  const venueRaw = String(formData.get("venue") ?? "").trim();
  const venue = venueRaw === "indoor" || venueRaw === "outdoor" ? venueRaw : null;
  return { locationName: name, locationLat: validLat, locationLng: validLng, venue };
}

/** Admin place search for the field-location picker (OpenStreetMap, no key). */
export async function searchPlacesAction(query: string): Promise<PlaceResult[]> {
  await requireAdmin();
  return searchPlaces(query);
}

/**
 * Season membership is an explicit choice. With no subscription season running
 * the radio is absent, so an unset value means an ordinary match.
 */
async function resolveSeasonId(formData: FormData): Promise<number | null> {
  if (formData.get("seasonMatch") !== "yes") return null;
  const season = await getActiveSubscriptionSeason();
  return season ? season.id : null;
}

export async function createMatchAction(
  _prev: MatchActionState,
  formData: FormData,
): Promise<MatchActionState> {
  let newId: number;
  try {
    await requireAdmin();
    const playedOn = dateSchema.parse(formData.get("playedOn"));
    const matchTime = timeSchema.parse(formData.get("matchTime"));
    const numTeams = numTeamsSchema.parse(formData.get("numTeams"));
    const statsScoringEnabled = formData.get("statsScoringEnabled") === "on";
    const location = parseLocation(formData);
    const seasonId = await resolveSeasonId(formData);

    newId = await createMatch({
      playedOn,
      matchTime,
      numTeams,
      statsScoringEnabled,
      seasonId,
      ...location,
    });
    revalidatePath("/matches");
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  // Redirect must be called outside the try/catch (it throws by design).
  redirect(`/matches/${newId}`);
}

export async function updateMatchSettingsAction(
  _prev: MatchActionState,
  formData: FormData,
): Promise<MatchActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const playedOn = dateSchema.parse(formData.get("playedOn"));
    const matchTime = timeSchema.parse(formData.get("matchTime"));
    const numTeams = numTeamsSchema.parse(formData.get("numTeams"));
    const statsScoringEnabled = formData.get("statsScoringEnabled") === "on";
    const location = parseLocation(formData);
      // Absent field means "leave as it is" — an unrelated edit must not
      // quietly turn a season match into an ordinary one.
      const seasonId = formData.has("seasonMatch")
        ? await resolveSeasonId(formData)
        : await getMatchSeasonId(matchId);

      await updateMatchSettings(matchId, {
        playedOn,
        matchTime,
        numTeams,
        statsScoringEnabled,
        seasonId,
        ...location,
      });
    revalidateScores();
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/matches");
    return { ok: true, message: "Match settings saved." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function setMatchdayStatusAction(
  _prev: MatchActionState,
  formData: FormData,
): Promise<MatchActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const status = matchdaySchema.parse(String(formData.get("matchdayStatus")));

    await setMatchdayStatus(matchId, status);
    revalidateScores();
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/matches");
    return { ok: true, message: `Matchday set to ${status}.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function setMatchStatusAction(
  _prev: MatchActionState,
  formData: FormData,
): Promise<MatchActionState> {
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const status = statusSchema.parse(String(formData.get("status")));

    await setMatchStatus(matchId, status);
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/matches");
    return {
      ok: true,
      message: status === "open" ? "Submissions opened." : "Submissions closed.",
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteMatchAction(
  _prev: MatchActionState,
  formData: FormData,
): Promise<MatchActionState> {
  let deleted = false;
  try {
    await requireAdmin();
    const matchId = matchIdSchema.parse(formData.get("matchId"));
    const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
    if (confirm !== "DELETE") {
      return { ok: false, message: 'Type "DELETE" to confirm.' };
    }

    await deleteMatch(matchId);
    revalidateScores();
    revalidatePath("/matches");
    deleted = true;
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  if (deleted) redirect("/matches");
  return { ok: false, message: "Something went wrong." };
}
