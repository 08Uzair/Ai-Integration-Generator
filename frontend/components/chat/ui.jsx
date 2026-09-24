'use client';

import { MessageSquareText } from 'lucide-react';

const BUTTON_VARIANTS = {
  primary:
    'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 focus-visible:ring-emerald-400',
  secondary:
    'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white',
  ghost:
    'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  success:
    'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 focus-visible:ring-emerald-400',
  danger:
    'bg-rose-600 text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500 focus-visible:ring-rose-400',
};

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
  icon: 'h-9 w-9 p-0',
};

export function ChatButton({ children, variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const CHIP_TONES = {
  neutral: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  green: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export function Chip({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CHIP_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Panel({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-900 dark:bg-zinc-950/80 dark:text-zinc-400',
    green: 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-200',
    emerald: 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-200',
    amber: 'border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-200',
    rose: 'border-rose-500/25 bg-rose-500/[0.06] text-rose-700 dark:text-rose-200',
  };
  return <div className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${tones[tone]} ${className}`}>{children}</div>;
}

export function WaitingHint({ children = 'Type your answer in the message box below.' }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
      <MessageSquareText size={12} className="shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
