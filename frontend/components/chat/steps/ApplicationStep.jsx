'use client';

import { useWizard } from '../../wizard/WizardContext';
import { WaitingHint } from '../ui';

function Row({ label, value, placeholder }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-32 shrink-0 text-zinc-400 dark:text-zinc-500">{label}</span>
      {value ? (
        <code className="min-w-0 max-w-full truncate rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {value}
        </code>
      ) : (
        <span className="text-zinc-400 dark:text-zinc-600">{placeholder}</span>
      )}
    </li>
  );
}

export function ApplicationStep() {
  const { draft } = useWizard();

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        I will ask for your project name, application URL and API base URL. This card fills in as you answer.
      </p>
      <ul className="space-y-1.5">
        <Row label="Project name" value={draft.name} placeholder="waiting for your answerâ€¦" />
        <Row label="Application URL" value={draft.appUrl} placeholder="optional - not set" />
        <Row label="API base URL" value={draft.apiBaseUrl} placeholder="waiting for your answerâ€¦" />
      </ul>
      <WaitingHint />
    </div>
  );
}
