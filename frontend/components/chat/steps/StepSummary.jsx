'use client';

import { Boxes, CheckCircle2, Cpu, KeyRound, Server } from 'lucide-react';
import { formatBytes } from '../../../lib/validators';
import { useWizard } from '../../wizard/WizardContext';
import { Chip } from '../ui';
import { MethodPill } from './EndpointList';

const AUTH_LABELS = {
  none: 'No authentication',
  bearer: 'Bearer Token',
  'api-key': 'API Key',
  'custom-header': 'Custom Header',
  basic: 'Basic Authentication',
};

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="min-w-0 truncate font-mono text-zinc-700 dark:text-zinc-300">{children}</span>
    </div>
  );
}

export function StepSummary({ stepIndex }) {
  const { draft, discovery, endpoints, payloads, preview, generation } = useWizard();

  if (stepIndex === 0) {
    return (
      <div className="space-y-1.5">
        <Row label="Project">{draft.name}</Row>
        <Row label="API base">{draft.apiBaseUrl}</Row>
        {draft.appUrl && <Row label="App URL">{draft.appUrl}</Row>}
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <KeyRound size={13} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          {AUTH_LABELS[draft.auth.type] || draft.auth.type}
        </div>
        <Chip tone="emerald">Credentials never stored</Chip>
      </div>
    );
  }

  if (stepIndex === 2) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <Cpu size={13} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
        {draft.ai.provider} Â· <span className="font-mono">{draft.ai.model}</span>
      </div>
    );
  }

  if (stepIndex === 3) {
    const checks = discovery.result?.checks || [];
    const okCount = checks.filter((check) => check.status === 'ok').length;
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="emerald">
            <Server size={11} aria-hidden="true" /> {endpoints.length} endpoint(s)
          </Chip>
          {checks.length > 0 && (
            <Chip tone={okCount === checks.length ? 'emerald' : 'amber'}>
              {okCount}/{checks.length} checks passed
            </Chip>
          )}
          <Chip tone="neutral">source: {discovery.result?.source || 'manual'}</Chip>
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-900">
          {endpoints.map((endpoint) => (
            <li key={`${endpoint.method}-${endpoint.path}`} className="flex items-center gap-2">
              <MethodPill method={endpoint.method} />
              <span className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{endpoint.path}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (stepIndex === 4) {
    const bodyEndpoints = endpoints.filter((endpoint) => ['POST', 'PUT', 'PATCH'].includes(String(endpoint.method).toUpperCase()));
    const configured = bodyEndpoints.filter((endpoint) => {
      const payload = payloads[`${String(endpoint.method).toUpperCase()} ${endpoint.path}`];
      return payload && (payload.hasBody === false || payload.confirmed === true || (payload.fields?.length ?? 0) > 0 || payload.example !== undefined);
    }).length;
    return (
      <Chip tone="emerald">
        {configured}/{bodyEndpoints.length} body endpoint(s) configured
      </Chip>
    );
  }

  if (stepIndex === 5) {
    return (
      <div className="flex flex-wrap gap-2">
        <Chip tone="emerald">
          <Boxes size={11} aria-hidden="true" /> {preview.result?.tools?.length || 0} MCP tools
        </Chip>
        <Chip tone="neutral">MCP :{preview.result?.ports?.mcpServer}</Chip>
        <Chip tone="neutral">AI :{preview.result?.ports?.aiServer}</Chip>
      </div>
    );
  }

  if (stepIndex === 6) {
    const failed = generation.status === 'error';
    return failed ? (
      <Chip tone="rose">{generation.error || 'Generation failed'}</Chip>
    ) : (
      <Chip tone="emerald">
        <CheckCircle2 size={11} aria-hidden="true" /> Project built
        {generation.project?.artifacts?.complete?.sizeBytes
          ? ` Â· ${formatBytes(generation.project.artifacts.complete.sizeBytes)}`
          : ''}
      </Chip>
    );
  }

  if (stepIndex === 7) {
    const artifacts = generation.project?.artifacts;
    if (!artifacts) return null;
    const items = [
      { kind: 'complete', label: 'Complete project', size: artifacts.complete?.sizeBytes },
      { kind: 'mcp-server', label: 'MCP Server', size: artifacts.parts?.mcpServer?.sizeBytes },
      { kind: 'ai-server', label: 'AI Server', size: artifacts.parts?.aiServer?.sizeBytes },
      { kind: 'ai-chat', label: 'AI Chat component', size: artifacts.parts?.aiChat?.sizeBytes },
    ];
    return (
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.kind} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-900 dark:text-zinc-300">
            <CheckCircle2 size={12} className="shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{formatBytes(item.size)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
