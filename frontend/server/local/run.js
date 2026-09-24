import fs from 'node:fs/promises';
import * as engine from '../../engine/src/index.js';
import { createSession, listSessions, requireSession, sessionDir, sweepExpired, getSession } from './store.js';
import { httpError } from './http.js';

/**
 * Standalone execution layer for the web wizard.
 *
 * Every operation that the platform backend used to expose over HTTP
 * (validate / discover / preview / generate / zip) runs inside the Next.js
 * server process through the vendored generator engine (`../../engine`).
 * Generation is synchronous: one request runs the whole 7-step job and
 * returns the finished session with the ZIP bytes embedded (base64), so it
 * also works on serverless hosts (Vercel) where no background worker or
 * shared filesystem exists. Sessions additionally live in an in-memory
 * store for local dev servers.
 */

/** Local machines usually target their own API - allow private hosts. */
export const PRIVATE_HOST_ALLOWLIST = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  ...String(process.env.ALLOWED_PRIVATE_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

const networkOptions = () => ({
  allowedPrivateHosts: PRIVATE_HOST_ALLOWLIST,
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 10_000,
});

const VALID_AUTH_TYPES = ['none', 'bearer', 'api-key', 'custom-header', 'basic'];
const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

/** The 7 phases of one generation run - identical to the platform job. */
export const JOB_STEPS = [
  { key: 'validate', label: 'Validating application' },
  { key: 'analyze', label: 'Analyzing API' },
  { key: 'mcp', label: 'Generating MCP Server' },
  { key: 'ai-server', label: 'Generating AI Server' },
  { key: 'ai-chat', label: 'Preparing AI Chat component' },
  { key: 'docs', label: 'Generating Documentation' },
  { key: 'zip', label: 'Creating ZIP' },
];

// ============================================================
// Draft guards (mirror of the backend Zod validation, kept light)
// ============================================================

function guardBaseUrl(apiBaseUrl, details) {
  if (typeof apiBaseUrl !== 'string' || !/^https?:\/\/.+/i.test(apiBaseUrl.trim())) {
    details.push({ path: 'apiBaseUrl', message: 'Must be a valid http(s) URL' });
  }
}

function guardDraft(body, { requireName = true } = {}) {
  const details = [];
  const name = String(body?.name || '').trim();
  if (requireName && name.length < 2) {
    details.push({ path: 'name', message: 'Name must be at least 2 characters' });
  }
  if (requireName && !name) details.push({ path: 'name', message: 'Name is required' });
  guardBaseUrl(body?.apiBaseUrl, details);

  const auth = body?.auth || {};
  if (auth.type && !VALID_AUTH_TYPES.includes(auth.type)) {
    details.push({ path: 'auth.type', message: `Unknown auth type "${auth.type}"` });
  }

  if (Array.isArray(body?.endpoints) && body.endpoints.length === 0) {
    details.push({ path: 'endpoints', message: 'At least one endpoint is required' });
  }
  if (body?.endpoints && !Array.isArray(body.endpoints)) {
    details.push({ path: 'endpoints', message: 'Must be an array of endpoints' });
  }

  for (const [idx, ep] of (Array.isArray(body?.endpoints) ? body.endpoints : []).entries()) {
    if (!ep || typeof ep !== 'object') {
      details.push({ path: `endpoints[${idx}]`, message: 'Invalid endpoint' });
      continue;
    }
    if (!VALID_METHODS.includes(String(ep.method || '').toUpperCase())) {
      details.push({ path: `endpoints[${idx}].method`, message: `Unsupported method "${ep.method}"` });
    }
    if (typeof ep.path !== 'string' || !ep.path.startsWith('/')) {
      details.push({ path: `endpoints[${idx}].path`, message: 'Path must start with "/"' });
    }
  }

  if (details.length) {
    throw httpError.badRequest('VALIDATION_ERROR', 'Invalid integration configuration', details);
  }
  return body;
}

// ============================================================
// Transient vs metadata auth (identical rule to the platform)
// ============================================================

/** Real credentials - live probes only, never stored. */
function transientAuth(body) {
  const a = body?.auth || {};
  const payload = { type: a.type || 'none' };
  if (a.token) payload.token = a.token;
  if (a.apiKeyHeader) payload.apiKeyHeader = a.apiKeyHeader;
  if (a.headerName) payload.headerName = a.headerName;
  if (a.headerValue) payload.headerValue = a.headerValue;
  if (a.username) payload.username = a.username;
  if (a.basicPassword) payload.basicPassword = a.basicPassword;
  return payload;
}

/** Non-secret auth metadata stored with the integration. */
function metaAuth(body) {
  const a = body?.auth || {};
  return {
    type: a.type || 'none',
    headerName: a.headerName || undefined,
    apiKeyHeader: a.apiKeyHeader || undefined,
    username: a.username || undefined,
    configured:
      a.type === 'none' ? true : Boolean(a.token || a.headerValue || a.basicPassword),
  };
}

// ============================================================
// Endpoints (sync compute)
// ============================================================

/** POST /api/integrations/validate - quick preflight. */
export async function runValidate(body) {
  const result = await engine.validateApi(
    { apiBaseUrl: body.apiBaseUrl, auth: transientAuth(body), endpoint: body.endpoint, method: body.method },
    networkOptions()
  );
  if (!result.success) {
    throw httpError.badRequest('VALIDATION_FAILED', result.message || 'Validation failed', result.checks);
  }
  return result;
}

/** POST /api/integrations/discover - probe + auto-discover endpoints. */
export async function runDiscover(body) {
  const result = await engine.discoverApi(
    { appUrl: body?.appUrl || undefined, apiBaseUrl: body.apiBaseUrl, auth: transientAuth(body) },
    { ...networkOptions(), timeoutMs: 60_000 }
  );
  if (!result.success) {
    throw httpError.badRequest('DISCOVERY_FAILED', result.message || 'Discovery failed', result.checks);
  }
  return result;
}

/** POST /api/integrations/preview - build the full plan (tools, ports, env). */
export async function runPreview(body) {
  guardDraft(body);
  return engine.buildPreview(body);
}

// ============================================================
// Generate (async in-process job + in-memory session)
// ============================================================

function jobFromDraft(id, config) {
  const auth = metaAuth({ auth: config.auth });
  const integration = {
    _id: id,
    name: config.name,
    appUrl: config.appUrl || null,
    apiBaseUrl: config.apiBaseUrl,
    authType: auth.type,
    authConfig: auth,
    aiConfig: config.ai || { provider: 'groq' },
    discovery: config.discovery || null,
    endpoints: config.endpoints || [],
    tools: config.tools || [],
    status: 'generating',
  };
  const job = {
    integrationId: id,
    status: 'queued',
    steps: JOB_STEPS.map((s) => ({ label: s.label, status: 'pending' })),
    currentStep: -1,
    error: null,
  };
  return { integration, job };
}

/**
 * POST /api/integrations/generate - creates the session and runs the whole
 * job synchronously, then returns the finished session with the ZIP bytes
 * embedded (base64) in `project.artifacts`. Serverless-safe: no background
 * work, no cross-request state - everything happens inside this one request.
 */
export async function startGeneration(body) {
  guardDraft(body);
  const { integration, job } = jobFromDraft('pending', body);
  const session = createSession(integration, job, { ...body, tools: body.tools || undefined });
  await runJob(session);
  if (session.rawArtifacts) {
    session.project.artifacts = await embedArtifacts(session.rawArtifacts);
  }
  sweepExpired().catch(() => {});
  return session;
}

/** Reads each generated ZIP and embeds its bytes as base64 for the client. */
async function embedArtifacts(artifacts) {
  const embed = async (artifact) => {
    if (!artifact?.filePath) return artifact;
    const { filePath, ...meta } = artifact;
    try {
      const data = (await fs.readFile(filePath)).toString('base64');
      return { ...meta, data };
    } catch {
      return meta;
    }
  };
  return {
    complete: await embed(artifacts.complete),
    parts: {
      aiServer: await embed(artifacts.parts.aiServer),
      mcpServer: await embed(artifacts.parts.mcpServer),
      aiChat: await embed(artifacts.parts.aiChat),
    },
  };
}

/** The 7-step generation loop - mirrors the platform background job. */
async function runJob(session) {
  const { integration, job } = session;
  let current = 0;
  const setStep = (index, status, detail) => {
    job.steps[index].status = status;
    if (detail !== undefined) job.steps[index].detail = detail;
    job.currentStep = status === 'pending' || status === 'completed' || status === 'failed' ? -1 : index;
    current = index;
  };
  const fail = (err) => {
    const message = err instanceof Error ? err.message : String(err);
    job.currentStep = current;
    job.steps[current].status = 'failed';
    job.steps[current].detail = message;
    job.status = 'failed';
    job.error = message;
    integration.status = 'failed';
    integration.updatedAt = new Date();
  };

  try {
    job.status = 'running';
    integration.status = 'generating';

    const config = {
      ...session.config,
      id: session.id,
      artifactsDir: sessionDir(session.id),
    };

    // Step 0 - validate: probe the target API (metadata auth only, like the
    // platform job - real credentials were never stored).
    setStep(0, 'running');
    const validation = await engine.validateApi(
      { apiBaseUrl: config.apiBaseUrl, auth: config.auth },
      { ...networkOptions(), timeoutMs: 15_000 }
    );
    setStep(0, 'completed', validation.latencyMs ? `Responded in ${validation.latencyMs}ms` : 'OK');

    // Step 1 - analyze: endpoints -> typed MCP tools.
    setStep(1, 'running');
    const analysis = await engine.analyzeEndpoints(config.endpoints);
    config.tools = analysis.tools;
    integration.tools = analysis.tools;
    setStep(1, 'completed', `${analysis.tools.length} tool(s) mapped`);

    // Steps 2-5 - render mcp-server, ai-server, ai-chat + docs; step 6 zips.
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

    session.project = {
      projectName: result.projectName,
      status: 'ready',
      artifacts: stripFilePaths(result.artifacts),
    };
    session.rawArtifacts = result.artifacts;

    job.status = 'completed';
    integration.status = 'ready';
    integration.updatedAt = new Date();
  } catch (err) {
    fail(err);
  }
}

function stripFilePaths(artifacts) {
  const keep = ({ fileName, sizeBytes, sha256, createdAt }) => ({ fileName, sizeBytes, sha256, createdAt });
  return {
    complete: keep(artifacts.complete),
    parts: {
      aiServer: keep(artifacts.parts.aiServer),
      mcpServer: keep(artifacts.parts.mcpServer),
      aiChat: keep(artifacts.parts.aiChat),
    },
  };
}

// ============================================================
// Read shapes (what the UI already consumes)
// ============================================================

function requireLiveSession(id) {
  const session = requireSession(id);
  if (!session) throw httpError.notFound('Integration not found');
  return session;
}

/** GET /api/integrations - dashboard rows (newest first). */
export function listIntegrations() {
  return listSessions().map((s) => s.integration);
}

/** GET /api/integrations/:id - integration + job + artifacts. */
export function integrationDetail(id) {
  const session = requireLiveSession(id);
  return {
    integration: session.integration,
    job: session.job,
    project: session.project,
  };
}

/** GET /api/integrations/:id/status - polling snapshot. */
export function integrationStatus(id) {
  const session = requireLiveSession(id);
  return {
    integration: { _id: session.id, name: session.integration.name, status: session.integration.status },
    job: session.job,
    project: session.project,
  };
}

/** Resolves the on-disk ZIP for `package` (complete|mcp-server|ai-server|ai-chat). */
export async function resolveArtifact(id, packageKey) {
  const session = getSession(id);
  if (!session) throw httpError.notFound('Integration not found');
  const raw = session.rawArtifacts;
  if (!raw) throw httpError.artifactNotFound('No generated artifact available yet');

  const kind = packageKey || 'complete';
  const key = { 'ai-server': 'aiServer', 'mcp-server': 'mcpServer', 'ai-chat': 'aiChat' }[kind];
  const artifact =
    kind === 'complete' ? raw.complete : key ? raw.parts?.[key] : null;

  // The engine result keeps file paths; verify the file is still on disk.
  if (!artifact) throw httpError.artifactNotFound('No generated artifact available yet');
  try {
    await fs.access(artifact.filePath);
  } catch {
    throw httpError.artifactNotFound('Artifact expired or removed - run the generation again');
  }
  return { fileName: artifact.fileName, filePath: artifact.filePath, sizeBytes: artifact.sizeBytes };
}
