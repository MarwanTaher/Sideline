/**
 * Two-column page body for wide screens (xl+): the main content on the left
 * and a narrower aside (settings, totals) on the right. Below xl both parts
 * are plain blocks in source order — margins collapse through the wrappers —
 * so the phone and tablet layouts render exactly as without the wrapper.
 */
export function DesktopSplit({
  children,
  aside,
  className = "",
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6 ${className}`.trim()}
    >
      <div className="min-w-0">{children}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  );
}
