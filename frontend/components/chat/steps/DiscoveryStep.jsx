'use client';

import { CheckCircle2, Loader2, Radio, XCircle } from 'lucide-react';
import { useWizard } from '../../wizard/WizardContext';
import { Chip, Panel, WaitingHint } from '../ui';
import { EndpointList } from './EndpointList';

export function DiscoveryStep() {
  const { draft, discovery, endpoints } = useWizard();
  const { status, result, error } = discovery;
  const checks = result?.checks || [];

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        I probe{' '}
        <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-emerald-600 dark:bg-zinc-800 dark:text-emerald-300">
          {draft.apiBaseUrl || 'your API'}
        </code>{' '}
        for reachability, JSON responses and an OpenAPI specification.
      </p>

      {status === 'loading' && (
        <Panel tone="emerald">
          <span className="flex items-center gap-3">
            <Loader2 size={16} className="shrink-0 animate-spin text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
            <span>
              <span className="block font-medium">Testing the connectionâ€¦</span>
              <span className="block text-[11px] opacity-80">Validating server â†’ reaching API â†’ detecting JSON â†’ searching for OpenAPI</span>
            </span>
          </span>
        </Panel>
      )}

      {status === 'idle' && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          <Radio size={15} aria-hidden="true" /> Waiting to start the connection testâ€¦
        </div>
      )}

      {status === 'error' && (
        <Panel tone="rose">
          <p className="font-medium">Discovery failed</p>
          <p className="mt-1 opacity-90">{error}</p>
        </Panel>
      )}

      {checks.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {checks.map((check) => {
            const ok = check.status === 'ok';
            return (
              <li
                key={check.label}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-900 dark:bg-zinc-950/80"
              >
                {ok ? (
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <XCircle size={15} className="shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">{check.label}</span>
                  <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">{check.message}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {result?.openapiUrl && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          OpenAPI spec:{' '}
          <code className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-emerald-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-emerald-300">
            {result.openapiUrl}
          </code>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Chip tone="emerald">{endpoints.length} endpoint(s)</Chip>
        {result?.source && <Chip tone="neutral">source: {result.source}</Chip>}
      </div>

      <EndpointList />

      <WaitingHint>
        Edit method, path and summary directly in the table, or paste route lines in the chat (e.g. GET /users). Type "done" to continue.
      </WaitingHint>
    </div>
  );
}
