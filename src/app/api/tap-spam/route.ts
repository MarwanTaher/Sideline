import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTapSpamConfig } from "@/lib/tap-spam-settings";

export const dynamic = "force-dynamic";

/** Tap-spam egg config, fetched lazily on the first IN/OUT tap (not a server action, so it never queues ahead of the IN/OUT save). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ enabled: false, urls: [] }, { status: 401 });
  try {
    const cfg = await getTapSpamConfig();
    return NextResponse.json(
      { enabled: cfg.enabled, urls: cfg.sounds.map((s) => s.url) },
      // Never cache: an installed app must see admin changes immediately.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ enabled: true, urls: [] });
  }
}
