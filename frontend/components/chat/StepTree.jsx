'use client';

import { Check, Loader2 } from 'lucide-react';
import { stepAccess, useWizard } from '../wizard/WizardContext';
import { STEP_META, TOTAL_STEPS } from './stepMeta';

export function StepTree({ maxStep, onSelectStep }) {
  const wizard = useWizard();
  const { step, discovery, preview, generation } = wizard;
  const { canEnter } = stepAccess(wizard);

  const busyIndex =
    discovery.status === 'loading'
      ? 3
      : preview.status === 'loading'
        ? 5
        : generation.status === 'starting' || generation.status === 'running'
          ? 6
          : -1;

  return (
    <div className="border-t border-zinc-200/70 dark:border-zinc-900/70">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-1 pt-2.5">
        <ol className="no-scrollbar flex w-full items-start overflow-x-auto">
          {STEP_META.map((meta, idx) => {
            const isActive = idx === step;
            const isDone = idx < maxStep && !isActive;
            const isBusy = busyIndex === idx;
            // Any step already reached can be revisited; steps further ahead
            // need their prerequisites satisfied.
            const locked = !canEnter[idx] && idx > maxStep;
            const hasNext = idx < TOTAL_STEPS - 1;

            return (
              <li key={meta.id} className="relative flex min-w-[4.25rem] flex-1 flex-col items-center sm:min-w-[4.75rem]">
                {hasNext && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[calc(50%+18px)] top-3.5 z-0 h-px w-[calc(100%-36px)] rounded-full ${
                      idx < maxStep ? 'bg-gradient-to-r from-emerald-400/80 to-emerald-400/80' : 'bg-zinc-200 dark:bg-zinc-800'
                    }`}
                  />
                )}

                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSelectStep?.(idx)}
                  aria-current={isActive ? 'step' : undefined}
                  title={locked ? `${meta.title} â€” locked (complete the previous steps first)` : `${meta.title} â€” ${meta.subtitle}`}
                  className={`group relative z-10 flex w-full flex-col items-center focus:outline-none ${
                    locked ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/40 ring-4 ring-emerald-500/15'
                        : isDone
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                          : locked
                            ? 'bg-zinc-100 text-zinc-400 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-600 dark:ring-zinc-800'
                            : 'bg-white text-zinc-500 ring-1 ring-inset ring-zinc-300 group-hover:ring-emerald-400 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-700'
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    ) : isDone ? (
                      <Check size={13} strokeWidth={3} aria-hidden="true" />
                    ) : (
                      idx + 1
                    )}
                  </span>

                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-px ${isActive ? 'bg-emerald-400/60' : isDone ? 'bg-emerald-400/50' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                  />

                  <span
                    className={`max-w-full truncate text-[11px] font-semibold leading-tight transition-colors duration-300 ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-300'
                        : isDone
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : locked
                            ? 'text-zinc-400 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {meta.short || meta.title}
                  </span>
                  <span className="hidden max-w-full truncate text-[10px] leading-tight text-zinc-400 dark:text-zinc-600 md:block">
                    {meta.subtitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
