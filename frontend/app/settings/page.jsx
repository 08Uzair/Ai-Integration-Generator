'use client';

import { Bot, Globe, HardDrive, KeyRound, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { NavBar } from '@/components/ui/NavBar';
import { apiFetch } from '@/lib/api';

const HEALTH_ROWS = [
  { key: 'mode', label: 'Mode' },
  { key: 'generation', label: 'Generation' },
  { key: 'engine', label: 'Engine' },
  { key: 'database', label: 'Database' },
];

export default function SettingsPage() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    apiFetch('/api/health')
      .then((data) => setHealth({ ok: true, data }))
      .catch((err) => setHealth({ ok: false, message: err.message }));
  }, []);

  return (
    <div className="min-h-screen">
      <NavBar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
          <p className="text-sm text-slate-500">Everything runs locally - no account, no backend and no database.</p>
        </div>

        <div className="space-y-5">
          <Card title="Local engine" description="The generator engine is bundled with this app and runs on this machine.">
            <div className="flex items-center gap-2">
              {health?.ok ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    <ShieldCheck size={13} aria-hidden="true" /> Healthy
                  </span>
                  <span className="text-xs text-slate-500">status: {health.data.status}</span>
                </>
              ) : health ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">
                  <Server size={13} aria-hidden="true" /> Unreachable - {health.message}
                </span>
              ) : (
                <span className="text-xs text-slate-500">Checking engineâ€¦</span>
              )}
            </div>

            {health?.ok && (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {HEALTH_ROWS.map((row) => (
                  <div key={row.key} className="rounded-xl border border-zinc-900 bg-zinc-950/50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{row.label}</dt>
                    <dd className="font-mono text-xs text-slate-200">{health.data[row.key] ?? 'â€”'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card title="How it works" description="The same engine the CLI uses, running inside this app.">
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <Bot size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                API discovery, preview, project generation and ZIP creation all run locally - no backend API and no MongoDB.
              </li>
              <li className="flex items-start gap-2">
                <Globe size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                The only network requests are the probes against the API URL you enter in the chat.
              </li>
              <li className="flex items-start gap-2">
                <HardDrive size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                Generated artifacts are kept in this browser, so you can re-download them any time from the dashboard.
              </li>
            </ul>
          </Card>

          <Card title="Security & data" description="How credentials are handled.">
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <KeyRound size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                API keys and tokens are used transiently for connection tests and never persisted.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                No database is involved - integration state and artifacts live in this browser&apos;s storage (IndexedDB).
              </li>
              <li className="flex items-start gap-2">
                <Globe size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                Generated projects never contain secrets - they ship .env.example placeholders.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
