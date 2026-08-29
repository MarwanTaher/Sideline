"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { grantAdminAction, revokeAdminAction, type AccountActionState } from "./actions";
import type { PlayerAdminStatus } from "@/lib/admins";

const INITIAL: AccountActionState = { ok: false, message: "" };

function ToggleAdmin({ player }: { player: PlayerAdminStatus }) {
  const [state, action, pending] = useActionState(
    player.isAdmin ? revokeAdminAction : grantAdminAction,
    INITIAL,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="playerId" value={player.playerId} />
      <Button
        type="submit"
        size="sm"
        variant={player.isAdmin ? "danger" : "primary"}
        pending={pending}
        pendingLabel="…"
      >
        {player.isAdmin ? "Remove admin" : "Make admin"}
      </Button>
    </form>
  );
}

export default function PlayerAdmins({ players }: { players: PlayerAdminStatus[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  }, [players, query]);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Player admins</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Promote a player to admin, or remove their admin access. Super admins are
        shown for reference and are managed separately.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players…"
        className="mt-3 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
      />

      <Card className="mt-3">
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-500">No players match.</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {shown.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.isSuper ? (
                    <Badge tone="info" dot>super</Badge>
                  ) : p.isAdmin ? (
                    <Badge tone="success" dot>admin</Badge>
                  ) : null}
                </span>
                {p.isSuper ? (
                  <span className="shrink-0 text-xs text-neutral-400">super admin</span>
                ) : (
                  <ToggleAdmin player={p} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
