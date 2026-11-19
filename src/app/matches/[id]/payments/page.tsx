import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";

export const dynamic = "force-dynamic";

/**
 * A match's Payments tab has no page of its own any more: players have one
 * Payments page and admins one Payments page, both opened on this match.
 * The target pages re-check access.
 */
export default async function MatchPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId <= 0) redirect("/payments");

  const role = session.user.role;
  if (await isAdminView(role === "admin" || role === "super")) {
    redirect(`/admin/payments?tab=matches&match=${matchId}`);
  }
  redirect(`/payments?match=${matchId}`);
}
