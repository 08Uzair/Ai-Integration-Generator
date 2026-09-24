const tones = {
  slate: 'bg-zinc-900 text-slate-300 ring-zinc-800',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  green: 'bg-green-500/15 text-green-300 ring-green-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

export function Badge({ children, tone = 'slate', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}