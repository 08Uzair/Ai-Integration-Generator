'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useWizard } from '../../wizard/WizardContext';
import { Chip, Panel, WaitingHint } from '../ui';

const AUTH_LABELS = {
  none: 'No authentication',
  bearer: 'Bearer Token',
  'api-key': 'API Key',
  'custom-header': 'Custom Header',
  basic: 'Basic Authentication',
};

const ENV_HINT = {
  bearer: 'TARGET_API_TOKEN',
  'api-key': 'TARGET_API_API_KEY',
  'custom-header': 'TARGET_API_AUTH_HEADER_VALUE',
  basic: 'TARGET_API_BASIC_USERNAME / TARGET_API_BASIC_PASSWORD',
};

export function AuthenticationStep() {
  const { draft } = useWizard();
  const { auth } = draft;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Tell me in the chat how the generated MCP server should authenticate to your API.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="emerald">
          <KeyRound size={11} aria-hidden="true" /> {AUTH_LABELS[auth.type] || auth.type}
        </Chip>
        {auth.type !== 'none' && auth.type && <Chip tone="emerald">credentials captured in chat</Chip>}
      </div>

      {auth.type !== 'none' && ENV_HINT[auth.type] && (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Generated <code className="font-mono text-emerald-600 dark:text-emerald-300">.env.example</code> uses{' '}
          <code className="font-mono text-emerald-600 dark:text-emerald-300">{ENV_HINT[auth.type]}</code>
        </p>
      )}

      <Panel tone="emerald">
        <span className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Secrets stay in this browser and are used only for the live connection test - the exported{' '}
            <code className="font-mono">.env.example</code> only contains placeholders.
          </span>
        </span>
      </Panel>

      <WaitingHint />
    </div>
  );
}
