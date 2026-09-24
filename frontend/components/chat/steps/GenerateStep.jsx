'use client';

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { useWizard } from '../../wizard/WizardContext';
import { Panel, WaitingHint } from '../ui';

const GENERATION_STEPS = [
  'Validating application',
  'Analyzing API',
  'Generating MCP Server',
  'Generating AI Server',
  'Preparing AI Chat component',
  'Generating Documentation',
  'Creating ZIP',
];

export function GenerateStep() {
  const { generation } = useWizard();
  const job = generation.job;
  const steps = job?.steps || GENERATION_STEPS.map((label) => ({ label, status: 'pending' }));
  const completed = steps.filter((step) => step.status === 'completed').length;
  const progress = Math.round((completed / GENERATION_STEPS.length) * 100);

  const statusIcon = (status) => {
    if (status === 'completed') return <CheckCircle2 size={16} className="shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />;
    if (status === 'running') return <Loader2 size={16} className="shrink-0 animate-spin text-emerald-500 dark:text-emerald-400" aria-hidden="true" />;
    if (status === 'failed') return <XCircle size={16} className="shrink-0 text-rose-500 dark:text-rose-400" aria-hidden="true" />;
    return <Circle size={15} className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />;
  };

  return (
    <div className="space-y-5">
      {generation.status === 'error' && (
        <Panel tone="rose">
          <p className="font-medium">Generation failed</p>
          <p className="mt-1 opacity-90">{generation.error}</p>
        </Panel>
      )}

      {generation.status !== 'error' && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="space-y-2.5">
            {steps.map((step, idx) => (
              <li key={step.label} className="flex items-center gap-3">
                {statusIcon(step.status)}
                <span
                  className={`text-sm ${
                    step.status === 'completed'
                      ? 'text-zinc-700 dark:text-zinc-200'
                      : step.status === 'running'
                        ? 'font-medium text-emerald-600 dark:text-emerald-300'
                        : step.status === 'failed'
                          ? 'text-rose-500 dark:text-rose-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {step.label}
                </span>
                {step.detail && <span className="ml-auto truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{step.detail}</span>}
                {idx === (job?.currentStep ?? -1) && step.status === 'running' && (
                  <span className="ml-auto text-[11px] text-emerald-500 dark:text-emerald-400">runningâ€¦</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <WaitingHint>
        {generation.status === 'done'
          ? 'Generation completed - continue in the chat to download your project.'
          : generation.status === 'error'
            ? 'Type "retry" in the chat to run the generation again, or "back" to revisit the preview.'
            : 'Generation usually takes a few seconds - keep this tab open.'}
      </WaitingHint>
    </div>
  );
}
