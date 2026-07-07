import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Routes that never require a session. */
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Auth.js sets one of these cookies once signed in. We only check for presence
 * here (a cheap, edge-safe gate) — pages still call `auth()` to validate the
 * session. The goal is to attach a `callbackUrl` for logged-out visitors so
 * they return to the page they wanted after signing in (e.g. an availability
 * link from a push notification).
 */
function hasSessionCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.includes("authjs.session-token") && c.value.length > 0);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPublic || hasSessionCookie(req)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except Next internals, the auth API, and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
