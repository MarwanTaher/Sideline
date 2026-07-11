"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackMessage } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  linkAccountAction,
  setTabLockAction,
  type AccountActionState,
} from "./actions";
import type { AdminAccountRow, LinkablePlayer } from "@/lib/admins";
import { ADMIN_TABS, type AdminTabKey } from "@/lib/admin-tabs";

const INITIAL: AccountActionState = { ok: false, message: "" };

const selectCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

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
        title={locked ? "Locked — click to unlock" : "Click to lock"}
        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          locked
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
            : "border-black/15 text-neutral-600 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        {locked ? "🔒 " : ""}
        {label}
      </button>
    </form>
  );
}

function AccountCard({
  account,
  players,
  lockedTabs,
}: {
  account: AdminAccountRow;
  players: LinkablePlayer[];
  lockedTabs: AdminTabKey[];
}) {
  const [state, action, pending] = useActionState(linkAccountAction, INITIAL);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const locked = new Set(lockedTabs);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{account.username}</span>
        <Badge tone={account.isSuper ? "info" : "neutral"} dot>
          {account.isSuper ? "super" : "admin"}
        </Badge>
        {!account.active ? (
          <Badge tone="warning" dot>
            inactive
          </Badge>
        ) : null}
        {account.playerId != null ? (
          <Badge tone="success" dot>
            plays as {account.playerName}
          </Badge>
        ) : (
          <Badge tone="neutral">not a player</Badge>
        )}
      </div>

      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="adminId" value={account.id} />
        <label className="block flex-1 text-sm">
          <span className="font-medium">Linked player</span>
          <select
            name="playerId"
            defaultValue={account.playerId ?? ""}
            className={selectCls}
          >
            <option value="">— Not a player —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" pending={pending} pendingLabel="Saving…">
          Save link
        </Button>
      </form>

      <FeedbackMessage ok={state.ok} message={state.message} />

      {account.isSuper ? (
        <p className="text-xs text-neutral-500">
          Super admins always have full access — tabs cannot be locked.
        </p>
      ) : (
        <div className="space-y-2 border-t border-black/5 pt-3 dark:border-white/10">
          <p className="text-xs font-medium text-neutral-500">
            Tab access — click a tab to lock or unlock it for this admin.
          </p>
          <div className="flex flex-wrap gap-2">
            {ADMIN_TABS.map((tab) => (
              <TabLockToggle
                key={tab.key}
                adminId={account.id}
                tabKey={tab.key}
                label={tab.label}
                locked={locked.has(tab.key)}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AccountsAdmin({
  accounts,
  players,
  lockedByAdmin,
}: {
  accounts: AdminAccountRow[];
  players: LinkablePlayer[];
  lockedByAdmin: Record<number, AdminTabKey[]>;
}) {
  if (accounts.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState title="No admin accounts found." />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          players={players}
          lockedTabs={lockedByAdmin[account.id] ?? []}
        />
      ))}
    </div>
  );
}
