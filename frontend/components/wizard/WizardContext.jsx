'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, LOCAL_MODE } from '../../lib/api';
import { validateAuthStep } from '../../lib/validators';
import { saveSession } from '../../lib/sessionStore';

export const STEP_IDS = ['application', 'authentication', 'ai', 'discovery', 'payload', 'preview', 'generate', 'download'];

export const STEPS = [
  { id: 'application', title: 'Application', subtitle: 'Your app & API details' },
  { id: 'authentication', title: 'Authentication', subtitle: 'How clients call your API' },
  { id: 'ai', title: 'AI Configuration', subtitle: 'Model provider settings' },
  { id: 'discovery', title: 'API Discovery', subtitle: 'Test & analyze your API' },
  { id: 'payload', title: 'Request Payloads', subtitle: 'Define payloads per endpoint' },
  { id: 'preview', title: 'Preview', subtitle: 'Review the generated plan' },
  { id: 'generate', title: 'Generate', subtitle: 'Build your integration' },
  { id: 'download', title: 'Download', subtitle: 'Get your project files' },
];

/** Methods that send a request body to the target API. */
export const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

/** Stable key for one endpoint inside the payload map. */
export function endpointKey(endpoint) {
  return `${String(endpoint.method).toUpperCase()} ${endpoint.path}`;
}

export const DEFAULT_DRAFT = {
  name: '',
  appUrl: '',
  apiBaseUrl: '',
  auth: {
    type: 'none',
    token: '',
    apiKeyHeader: 'x-api-key',
    headerName: 'x-auth-token',
    headerValue: '',
    username: '',
    basicPassword: '',
  },
  ai: { provider: 'groq', model: 'openai/gpt-oss-120b' },
};

const IDLE_DISCOVERY = { status: 'idle', result: null, error: null };
const IDLE_PREVIEW = { status: 'idle', result: null, error: null };
const IDLE_GENERATION = { status: 'idle', integrationId: null, job: null, project: null, error: null };

const GENERATION_LABELS = [
  'Validating application',
  'Analyzing API',
  'Generating MCP Server',
  'Generating AI Server',
  'Preparing AI Chat component',
  'Generating Documentation',
  'Creating ZIP',
];

/**
 * Serverless generation runs inside a single request, so the server cannot
 * stream step-by-step progress. This walks the 7 steps locally while the
 * request is in flight - the real (completed) job replaces it on arrival.
 */
function simulateProgress(commitGeneration) {
  const job = {
    status: 'running',
    steps: GENERATION_LABELS.map((label) => ({ label, status: 'pending' })),
    currentStep: 0,
    error: null,
  };
  let index = 0;
  const timer = setInterval(() => {
    index += 1;
    commitGeneration((prev) => {
      if (!prev.job || prev.status !== 'running') return prev;
      const steps = prev.job.steps.map((step, i) => {
        if (i < index) return { ...step, status: 'completed' };
        if (i === index) return { ...step, status: 'running' };
        return step;
      });
      return { ...prev, job: { ...prev.job, steps, currentStep: index } };
    });
    if (index >= GENERATION_LABELS.length - 1) {
      clearInterval(timer);
    }
  }, 1500);
  return { job, stop: () => clearInterval(timer) };
}

const WizardContext = createContext(null);

/**
 * Wizard state + local engine orchestration. The chat conversation controller
 * writes through the stable actions here and reads through `getState()`, which
 * always returns the latest values (refs are updated synchronously, so a
 * sequence like updateDraft() -> runDiscovery() never sees stale data).
 */
export function WizardProvider({ children }) {
  const [draft, setDraftState] = useState(DEFAULT_DRAFT);
  const [step, setStep] = useState(0);
  const [discovery, setDiscoveryState] = useState(IDLE_DISCOVERY);
  const [endpoints, setEndpointsState] = useState([]);
  const [payloads, setPayloadsState] = useState({});
  const [preview, setPreviewState] = useState(IDLE_PREVIEW);
  const [generation, setGenerationState] = useState(IDLE_GENERATION);

  const draftRef = useRef(draft);
  const discoveryRef = useRef(discovery);
  const endpointsRef = useRef(endpoints);
  const payloadsRef = useRef(payloads);
  const previewRef = useRef(preview);
  const generationRef = useRef(generation);

  const discoveryBusy = useRef(false);
  const previewBusy = useRef(false);
  const generationBusy = useRef(false);

  const commitDraft = useCallback((next) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const commitDiscovery = useCallback((next) => {
    const value = typeof next === 'function' ? next(discoveryRef.current) : next;
    discoveryRef.current = value;
    setDiscoveryState(value);
  }, []);

  const commitPreview = useCallback((next) => {
    const value = typeof next === 'function' ? next(previewRef.current) : next;
    previewRef.current = value;
    setPreviewState(value);
  }, []);

  const commitGeneration = useCallback((next) => {
    const value = typeof next === 'function' ? next(generationRef.current) : next;
    generationRef.current = value;
    setGenerationState(value);
  }, []);

  const updateDraft = useCallback((patch) => {
    commitDraft({ ...draftRef.current, ...patch });
  }, [commitDraft]);

  const updateAuth = useCallback((patch) => {
    commitDraft({ ...draftRef.current, auth: { ...draftRef.current.auth, ...patch } });
  }, [commitDraft]);

  const updateAi = useCallback((patch) => {
    commitDraft({ ...draftRef.current, ai: { ...draftRef.current.ai, ...patch } });
  }, [commitDraft]);

  const setEndpoints = useCallback((updater) => {
    const value = typeof updater === 'function' ? updater(endpointsRef.current) : updater;
    endpointsRef.current = value;
    setEndpointsState(value);
  }, []);

  const setPayloads = useCallback((updater) => {
    const value = typeof updater === 'function' ? updater(payloadsRef.current) : updater;
    payloadsRef.current = value;
    setPayloadsState(value);
  }, []);

  const getState = useCallback(() => ({
    draft: draftRef.current,
    endpoints: endpointsRef.current,
    payloads: payloadsRef.current,
    discovery: discoveryRef.current,
    preview: previewRef.current,
    generation: generationRef.current,
  }), []);

  /** Transient auth payload - sent for live tests only, never persisted. */
  const transientAuth = useCallback(() => {
    const a = draftRef.current.auth;
    const payload = { authType: a.type, type: a.type };
    if (a.token) payload.token = a.token;
    if (a.apiKeyHeader) payload.apiKeyHeader = a.apiKeyHeader;
    if (a.headerName) payload.headerName = a.headerName;
    if (a.headerValue) payload.headerValue = a.headerValue;
    if (a.username) payload.username = a.username;
    if (a.basicPassword) payload.basicPassword = a.basicPassword;
    return payload;
  }, []);

  /** Non-secret auth metadata used for preview/generate. */
  const metaAuth = useCallback(() => {
    const a = draftRef.current.auth;
    return {
      type: a.type,
      headerName: a.headerName || undefined,
      apiKeyHeader: a.apiKeyHeader || undefined,
      username: a.username || undefined,
      configured: a.type === 'none' ? true : Boolean(a.token || a.headerValue || a.basicPassword),
    };
  }, []);

  const endpointsWithPayloads = useMemo(
    () => endpoints.map((ep) => ({ ...ep, payload: payloads[endpointKey(ep)] || undefined })),
    [endpoints, payloads]
  );

  const collectEndpoints = useCallback(
    () => endpointsRef.current.map((ep) => ({ ...ep, payload: payloadsRef.current[endpointKey(ep)] || undefined })),
    []
  );

  const runDiscovery = useCallback(async (overrides = {}) => {
    if (discoveryBusy.current) return null;
    discoveryBusy.current = true;
    commitDiscovery({ status: 'loading', result: null, error: null });
    try {
      const d = draftRef.current;
      const result = await apiFetch('/api/integrations/discover', {
        method: 'POST',
        body: {
          appUrl: overrides.appUrl ?? (d.appUrl || undefined),
          apiBaseUrl: overrides.apiBaseUrl ?? d.apiBaseUrl,
          auth: overrides.auth ?? transientAuth(),
        },
        timeoutMs: 60_000,
      });
      commitDiscovery({ status: 'done', result, error: null });
      if (result.endpoints?.length) {
        setEndpoints((prev) => {
          const seen = new Set(prev.map((ep) => endpointKey(ep)));
          const fresh = result.endpoints.filter((ep) => !seen.has(endpointKey(ep)));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
      return result;
    } catch (err) {
      commitDiscovery({ status: 'error', result: null, error: err.message });
      return null;
    } finally {
      discoveryBusy.current = false;
    }
  }, [commitDiscovery, setEndpoints, transientAuth]);

  const runPreview = useCallback(async () => {
    if (previewBusy.current) return null;
    previewBusy.current = true;
    commitPreview({ status: 'loading', result: null, error: null });
    try {
      const d = draftRef.current;
      const result = await apiFetch('/api/integrations/preview', {
        method: 'POST',
        body: {
          name: d.name,
          appUrl: d.appUrl || undefined,
          apiBaseUrl: d.apiBaseUrl,
          auth: metaAuth(),
          ai: d.ai,
          endpoints: collectEndpoints(),
        },
        timeoutMs: 30_000,
      });
      commitPreview({ status: 'done', result, error: null });
      return result;
    } catch (err) {
      commitPreview({ status: 'error', result: null, error: err.message });
      return null;
    } finally {
      previewBusy.current = false;
    }
  }, [collectEndpoints, commitPreview, metaAuth]);

  const startGeneration = useCallback(async () => {
    if (generationBusy.current || !previewRef.current.result) return null;
    generationBusy.current = true;
    const d = draftRef.current;
    const payload = {
      name: d.name,
      appUrl: d.appUrl || undefined,
      apiBaseUrl: d.apiBaseUrl,
      auth: metaAuth(),
      ai: d.ai,
      discovery: discoveryRef.current.result,
      endpoints: collectEndpoints(),
      tools: previewRef.current.result.tools,
    };

    if (!LOCAL_MODE) {
      // Remote backend: enqueue the background job, then poll /status.
      commitGeneration({ status: 'starting', integrationId: null, job: null, project: null, error: null });
      try {
        const data = await apiFetch('/api/integrations/generate', { method: 'POST', body: payload, timeoutMs: 20_000 });
        commitGeneration({ status: 'running', integrationId: data.integration._id, job: data.job, project: null, error: null });
        return data.integration._id;
      } catch (err) {
        commitGeneration({ status: 'error', integrationId: null, job: null, project: null, error: err.message });
        return null;
      } finally {
        generationBusy.current = false;
      }
    }

    // Local / serverless mode: the whole job runs inside the one request.
    // Drive the 7-step progress locally while the request is in flight, then
    // swap in the real completed job when the response arrives.
    const sim = simulateProgress(commitGeneration);
    commitGeneration({ status: 'running', integrationId: null, job: sim.job, project: null, error: null });
    try {
      const data = await apiFetch('/api/integrations', { method: 'POST', body: payload, timeoutMs: 90_000 });
      const id = data.integration?._id;
      if (data.job?.status === 'completed') {
        saveSession({ id, integration: data.integration, job: data.job, project: data.project }).catch(() => {});
        commitGeneration({ status: 'done', integrationId: id, job: data.job, project: data.project, error: null });
        return id;
      }
      commitGeneration({
        status: 'error',
        integrationId: id,
        job: data.job || sim.job,
        project: data.project || null,
        error: data.job?.error || 'Generation failed',
      });
      return null;
    } catch (err) {
      commitGeneration((prev) => ({ ...prev, status: 'error', error: err.message }));
      return null;
    } finally {
      sim.stop();
      generationBusy.current = false;
    }
  }, [collectEndpoints, commitGeneration, metaAuth]);

  useEffect(() => {
    if (generation.status !== 'running' || !generation.integrationId) return undefined;
    const id = generation.integrationId;
    const timer = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/integrations/${id}/status`);
        commitGeneration((prev) => {
          if (data.job?.status === 'completed') {
            return { ...prev, status: 'done', job: data.job, project: data.project, error: null };
          }
          if (data.job?.status === 'failed') {
            return { ...prev, status: 'error', job: data.job, project: data.project, error: data.job.error || 'Generation failed' };
          }
          return { ...prev, job: data.job, project: data.project };
        });
      } catch {
        /* transient polling errors are ignored */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [generation.status, generation.integrationId, commitGeneration]);

  const invalidate = useCallback(({ discovery: resetDiscovery, endpoints: resetEndpoints, payloads: resetPayloads, preview: resetPreview, generation: resetGeneration } = {}) => {
    if (resetDiscovery) commitDiscovery(IDLE_DISCOVERY);
    if (resetEndpoints) setEndpoints([]);
    if (resetPayloads) setPayloads({});
    if (resetPreview) commitPreview(IDLE_PREVIEW);
    if (resetGeneration) commitGeneration(IDLE_GENERATION);
  }, [commitDiscovery, commitGeneration, commitPreview, setEndpoints, setPayloads]);

  const reset = useCallback(() => {
    commitDraft(DEFAULT_DRAFT);
    setStep(0);
    commitDiscovery(IDLE_DISCOVERY);
    setEndpoints([]);
    setPayloads({});
    commitPreview(IDLE_PREVIEW);
    commitGeneration(IDLE_GENERATION);
  }, [commitDiscovery, commitDraft, commitGeneration, commitPreview, setEndpoints, setPayloads]);

  const goToStep = useCallback((target) => setStep(Math.max(0, Math.min(STEP_IDS.length - 1, target))), []);

  const payloadReady = useMemo(() => {
    if (!endpoints.length) return false;
    return endpoints.every((ep) => {
      if (!BODY_METHODS.includes(ep.method.toUpperCase())) return true;
      const p = payloads[endpointKey(ep)];
      if (!p) return false;
      if (p.hasBody === false) return true;
      if (p.confirmed === true) return true;
      return Boolean((p.fields?.length ?? 0) > 0 || p.example !== undefined);
    });
  }, [endpoints, payloads]);

  const value = useMemo(
    () => ({
      draft, updateDraft, updateAuth, updateAi,
      step, goToStep,
      discovery, runDiscovery,
      endpoints, setEndpoints, endpointsWithPayloads,
      payloads, setPayloads, payloadReady,
      preview, runPreview,
      generation, startGeneration,
      reset, invalidate, getState,
      transientAuth, metaAuth,
    }),
    [draft, updateDraft, updateAuth, updateAi, step, goToStep, discovery, runDiscovery, endpoints, setEndpoints, endpointsWithPayloads, payloads, setPayloads, payloadReady, preview, runPreview, generation, startGeneration, reset, invalidate, getState, transientAuth, metaAuth]
  );

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) throw new Error('useWizard must be used inside WizardProvider');
  return context;
}

/** Step gating rules - which steps the user may advance to. */
export function stepAccess(wizard) {
  const { draft, preview, generation, endpoints, payloadReady } = wizard;
  const validApp = draft.apiBaseUrl.trim().length > 0 && draft.name.trim().length > 1;
  const validAuth = validateAuthStep(draft.auth);
  // Endpoints can come from a live test OR manual route entry - only the
  // resulting list matters for the payload/preview steps.
  const discovered = endpoints.length > 0;

  return {
    canEnter: [
      true, // application
      validApp, // authentication
      validApp && validAuth, // ai
      validApp && validAuth, // discovery
      discovered, // payload
      discovered && payloadReady, // preview
      Boolean(preview.result), // generate
      generation.status === 'done', // download
    ],
  };
}
