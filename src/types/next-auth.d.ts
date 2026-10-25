import type { DefaultSession } from "next-auth";

type UserRole = "super" | "admin" | "player";

declare module "next-auth" {
  interface Session {
    user: {
      role: UserRole;
      playerId: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    playerId: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    playerId?: number | null;
  }
}
