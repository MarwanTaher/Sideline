"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackMessage } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { linkAccountAction, type AccountActionState } from "./actions";
import type { AdminAccountRow, LinkablePlayer } from "@/lib/admins";

const INITIAL: AccountActionState = { ok: false, message: "" };

const selectCls =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900";

function AccountCard({
  account,
  players,
}: {
  account: AdminAccountRow;
  players: LinkablePlayer[];
}) {
  const [state, action, pending] = useActionState(linkAccountAction, INITIAL);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

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
    </Card>
  );
}

export default function AccountsAdmin({
  accounts,
  players,
}: {
  accounts: AdminAccountRow[];
  players: LinkablePlayer[];
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
        <AccountCard key={account.id} account={account} players={players} />
      ))}
    </div>
  );
}
