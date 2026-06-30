export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-surface/50 border border-surface rounded-xl ${className}`}
    />
  );
}
