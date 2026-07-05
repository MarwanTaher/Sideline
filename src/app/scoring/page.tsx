import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminView } from "@/lib/view-mode";
import { getScoringConfig } from "@/lib/scoring-config";
import { ScoringForm } from "./scoring-form";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "Scoring settings · Sideline",
};

export const dynamic = "force-dynamic";

export default async function ScoringConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin = await isAdminView(role === "admin" || role === "super");
  if (!isAdmin) redirect("/leaderboard");

  const config = await getScoringConfig();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center gap-3">
        <SectionIcon name="scoring" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Scoring settings</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Currently active: Peer {config.peerWeightPct}% / Stats {config.statWeightPct}%.
      </p>

      <ScoringForm config={config} />
    </main>
  );
}
