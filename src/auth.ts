import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { resolvePlayerFromAccessToken } from "@/lib/access-tokens";
import { rateLimit } from "@/lib/rate-limit";

export type UserRole = "super" | "admin" | "player";

/**
 * Resolve the effective role for a player id. A player is elevated to admin (or
 * super) when their player record is linked to an active row in `admins`.
 * Returns "player" for everyone else. This is the single source of truth for
 * admin privileges now that there is one unified login.
 */
async function roleForPlayer(playerId: number): Promise<UserRole> {
  const rows = await db
    .select({ isSuper: schema.admins.isSuper })
    .from(schema.admins)
    .where(and(eq(schema.admins.playerId, playerId), eq(schema.admins.active, 1)))
    .limit(1);
  const admin = rows[0];
  if (!admin) return "player";
  return admin.isSuper === 1 ? "super" : "admin";
}

/**
 * Auth.js (v5) configuration.
 *
 * There is a single, unified login: everyone signs in as a player (name/id +
 * password, or a magic-link access token). Admin privileges are derived from
 * the linked `admins` row via {@link roleForPlayer} — there is no separate
 * admin login.
 *
 * Passwords are verified with the same PBKDF2-HMAC-SHA256 scheme as the old
 * app (see `@/lib/password`), so existing credentials keep working.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        role: {},
        identifier: {},
        password: {},
      },
      authorize: async (credentials) => {
        const role = String(credentials?.role ?? "player");
        const password = String(credentials?.password ?? "");
        const identifier = String(credentials?.identifier ?? "").trim();
        if (!identifier) return null;

        // Magic-link login: identifier is a player access token, no password.
        if (role === "token") {
          const resolved = await resolvePlayerFromAccessToken(identifier);
          if (!resolved) return null;
          return {
            id: `player:${resolved.playerId}`,
            name: resolved.name,
            role: await roleForPlayer(resolved.playerId),
            playerId: resolved.playerId,
          };
        }

        if (!password) return null;

        // Player login (identifier is the numeric player id). Admin privileges,
        // if any, are derived from the linked `admins` row — there is no separate
        // admin login.
        const playerId = Number(identifier);
        if (!Number.isInteger(playerId)) return null;

        // Throttle password attempts per account to blunt brute-force /
        // credential-stuffing. Failing open is handled inside rateLimit().
        const { allowed } = await rateLimit(`login:${playerId}`, 8, 60);
        if (!allowed) return null;

        const credRows = await db
          .select()
          .from(schema.playerCredentials)
          .where(eq(schema.playerCredentials.playerId, playerId))
          .limit(1);
        const cred = credRows[0];
        if (!cred) return null;
        if (!verifyPassword(password, cred.passwordSalt, cred.passwordHash)) {
          return null;
        }

        const playerRows = await db
          .select()
          .from(schema.players)
          .where(and(eq(schema.players.id, playerId), eq(schema.players.active, 1)))
          .limit(1);
        const player = playerRows[0];
        if (!player) return null;

        return {
          id: `player:${player.id}`,
          name: player.name,
          role: await roleForPlayer(player.id),
          playerId: player.id,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.playerId = user.playerId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as UserRole;
        session.user.playerId = (token.playerId as number | null) ?? null;
      }
      return session;
    },
  },
});
