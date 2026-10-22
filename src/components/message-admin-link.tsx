import { waMeUrl } from "@/lib/share";

export function MessageAdminLink({
  matchId,
  reason,
}: {
  matchId: number;
  reason: string;
}) {
  return (
    <a
      href={waMeUrl(`Hi, could an admin help me with match #${matchId}? ${reason}`)}
      className="ml-1 inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
      rel="noopener noreferrer"
      target="_blank"
    >
      Message an admin <span aria-hidden="true" className="ml-1">↗</span>
    </a>
  );
}
