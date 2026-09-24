'use client';

import { CheckCircle2, Loader2, Pencil, Sparkles, User, XCircle } from 'lucide-react';

export function AssistantRow({ children }) {
  return (
    <div className="flex animate-fade-in-up items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/25">
        <Sparkles size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function AssistantText({ children }) {
  return (
    <div className="max-w-[52rem] rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-700 shadow-sm dark:border-zinc-900 dark:bg-zinc-950 dark:text-zinc-300">
      {children}
    </div>
  );
}

export function UserRow({ children }) {
  return (
    <div className="flex animate-fade-in-up items-start justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-zinc-900 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm dark:bg-emerald-600 dark:text-white">
        {children}
      </div>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        <User size={15} aria-hidden="true" />
      </span>
    </div>
  );
}

export function SuggestionChips({ options = [], onPick }) {
  if (!options.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-1 text-xs font-medium text-emerald-600 transition hover:border-emerald-500/60 hover:bg-emerald-500/15 dark:text-emerald-300"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function TypingRow() {
  return (
    <AssistantRow>
      <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-4 py-3.5 shadow-sm dark:border-zinc-900 dark:bg-zinc-950">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </AssistantRow>
  );
}

const STATUS_META = {
  active: { label: 'In progress', icon: Loader2, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', spin: true },
  done: { label: 'Completed', icon: CheckCircle2, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', spin: false },
  waiting: { label: 'Waiting', icon: null, className: 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500', spin: false },
  failed: { label: 'Failed', icon: XCircle, className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300', spin: false },
};

export function StepCard({ index, meta, status = 'waiting', onEdit, children }) {
  const Icon = meta.icon;
  const statusMeta = STATUS_META[status] || STATUS_META.waiting;
  const StatusIcon = statusMeta.icon;
  const isActive = status === 'active';

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-zinc-950/80 ${
        isActive
          ? 'border-emerald-500/40 shadow-emerald-500/10 dark:border-emerald-500/40'
          : 'border-zinc-200 dark:border-zinc-900'
      }`}
    >
      <div className="flex items-center gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-900/80 dark:bg-zinc-950">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isActive
              ? 'bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30'
              : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          <Icon size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Step {index + 1} of 8
          </p>
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{meta.title}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
          {StatusIcon && <StatusIcon size={12} className={statusMeta.spin ? 'animate-spin' : ''} aria-hidden="true" />}
          {statusMeta.label}
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="Revisit this step"
            aria-label="Revisit this step"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}
