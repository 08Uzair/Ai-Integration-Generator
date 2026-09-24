export function ProgressBar({ value = 0, className = '' }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-zinc-900 ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}