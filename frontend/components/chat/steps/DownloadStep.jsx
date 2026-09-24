'use client';

import { FileArchive, Package, Server, Smartphone, Sparkles } from 'lucide-react';
import { formatBytes } from '../../../lib/validators';
import { useWizard } from '../../wizard/WizardContext';
import { Panel, WaitingHint } from '../ui';

const TARGETS = [
  { kind: 'complete', icon: FileArchive, title: 'Complete project', sub: 'All services + docs + docker-compose', tone: 'text-emerald-500 dark:text-emerald-300 ring-emerald-500/30 from-emerald-500/20' },
  { kind: 'mcp-server', icon: Server, title: 'MCP Server', sub: 'Tools for your API (port 5000)', tone: 'text-green-600 dark:text-green-300 ring-green-500/30 from-green-500/20' },
  { kind: 'ai-server', icon: Package, title: 'AI Server', sub: 'Groq chat backend (port 4000)', tone: 'text-amber-600 dark:text-amber-300 ring-amber-500/30 from-amber-500/20' },
  { kind: 'ai-chat', icon: Smartphone, title: 'AI Chat component', sub: 'AiChat.jsx - drop into your app', tone: 'text-lime-600 dark:text-lime-300 ring-lime-500/30 from-lime-500/20' },
];

export function DownloadStep() {
  const { generation, draft } = useWizard();
  const slug = generation.project?.projectName || draft.name || 'project';

  const sizeOf = (kind) =>
    kind === 'complete'
      ? formatBytes(generation.project?.artifacts?.complete?.sizeBytes)
      : formatBytes(generation.project?.artifacts?.parts?.[kind]?.sizeBytes);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{slug}</span> is ready. Tell me in the chat which package to download - no secrets
        included, each zip ships its own <code className="font-mono text-xs">.env.example</code>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {TARGETS.map((target) => (
          <div
            key={target.kind}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm dark:border-zinc-900 dark:bg-zinc-950/80"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br to-transparent ring-1 ring-inset ${target.tone}`}>
              <target.icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{target.title}</span>
              <span className="block text-xs text-zinc-400 dark:text-zinc-500">{target.sub}</span>
              <span className="block font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                {slug}-{target.kind}.zip
                {sizeOf(target.kind) ? ` Â· ${sizeOf(target.kind)}` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>

      <Panel tone="emerald">
        <p className="flex items-center gap-1.5 font-medium">
          <Sparkles size={13} aria-hidden="true" /> What&apos;s inside
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 opacity-90">
          <li>Full source code for both servers plus the AiChat.jsx component - plain JavaScript, fully commented.</li>
          <li>
            docker-compose.yml - run everything with <code className="rounded-md bg-white/40 px-1 font-mono dark:bg-white/10">docker compose up</code>
          </li>
          <li>Documentation: root README + one per service + ai-chat/INSTALL.md.</li>
          <li>.env.example files - create your .env from them and fill in your real keys.</li>
        </ul>
      </Panel>

      <WaitingHint>
        Type "complete", "mcp-server", "ai-server", "ai-chat" or "all" in the chat to download. Artifacts are kept in this browser - you can re-download them from the dashboard later.
      </WaitingHint>
    </div>
  );
}
