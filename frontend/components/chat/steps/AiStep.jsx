'use client';

import { Bot, Cpu, Lock } from 'lucide-react';
import { useWizard } from '../../wizard/WizardContext';
import { Panel } from '../ui';

export function AiStep() {
  const { draft } = useWizard();
  const ai = draft.ai;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        The provider that powers the chat assistant inside your generated project is fixed.
      </p>

      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3.5 py-3">
        <Lock size={15} className="shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{ai.provider}</p>
          <p className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-300">{ai.model}</p>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
        <Cpu size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          The generated ai-server uses a provider abstraction - OpenAI, Anthropic, Gemini, Ollama and OpenRouter slots are ready in{' '}
          <code className="rounded-md border border-zinc-200 bg-zinc-100 px-1 font-mono text-emerald-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-emerald-300">
            ai-server/src/providers/ai-provider.js
          </code>
          .
        </span>
      </p>

      <Panel>
        <span className="flex items-start gap-2">
          <Bot size={15} className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
          <span>
            You will set your <code className="font-mono text-emerald-600 dark:text-emerald-300">GROQ_API_KEY</code> in the generated{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-300">ai-server/.env</code> file. I never ask for or store your key.
          </span>
        </span>
      </Panel>
    </div>
  );
}
