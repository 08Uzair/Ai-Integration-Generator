'use client';

import { Bot, Boxes, Cpu, Loader2, Server, TerminalSquare } from 'lucide-react';
import { useWizard } from '../../wizard/WizardContext';
import { Panel, WaitingHint } from '../ui';

export function PreviewStep() {
  const { preview, endpoints } = useWizard();
  const { status, result, error } = preview;

  const stats = result
    ? [
        { icon: Server, label: 'MCP Server', value: `:${result.ports.mcpServer}`, sub: `${result.tools.length} tools` },
        { icon: Bot, label: 'AI Server', value: `:${result.ports.aiServer}`, sub: result.ai.model },
        { icon: Boxes, label: 'AI Chat', value: 'copy & drop', sub: 'AiChat.jsx' },
        { icon: Cpu, label: 'Provider', value: result.ai.provider, sub: result.ai.model },
      ]
    : [];

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Here is everything the generator will create for your API.
      </p>

      {status === 'loading' && (
        <Panel tone="emerald">
          <span className="flex items-center gap-3">
            <Loader2 size={16} className="shrink-0 animate-spin text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
            Building the integration planâ€¦
          </span>
        </Panel>
      )}

      {status === 'error' && (
        <Panel tone="rose">
          <p className="font-medium">Preview failed</p>
          <p className="mt-1 opacity-90">{error}</p>
        </Panel>
      )}

      {status === 'done' && result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-900 dark:bg-zinc-950/80">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                  <stat.icon size={13} aria-hidden="true" /> {stat.label}
                </div>
                <p className="mt-1 bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text font-mono text-sm font-semibold text-transparent">
                  {stat.value}
                </p>
                <p className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-900">
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-900 dark:bg-zinc-950 dark:text-zinc-400">
              <TerminalSquare size={13} aria-hidden="true" /> MCP tools ({result.tools.length} from {endpoints.length} endpoints)
            </div>
            <ul className="max-h-56 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
              {result.tools.map((tool) => (
                <li key={tool.name} className="flex items-start gap-3 px-3 py-2">
                  <code className="mt-0.5 shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    {tool.name}
                  </code>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{tool.description}</span>
                    <span className="block font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                      {tool.request.method} {tool.request.path}
                      {tool.request.queryParams?.length ? `?${tool.request.queryParams.map((q) => q.name).join('&')}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Panel>
            <p className="font-medium text-zinc-600 dark:text-zinc-300">Environment contract - secrets stay out of the project</p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] opacity-80">
              {result.auth.env.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>GROQ_API_KEY=</li>
              <li>GROQ_MODEL={result.ai.model}</li>
            </ul>
          </Panel>
        </>
      )}

      <WaitingHint>
        Type "generate" in the chat to build the project, or "refresh" to rebuild the plan.
      </WaitingHint>
    </div>
  );
}
