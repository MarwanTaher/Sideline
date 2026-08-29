"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LockIcon } from "@/components/ui/icons";
import {
  grantAdminAction,
  revokeAdminAction,
  setTabLockAction,
  type AccountActionState,
} from "./actions";
import type { PlayerAdminStatus } from "@/lib/admins";
import { ADMIN_TABS, type AdminTabKey } from "@/lib/admin-tabs";

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

function TabLockToggle({
  adminId,
  tabKey,
  label,
  locked,
}: {
  adminId: number;
  tabKey: AdminTabKey;
  label: string;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(setTabLockAction, INITIAL);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="adminId" value={adminId} />
      <input type="hidden" name="tabKey" value={tabKey} />
      <input type="hidden" name="locked" value={locked ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={locked}
        title={locked ? "Blocked — click to allow" : "Allowed — click to block"}
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          locked
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
            : "border-black/15 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        {locked ? <LockIcon className="mr-1 inline h-3.5 w-3.5" /> : null}
        {label}
      </button>
    </form>
  );
}

export default function PlayerAdmins({
  players,
  lockedByAdmin,
}: {
  players: PlayerAdminStatus[];
  lockedByAdmin: Record<number, AdminTabKey[]>;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  }, [players, query]);

  return (
    <section className="mt-8">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players…"
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
      />

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No players match.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((p) => {
            const locked = new Set(p.adminId ? lockedByAdmin[p.adminId] ?? [] : []);
            return (
              <li key={p.playerId}>
                <Card className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
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
                  </div>

                  {p.isAdmin && !p.isSuper && p.adminId != null ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-neutral-500">
                        Sections this admin can use (click to block):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ADMIN_TABS.map((t) => (
                          <TabLockToggle
                            key={t.key}
                            adminId={p.adminId as number}
                            tabKey={t.key}
                            label={t.label}
                            locked={locked.has(t.key)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
