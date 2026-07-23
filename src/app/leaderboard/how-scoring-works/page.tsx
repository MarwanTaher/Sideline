import Link from "next/link";
import { SubNav } from "@/components/ui/sub-nav";
import { SectionIcon } from "@/components/section-icon";

export const metadata = {
  title: "How scores work · Sideline",
};

/**
 * In-app scoring guide. Renders the single-source guide (`/how-scores-work.html`)
 * inside the app shell via an iframe so it keeps the app chrome/nav and never
 * bounces users out to Safari (which breaks the installed-PWA feel on iOS).
 * The standalone HTML/PDF remains the shareable/exportable artifact.
 */
export default function HowScoringWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
      <SubNav
        className="mb-6"
        ariaLabel="Standings"
        items={[
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/awards", label: "Awards" },
        ]}
      />
      <div className="flex items-center gap-3">
        <SectionIcon name="leaderboard" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">
          How scores work
        </h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        How player rankings are calculated, and what each scoring setting does.{" "}
        <a
          href="/how-scores-work.html"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400"
        >
          Open printable version
        </a>
        .
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10">
        <iframe
          src="/how-scores-work.html"
          title="Sideline scoring guide"
          className="h-[75vh] w-full"
        />
      </div>

      <div className="mt-4">
        <Link
          href="/leaderboard"
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Back to leaderboard
        </Link>
      </div>
    </main>
  );
}
