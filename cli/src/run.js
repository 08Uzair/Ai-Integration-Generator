import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as engine from '../engine/src/index.js';

/**
 * Local execution mode for the wizard.
 *
 * Everything that used to run on the backend API (validate / discover /
 * preview / generate / zip) now runs inside this process through the
 * vendored generator engine (./engine). The CLI is fully standalone.
 */

/** Local machines usually target their own API - allow private hosts. */
const PRIVATE_HOST_ALLOWLIST = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  ...String(process.env.ALLOWED_PRIVATE_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

export const LOCAL_NETWORK = { allowedPrivateHosts: PRIVATE_HOST_ALLOWLIST };

/** Transient auth payload - used for live probes only, never persisted. */
export function transientAuth(state) {
  const a = state.auth;
  const payload = { authType: a.type, type: a.type };
  if (a.token) payload.token = a.token;
  if (a.apiKeyHeader) payload.apiKeyHeader = a.apiKeyHeader;
  if (a.headerName) payload.headerName = a.headerName;
  if (a.headerValue) payload.headerValue = a.headerValue;
  if (a.username) payload.username = a.username;
  if (a.basicPassword) payload.basicPassword = a.basicPassword;
  return payload;
}

/** Non-secret auth metadata used for preview/generation. */
export function metaAuth(state) {
  const a = state.auth;
  return {
    type: a.type,
    headerName: a.headerName || undefined,
    apiKeyHeader: a.apiKeyHeader || undefined,
    username: a.username || undefined,
    configured:
      a.type === 'none' ? true : Boolean(a.token || a.headerValue || a.basicPassword),
  };
}

/** Endpoints enriched with the user-defined payload. */
export function endpointsWithPayloads(state) {
  return state.endpoints.map((ep) => ({
    ...ep,
    payload: state.payloads[`${String(ep.method).toUpperCase()} ${ep.path}`] || undefined,
  }));
}

/** The full draft used by preview + generation. */
export function buildConfig(state) {
  return {
    name: state.name,
    appUrl: state.appUrl || undefined,
    apiBaseUrl: state.apiBaseUrl,
    auth: metaAuth(state),
    ai: state.ai,
    discovery: state.discovery || undefined,
    endpoints: endpointsWithPayloads(state),
  };
}

/** Stable fingerprint of the draft - used to skip repeat generations. */
export function configHash(state) {
  return crypto.createHash('sha256').update(JSON.stringify(buildConfig(state))).digest('hex');
}

/** Live discovery: probe the API and auto-discover endpoints (step 4). */
export async function runDiscovery(state) {
  const result = await engine.discoverApi(
    {
      appUrl: state.appUrl || undefined,
      apiBaseUrl: state.apiBaseUrl,
      auth: transientAuth(state),
    },
    { ...LOCAL_NETWORK, timeoutMs: 60_000 }
  );
  if (!result.success) {
    throw new Error(result.message || 'Discovery failed');
  }
  return result;
}

/** Builds the full plan shown on the Preview step (tools, ports, env). */
export async function buildPreview(state) {
  return engine.buildPreview(buildConfig(state));
}

/** The 7 phases of one generation run - identical to the backend job. */
export const JOB_STEPS = [
  { key: 'validate', label: 'Validating application' },
  { key: 'analyze', label: 'Analyzing API' },
  { key: 'mcp', label: 'Generating MCP Server' },
  { key: 'ai-server', label: 'Generating AI Server' },
  { key: 'ai-chat', label: 'Preparing AI Chat component' },
  { key: 'docs', label: 'Generating Documentation' },
  { key: 'zip', label: 'Creating ZIP' },
];

/** Resolves the artifact meta for a package key ('complete' | 'ai-server' | ...). */
export function artifactFor(generation, packageKey) {
  const parts = generation?.artifacts?.parts;
  if (!parts) return null;
  if (packageKey === 'complete') return generation.artifacts.complete || null;
  const key = {
    'ai-server': 'aiServer',
    'mcp-server': 'mcpServer',
    'ai-chat': 'aiChat',
  }[packageKey];
  return (key && parts[key]) || null;
}

/**
 * Runs the full generation job in-process:
 *   validate -> analyze endpoints -> render project -> zip
 * Progress is mirrored onto state.generation.steps (same 7 labels the
 * backend used to persist), so the step UI can render identically.
 */
export async function runGeneration(state, onStep = () => {}) {
  const hash = configHash(state);
  const existing = state.generation;

  // Re-entering the Generate step with an unchanged draft reuses the run.
  if (existing?.status === 'completed' && existing.configHash === hash) {
    const meta = artifactFor(existing, 'complete');
    if (meta) {
      try {
        await fs.access(meta.filePath);
        return existing;
      } catch {
        /* artifacts vanished - regenerate */
      }
    }
  }

  const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-generate-'));
  const steps = JOB_STEPS.map((s) => ({ label: s.label, status: 'pending' }));
  state.generation = {
    configHash: hash,
    status: 'running',
    steps,
    artifactsDir,
    projectName: null,
    artifacts: null,
  };

  const config = buildConfig(state);
  config.id = 'cli-local';
  config.artifactsDir = artifactsDir;

  let current = 0;
  const setStep = (index, status, detail) => {
    steps[index].status = status;
    if (detail) steps[index].detail = detail;
    current = index;
    onStep(index, status, detail);
  };

  try {
    setStep(0, 'running');
    const validation = await engine.validateApi(
      { apiBaseUrl: config.apiBaseUrl, auth: config.auth },
      { ...LOCAL_NETWORK, timeoutMs: 15_000 }
    );
    setStep(
      0,
      'completed',
      validation.latencyMs ? `Responded in ${validation.latencyMs}ms` : 'OK'
    );

    setStep(1, 'running');
    const analysis = await engine.analyzeEndpoints(config.endpoints);
    config.tools = analysis.tools;
    setStep(1, 'completed', `${analysis.tools.length} tool(s) mapped`);

    // Rendering covers steps 2-5 (mcp-server, ai-server, ai-chat, docs).
    const result = await engine.generateProject(config);
    setStep(2, 'completed');
    setStep(3, 'completed');
    setStep(4, 'completed');
    setStep(5, 'completed');
    setStep(
      6,
      'completed',
      `${result.artifacts.complete.fileName} (${Math.round(result.artifacts.complete.sizeBytes / 1024)} KB)`
    );

    state.generation.status = 'completed';
    state.generation.projectName = result.projectName;
    state.generation.artifacts = result.artifacts;
    return state.generation;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps[current].status = 'failed';
    steps[current].detail = message;
    state.generation.status = 'failed';
    throw err;
  }
}
