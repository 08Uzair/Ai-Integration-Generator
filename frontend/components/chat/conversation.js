import { BODY_METHODS, endpointKey } from '@/components/wizard/WizardContext';
import { downloadFile, downloadArtifactData } from '@/lib/api';
import { FIELD_TYPES, fieldsFromExampleText } from '@/lib/payload';
import { parseRouteFile } from '@/lib/routeParser';
import { STEP_META } from './stepMeta';

export const AUTH_TYPES = [
  { value: 'none', label: 'No authentication' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key', label: 'API Key' },
  { value: 'custom-header', label: 'Custom Header' },
  { value: 'basic', label: 'Basic Authentication' },
];

export const AUTH_LABELS = Object.fromEntries(AUTH_TYPES.map((option) => [option.value, option.label]));

const AUTH_ALIASES = {
  none: 'none',
  no: 'none',
  'no auth': 'none',
  'no authentication': 'none',
  n: 'none',
  bearer: 'bearer',
  token: 'bearer',
  'bearer token': 'bearer',
  'api-key': 'api-key',
  apikey: 'api-key',
  'api key': 'api-key',
  key: 'api-key',
  'custom-header': 'custom-header',
  header: 'custom-header',
  'custom header': 'custom-header',
  basic: 'basic',
  'basic auth': 'basic',
  'basic authentication': 'basic',
};

const PACKAGE_ALIASES = {
  complete: 'complete',
  'complete project': 'complete',
  all: 'all',
  everything: 'all',
  'mcp-server': 'mcp-server',
  mcp: 'mcp-server',
  'mcp server': 'mcp-server',
  'ai-server': 'ai-server',
  'ai server': 'ai-server',
  'ai-chat': 'ai-chat',
  'ai chat': 'ai-chat',
  chat: 'ai-chat',
  'ai chat component': 'ai-chat',
};

const HELP = [
  'I guide you through 8 steps: application details, authentication, AI configuration, API discovery, request payloads, preview, generation and download.',
  'I ask every question here in the chat - just type your answer in the message box (or tap a suggestion chip).',
  'Useful commands: "back" to revisit the previous step, "help" for this message, "start over" to reset everything.',
].join(' ');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mergeEndpoints(prev, incoming) {
  const seen = new Set(prev.map((ep) => endpointKey(ep)));
  const fresh = incoming.filter((ep) => !seen.has(endpointKey(ep)));
  return fresh.length ? [...prev, ...fresh] : prev;
}

function formatEndpointList(endpoints) {
  if (!endpoints.length) return 'No endpoints yet.';
  return endpoints.map((ep, i) => `${i + 1}. ${String(ep.method).toUpperCase()} ${ep.path}`).join('\n');
}

function packageFileName(generation, draft, kind) {
  const slug = generation?.project?.projectName || draft?.name || 'project';
  return `${slug}-${kind}.zip`;
}

/** Maps a download package name to its artifact entry in the session. */
const ARTIFACT_KEYS = {
  complete: 'complete',
  'mcp-server': 'mcpServer',
  'ai-server': 'aiServer',
  'ai-chat': 'aiChat',
};

function artifactFor(generation, kind) {
  const artifacts = generation?.project?.artifacts;
  if (!artifacts) return null;
  const key = ARTIFACT_KEYS[kind];
  return key === 'complete' ? artifacts.complete : artifacts.parts?.[key] || null;
}

/**
 * Drives the whole wizard as a conversation: every piece of data is requested
 * as a chat question and answered through the composer. Step cards only show
 * live status - they never contain form fields.
 */
export function createConversation({ wizard, append, setTyping, setActive, onReset }) {
  const w = () => wizard();
  const s = () => w().getState();

  let step = 0;
  let data = {};
  let current = null;
  // True while the user navigated via the top step bar. Completed steps then
  // ask "keep / edit" instead of auto-advancing through the whole wizard.
  let navigating = false;
  // When set (0|1|4), the finish of that step stops at a "keep / edit"
  // question instead of advancing - used while re-editing a step.
  let stopAtStep = -1;

  const say = (text) => append({ role: 'assistant', kind: 'text', text });

  function ask(id, text, options, handler) {
    const opts = options || {};
    const messageId = append({ role: 'assistant', kind: 'text', text, suggestions: opts.suggestions });
    current = {
      id,
      messageId,
      secret: Boolean(opts.secret),
      placeholder: opts.placeholder,
      suggestions: opts.suggestions,
      handler,
    };
    setActive(current);
    return current;
  }

  async function withTyping(fn) {
    setTyping(true);
    try {
      return await fn();
    } finally {
      setTyping(false);
    }
  }

  function resetDownstream(from) {
    if (from <= 0) {
      data.discovery = {};
      data.payload = { index: 0, forceAsked: {} };
      data.preview = {};
      data.generate = {};
      w().invalidate({ discovery: true, endpoints: true, payloads: true, preview: true, generation: true });
      return;
    }
    if (from === 1) {
      data.discovery = {};
      data.payload = { index: 0, forceAsked: {} };
      data.preview = {};
      data.generate = {};
      w().invalidate({ discovery: true, preview: true, generation: true });
      return;
    }
    if (from === 2) {
      data.payload = { index: 0, forceAsked: {} };
      data.preview = {};
      data.generate = {};
      w().invalidate({ preview: true, generation: true });
      return;
    }
    data.preview = {};
    data.generate = {};
    w().invalidate({ preview: true, generation: true });
  }

  function invalidatePreview() {
    data.preview = {};
    data.generate = {};
    w().invalidate({ preview: true, generation: true });
  }

  function enterStep(next) {
    if (navigating) {
      // Arrived here by clicking a step in the top bar: if this step is
      // already complete, ask before walking forward - never auto-advance
      // through the rest of the wizard.
      navigating = false;
      return askStepKeep(step, next);
    }
    stopAtStep = -1;
    step = next;
    data.force = null;
    w().goToStep(next);
    append({ role: 'assistant', kind: 'step', stepIndex: next });
    return askNext();
  }

  /**
   * Top-bar navigation: jump to a step without wiping answers and without
   * re-running live tests/preview/generation. The step becomes active and
   * its next unanswered question is asked; if the step is complete, a
   * "keep / edit" question is asked instead of auto-advancing.
   */
  function navigateTo(next) {
    const target = Math.max(0, Math.min(7, next));
    navigating = true;
    stopAtStep = -1;
    step = target;
    data.force = null;
    w().goToStep(target);
    append({ role: 'assistant', kind: 'step', stepIndex: target });
    return askNext();
  }

  /** Shown when a navigated-to step has nothing left to answer. */
  function askStepKeep(target, next) {
    const title = STEP_META[target]?.title || `Step ${target + 1}`;
    ask(
      `navigate.keep:${target}`,
      `"${title}" is already complete. Type "keep" to continue to the next step, or "edit" to change this step.`,
      { suggestions: ['keep', 'edit'] },
      (text) => {
        const lower = text.toLowerCase().trim();
        if (['keep', 'continue', 'next', 'done'].includes(lower)) {
          navigating = false;
          stopAtStep = -1;
          return enterStep(next);
        }
        if (['edit', 'redo', 'change'].includes(lower)) {
          navigating = true;
          stopAtStep = target;
          return redoStep(target);
        }
        say('Type "keep" or "edit".');
        return askStepKeep(target, next);
      }
    );
  }

  /** Re-asks a completed step's questions with "keep" suggestions. */
  function redoStep(target) {
    switch (target) {
      case 0:
        data.force = 0;
        data.app = {};
        return askApplication();
      case 1:
        data.force = 1;
        return askAuthentication();
      case 4:
        data.force = 4;
        data.payload = { index: 0, forceAsked: {} };
        return askPayload();
      default:
        // Steps with their own options questions (discovery, preview,
        // generate, download) and the informational AI step are re-shown
        // through their natural question flow.
        return askStepKeep(target, target + 1);
    }
  }

  function openStep(next, { force = false } = {}) {
    const target = Math.max(0, Math.min(7, next));
    navigating = false;
    stopAtStep = -1;
    step = target;
    data.force = force ? target : null;
    if (force) {
      if (target === 0) data.app = {};
      else if (target === 1) data.auth = {};
      else if (target === 3) data.discovery = {};
      else if (target === 4) data.payload = { index: 0, forceAsked: {} };
      else if (target === 5) data.preview = {};
      else if (target === 6) data.generate = {};
    }
    w().goToStep(target);
    append({ role: 'assistant', kind: 'step', stepIndex: target });
    return askNext();
  }

  function askNext() {
    switch (step) {
      case 0:
        return askApplication();
      case 1:
        return askAuthentication();
      case 2:
        return askAi();
      case 3:
        return askDiscovery();
      case 4:
        return askPayload();
      case 5:
        return askPreview();
      case 6:
        return askGenerate();
      case 7:
        return askDownload();
      default:
        return undefined;
    }
  }

  async function answer(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const lower = text.toLowerCase();

    if (['help', '?', 'commands'].includes(lower)) {
      say(HELP);
      if (current) setActive(current);
      return;
    }
    if (/^(reset|restart|start over|start again|new chat)$/.test(lower)) {
      onReset();
      return;
    }
    if (lower === 'back') {
      return openStep(Math.max(0, step - 1), { force: true });
    }
    if (!current?.handler) {
      say('I am not waiting for an answer right now. Type "help" to see how this works.');
      return;
    }
    navigating = false;
    try {
      await current.handler(text);
    } catch (err) {
      say(`Something went wrong: ${err.message}`);
      say('You can try again, type "back" to revisit the previous step, or "help" for guidance.');
    }
  }

  // ============================================================
  // Step 1 - Application
  // ============================================================

  function askApplication() {
    const draft = s().draft;
    const a = data.app || (data.app = {});
    if (data.force === 0) {
      if (!a.forceStage) {
        a.forceStage = 1;
        return askName({ keep: true });
      }
      if (a.forceStage === 1) {
        a.forceStage = 2;
        return askAppUrl({ keep: true });
      }
      if (a.forceStage === 2) {
        a.forceStage = 3;
        return askApiBaseUrl({ keep: true });
      }
      return finishApplication();
    }
    if (!a.name && draft.name.trim().length < 2) return askName();
    if (!a.appUrl) return askAppUrl();
    if (!a.apiBaseUrl && !/^https?:\/\/.+/i.test(draft.apiBaseUrl.trim())) return askApiBaseUrl();
    return finishApplication();
  }

  function askName({ keep = false } = {}) {
    const existing = s().draft.name;
    const useKeep = keep && Boolean(existing);
    ask(
      'app.name',
      useKeep
        ? `The project is currently named "${existing}". Type a new name, or "keep" to leave it.`
        : 'What should I call your project? It names the generated folder, packages and services.',
      { placeholder: 'e.g. My API Assistant', suggestions: useKeep ? ['keep'] : undefined },
      async (text) => {
        if (useKeep && text.toLowerCase() === 'keep') {
          data.app.name = true;
          return askApplication();
        }
        const name = text.trim();
        if (name.length < 2) {
          say('The project name must be at least 2 characters.');
          return askName({ keep });
        }
        const changed = name !== existing;
        w().updateDraft({ name });
        data.app.name = true;
        say(`Project name set to "${name}".`);
        if (changed && existing) invalidatePreview();
        return askApplication();
      }
    );
  }

  function askAppUrl({ keep = false } = {}) {
    const existing = s().draft.appUrl;
    const useKeep = keep && Boolean(existing);
    ask(
      'app.appUrl',
      useKeep
        ? `The application URL is currently ${existing}. Type a new URL, "skip" to clear it, or "keep".`
        : 'What is your application URL? It is optional - type "skip" if you only have the API.',
      { placeholder: 'https://example.com', suggestions: useKeep ? ['keep', 'skip'] : ['skip'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (useKeep && lower === 'keep') {
          data.app.appUrl = true;
          return askApplication();
        }
        if (['skip', 'none', '-', 'no'].includes(lower)) {
          w().updateDraft({ appUrl: '' });
          data.app.appUrl = true;
          say('No application URL - fine, the API base URL is what matters.');
          if (existing) invalidatePreview();
          return askApplication();
        }
        if (!/^https?:\/\/.+/i.test(text)) {
          say('The application URL must start with http:// or https:// (or type "skip").');
          return askAppUrl({ keep });
        }
        w().updateDraft({ appUrl: text });
        data.app.appUrl = true;
        say(`Application URL set to ${text}.`);
        if (text !== existing && existing) invalidatePreview();
        return askApplication();
      }
    );
  }

  function askApiBaseUrl({ keep = false } = {}) {
    const existing = s().draft.apiBaseUrl;
    const useKeep = keep && Boolean(existing);
    ask(
      'app.apiBaseUrl',
      useKeep
        ? `The API base URL is currently ${existing}. Type a new URL, or "keep".`
        : 'What is the base URL of the API I should turn into MCP tools? Use the API root (e.g. https://api.example.com/v1), not your website.',
      { placeholder: 'https://api.example.com/api', suggestions: useKeep ? ['keep'] : undefined },
      async (text) => {
        if (useKeep && text.toLowerCase() === 'keep') {
          data.app.apiBaseUrl = true;
          return askApplication();
        }
        const url = text.trim();
        if (!/^https?:\/\/.+/i.test(url)) {
          say('The API base URL must be a valid http(s) URL, e.g. https://api.example.com/api.');
          return askApiBaseUrl({ keep });
        }
        if (/@/.test(url.split('://')[1] || '')) {
          say('URLs must not contain credentials - authentication is handled in the next step.');
          return askApiBaseUrl({ keep });
        }
        const changed = url !== existing;
        w().updateDraft({ apiBaseUrl: url });
        data.app.apiBaseUrl = true;
        say(`API base URL set to ${url}.`);
        if (changed && existing) resetDownstream(0);
        return askApplication();
      }
    );
  }

  function finishApplication() {
    const draft = s().draft;
    say(`Saved: "${draft.name}" · API base ${draft.apiBaseUrl}${draft.appUrl ? ` · app ${draft.appUrl}` : ''}.`);
    if (stopAtStep === 0) {
      stopAtStep = -1;
      navigating = false;
      return askStepKeep(0, 1);
    }
    return enterStep(1);
  }

  // ============================================================
  // Step 2 - Authentication
  // ============================================================

  function askAuthentication() {
    const a = data.auth || (data.auth = {});
    if (data.force === 1 && !a.type) return askAuthType({ keep: true });
    if (!a.type) return askAuthType();
    return askAuthCredentials({ keep: data.force === 1 });
  }

  function askAuthType({ keep = false } = {}) {
    const existing = s().draft.auth.type;
    ask(
      'auth.type',
      keep
        ? `Authentication is currently "${AUTH_LABELS[existing]}". Type a new method (none, bearer, api-key, custom-header, basic) or "keep".`
        : 'How should the generated MCP server authenticate to your API? Reply with one of: none, bearer, api-key, custom-header, basic.',
      { suggestions: keep ? ['keep', ...AUTH_TYPES.map((t) => t.value)] : AUTH_TYPES.map((t) => t.value) },
      async (text) => {
        const lower = text.toLowerCase().trim();
        if (keep && lower === 'keep') {
          data.auth.type = true;
          return askAuthCredentials({ keep: true });
        }
        const type = AUTH_ALIASES[lower];
        if (!type) {
          say('I did not recognise that method. Choose none, bearer, api-key, custom-header or basic.');
          return askAuthType({ keep });
        }
        const changed = type !== existing;
        w().updateAuth({ type });
        data.auth = { type: true };
        say(`Authentication method: ${AUTH_LABELS[type]}.`);
        if (changed && existing) resetDownstream(1);
        return askAuthCredentials({ keep: keep && !changed });
      }
    );
  }

  function askAuthCredentials({ keep = false } = {}) {
    const auth = s().draft.auth;
    const a = data.auth || (data.auth = {});
    if (auth.type === 'none') {
      say('No authentication - the generated project ships without auth headers. You can still add them later in mcp-server/.env.');
      return finishAuthentication();
    }
    if (auth.type === 'bearer') {
      if (a.token) return finishAuthentication();
      return askSecret({
        id: 'auth.token',
        prompt: keep && auth.token
          ? 'The bearer token is already set. Paste a new token or type "keep".'
          : 'Paste your bearer token. It is used only for the live connection test and is never stored or written into the generated project.',
        existing: auth.token,
        keep,
        field: 'token',
        label: 'Bearer token',
        done: () => finishAuthentication(),
      });
    }
    if (auth.type === 'api-key') {
      if (!a.apiKeyHeader) {
        return askApiKeyHeader({ keep, done: () => askAuthCredentials({ keep }) });
      }
      if (!a.token) {
        return askSecret({
          id: 'auth.token',
          prompt: keep && auth.token
            ? 'The API key is already set. Paste a new key or type "keep".'
            : `Paste your API key (sent in the "${auth.apiKeyHeader || 'x-api-key'}" header). It is used only for the live connection test.`,
          existing: auth.token,
          keep,
          field: 'token',
          label: 'API key',
          done: () => finishAuthentication(),
        });
      }
      return finishAuthentication();
    }
    if (auth.type === 'custom-header') {
      if (!a.headerName) {
        return askTextValue({
          id: 'auth.headerName',
          prompt: keep && auth.headerName ? `The header name is currently "${auth.headerName}". Type a new one or "keep".` : 'What is the custom header name?',
          existing: auth.headerName,
          keep,
          placeholder: 'x-auth-token',
          suggestions: ['x-auth-token', 'Authorization'],
          field: 'headerName',
          label: 'Header name',
          apply: (value) => w().updateAuth({ headerName: value }),
          done: () => askAuthCredentials({ keep }),
        });
      }
      if (!a.headerValue) {
        return askSecret({
          id: 'auth.headerValue',
          prompt: keep && auth.headerValue
            ? 'The header value is already set. Paste a new value or type "keep".'
            : `Paste the value for the "${auth.headerName}" header. It is used only for the live connection test.`,
          existing: auth.headerValue,
          keep,
          field: 'headerValue',
          label: 'Header value',
          done: () => finishAuthentication(),
        });
      }
      return finishAuthentication();
    }
    if (!a.username) {
      return askTextValue({
        id: 'auth.username',
        prompt: keep && auth.username ? `The username is currently "${auth.username}". Type a new one or "keep".` : 'Basic authentication - what is the username?',
        existing: auth.username,
        keep,
        placeholder: 'your-username',
        field: 'username',
        label: 'Username',
        apply: (value) => w().updateAuth({ username: value }),
        done: () => askAuthCredentials({ keep }),
      });
    }
    if (!a.basicPassword) {
      return askSecret({
        id: 'auth.basicPassword',
        prompt: keep && auth.basicPassword
          ? 'The password is already set. Paste a new password or type "keep".'
          : 'And the password? (It is used only for the live connection test.)',
        existing: auth.basicPassword,
        keep,
        field: 'basicPassword',
        label: 'Password',
        allowEmpty: true,
        done: () => finishAuthentication(),
      });
    }
    return finishAuthentication();
  }

  function askSecret({ id, prompt, existing, keep, field, label, done, allowEmpty = false }) {
    const useKeep = keep && Boolean(existing);
    ask(id, prompt, { secret: true, suggestions: useKeep ? ['keep'] : undefined }, async (text) => {
      if (useKeep && text.toLowerCase() === 'keep') {
        data.auth[field] = true;
        return done();
      }
      const value = text.trim();
      if (!value && !allowEmpty) {
        say(`${label} is required - or type "keep" to reuse the current one.`);
        return askSecret({ id, prompt, existing, keep, field, label, done, allowEmpty });
      }
      w().updateAuth({ [field]: value });
      data.auth[field] = true;
      say(`${label} captured (kept in this browser only).`);
      return done();
    });
  }

  function askTextValue({ id, prompt, existing, keep, placeholder, suggestions, field, label, apply, done }) {
    const useKeep = keep && Boolean(existing);
    ask(id, prompt, { placeholder, suggestions: useKeep ? ['keep'] : suggestions }, async (text) => {
      if (useKeep && text.toLowerCase() === 'keep') {
        data.auth[field] = true;
        return done();
      }
      const value = text.trim();
      if (!value) {
        say(`${label} is required.`);
        return askTextValue({ id, prompt, existing, keep, placeholder, suggestions, field, label, apply, done });
      }
      apply(value);
      data.auth[field] = true;
      say(`${label}: ${value}.`);
      return done();
    });
  }

  function askApiKeyHeader({ keep, done }) {
    const auth = s().draft.auth;
    return askTextValue({
      id: 'auth.apiKeyHeader',
      prompt: keep && auth.apiKeyHeader ? `The API key header is currently "${auth.apiKeyHeader}". Type a new header name or "keep".` : 'Which HTTP header carries your API key?',
      existing: auth.apiKeyHeader || 'x-api-key',
      keep,
      placeholder: 'x-api-key',
      suggestions: ['x-api-key', 'Authorization'],
      field: 'apiKeyHeader',
      label: 'API key header',
      apply: (value) => w().updateAuth({ apiKeyHeader: value }),
      done,
    });
  }

  function finishAuthentication() {
    say(`Authentication: ${AUTH_LABELS[s().draft.auth.type]}. Credentials stay in this browser and are never exported.`);
    if (stopAtStep === 1) {
      stopAtStep = -1;
      navigating = false;
      return askStepKeep(1, 2);
    }
    return enterStep(2);
  }

  // ============================================================
  // Step 3 - AI configuration (informational)
  // ============================================================

  function askAi() {
    say('AI configuration is fixed: Groq with model openai/gpt-oss-120b. The generated ai-server reads GROQ_API_KEY from its own .env file - I never ask for or store that key.');
    return enterStep(3);
  }

  // ============================================================
  // Step 4 - API discovery
  // ============================================================

  function askDiscovery() {
    const st = data.discovery || (data.discovery = {});
    if (data.force === 3) {
      if (!s().endpoints.length) {
        say('You are revisiting discovery, but there are no endpoints yet. Paste route lines below.');
        return askDiscoveryRoutes();
      }
      return askDiscoveryOptions({ force: true });
    }
    if (st.phase === 'done' || st.phase === 'manual') return askDiscoveryOptions();
    return withTyping(async () => {
      const draft = s().draft;
      say(`Testing ${draft.apiBaseUrl} - checking reachability, JSON responses and looking for an OpenAPI spec.`);
      const result = await w().runDiscovery();
      if (result) {
        const endpoints = s().endpoints;
        const checks = result.checks || [];
        const okCount = checks.filter((c) => c.status === 'ok').length;
        if (endpoints.length) {
          st.phase = 'done';
          say(`Connection test complete: ${endpoints.length} endpoint(s) ready (${okCount}/${checks.length} checks passed, source: ${result.source || 'api'}).`);
          return askDiscoveryOptions();
        }
        st.phase = 'manual';
        say('The live test could not find usable endpoints (no OpenAPI spec found).');
        return askDiscoveryRoutes();
      }
      st.phase = 'manual';
      say(`The live test failed: ${s().discovery.error || 'unknown error'}.`);
      say('No problem - paste your routes as text instead (one per line, e.g. "GET /users" or router.get(\'/users\')), then type "done".');
      return askDiscoveryRoutes();
    });
  }

  function askDiscoveryRoutes() {
    ask(
      'discovery.routes',
      'Paste your API routes as text - one per line, e.g. "GET /users", "POST /orders", "router.get(\'/products\')". Type "done" when finished.',
      { suggestions: ['done'] },
      async (text) => {
        if (text.toLowerCase() === 'done') {
          if (!s().endpoints.length) {
            say('I still need at least one endpoint. Paste a route line like "GET /users".');
            return askDiscoveryRoutes();
          }
          say(`${s().endpoints.length} endpoint(s) configured.`);
          return enterStep(4);
        }
        const parsed = parseRouteFile(text);
        if (!parsed.length) {
          say('I could not find any routes in that. Try a line like "GET /users", or type "done" if you already added enough.');
          return askDiscoveryRoutes();
        }
        const before = s().endpoints.length;
        w().setEndpoints((prev) => mergeEndpoints(prev, parsed));
        const added = s().endpoints.length - before;
        say(`Added ${added} new endpoint(s) (${parsed.length} parsed).`);
        if (added) resetDownstream(2);
        return askDiscoveryOptions();
      }
    );
  }

  function askDiscoveryOptions({ force = false } = {}) {
    const endpoints = s().endpoints;
    ask(
      'discovery.options',
      force
        ? `You currently have ${endpoints.length} endpoint(s), numbered in the card above. Type "keep" or "done" to continue, paste more routes, "remove 2" to drop one, "list" to see them, or "test again".`
        : `You now have ${endpoints.length} endpoint(s), numbered in the card above. Paste more routes to add them, type "remove 2" to drop one, "list" to see them, or "done" to continue.`,
      { suggestions: force ? ['keep', 'done', 'test again'] : ['done', 'list'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (lower === 'done' || (force && lower === 'keep')) {
          if (!s().endpoints.length) {
            say('At least one endpoint is required to continue.');
            return askDiscoveryRoutes();
          }
          say(`${s().endpoints.length} endpoint(s) configured.`);
          return enterStep(4);
        }
        if (lower === 'list') {
          say(formatEndpointList(s().endpoints));
          return askDiscoveryOptions({ force });
        }
        if (['test again', 'retry', 'refresh', 'test'].includes(lower)) {
          data.discovery = {};
          return askDiscovery();
        }
        const removed = /^remove\s+(\d+)$/.exec(lower);
        if (removed) {
          const index = Number(removed[1]) - 1;
          const endpointsNow = s().endpoints;
          if (index < 0 || index >= endpointsNow.length) {
            say(`Pick a number between 1 and ${endpointsNow.length}.`);
            return askDiscoveryOptions({ force });
          }
          const [dropped] = endpointsNow.slice(index, index + 1);
          w().setEndpoints(endpointsNow.filter((_, i) => i !== index));
          say(`Removed ${dropped.method} ${dropped.path}.`);
          resetDownstream(2);
          return askDiscoveryOptions({ force });
        }
        const parsed = parseRouteFile(text);
        if (!parsed.length) {
          say('I could not find any routes in that. Use lines like "GET /users", or type "done".');
          return askDiscoveryOptions({ force });
        }
        const before = s().endpoints.length;
        w().setEndpoints((prev) => mergeEndpoints(prev, parsed));
        const added = s().endpoints.length - before;
        say(`Added ${added} new endpoint(s) (${parsed.length} parsed).`);
        if (added) resetDownstream(2);
        return askDiscoveryOptions({ force });
      }
    );
  }

  // ============================================================
  // Step 5 - Request payloads
  // ============================================================

  function bodyEndpoints() {
    return s().endpoints.filter((ep) => BODY_METHODS.includes(String(ep.method).toUpperCase()));
  }

  function askPayload() {
    const endpoints = bodyEndpoints();
    if (!endpoints.length) {
      say('None of your endpoints send a request body (no POST/PUT/PATCH), so there is nothing to configure here.');
      return enterStep(5);
    }
    const p = data.payload || (data.payload = { index: 0, forceAsked: {} });
    if (p.index >= endpoints.length) {
      say(`Payloads configured for all ${endpoints.length} body endpoint(s).`);
      if (stopAtStep === 4) {
        stopAtStep = -1;
        navigating = false;
        return askStepKeep(4, 5);
      }
      return enterStep(5);
    }
    const endpoint = endpoints[p.index];
    const key = endpointKey(endpoint);
    const existing = s().payloads[key];
    const force = data.force === 4 && !p.forceAsked[key];
    if (force && existing?.confirmed) {
      p.forceAsked[key] = true;
      return askPayloadKeep(endpoint, key, existing);
    }
    if (existing?.confirmed) {
      p.index += 1;
      return askPayload();
    }
    return askPayloadHasBody(endpoint, key);
  }

  function nextPayloadEndpoint() {
    data.payload.index += 1;
    return askPayload();
  }

  function askPayloadKeep(endpoint, key, payload) {
    const count = payload.hasBody === false ? 'no body' : `${payload.fields?.length || 0} field(s)`;
    ask(
      `payload.keep:${key}`,
      `${endpoint.method} ${endpoint.path} already has a payload (${count}). Type "keep" to keep it, or "redo" to configure it again.`,
      { suggestions: ['keep', 'redo'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (lower === 'keep') {
          say(`Keeping the payload for ${endpoint.method} ${endpoint.path}.`);
          return nextPayloadEndpoint();
        }
        if (lower === 'redo') {
          w().setPayloads((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return askPayloadHasBody(endpoint, key);
        }
        say('Type "keep" or "redo".');
        return askPayloadKeep(endpoint, key, payload);
      }
    );
  }

  function askPayloadHasBody(endpoint, key) {
    const configured = Boolean(s().payloads[key]?.confirmed);
    ask(
      `payload.hasBody:${key}`,
      `Does ${endpoint.method} ${endpoint.path} accept a JSON request body? (yes/no${configured ? ', or "done" to use the table' : ''})`,
      { suggestions: configured ? ['yes', 'no', 'done'] : ['yes', 'no'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (['done', 'keep'].includes(lower) && s().payloads[key]?.confirmed) {
          say(`Using the payload configured in the table for ${endpoint.method} ${endpoint.path}.`);
          return nextPayloadEndpoint();
        }
        if (['no', 'n', 'none'].includes(lower)) {
          w().setPayloads((prev) => ({ ...prev, [key]: { hasBody: false, fields: [], example: undefined, confirmed: true } }));
          say(`Marked ${endpoint.method} ${endpoint.path} as having no request body.`);
          resetDownstream(3);
          return nextPayloadEndpoint();
        }
        if (!['yes', 'y'].includes(lower)) {
          say('Please answer yes or no.');
          return askPayloadHasBody(endpoint, key);
        }
        return askPayloadExample(endpoint, key);
      }
    );
  }

  function askPayloadExample(endpoint, key) {
    const configured = Boolean(s().payloads[key]?.confirmed);
    ask(
      `payload.example:${key}`,
      `Paste an example JSON body for ${endpoint.method} ${endpoint.path} and I will derive the field list (nested objects are expanded). Type "fields" to describe fields one by one, or "skip"${configured ? ', or "done" to use the table' : ''}.`,
      { placeholder: '{ "title": "My post", "content": "Hello" }', suggestions: configured ? ['fields', 'skip', 'done'] : ['fields', 'skip'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (['done', 'keep'].includes(lower) && s().payloads[key]?.confirmed) {
          say(`Using the payload configured in the table for ${endpoint.method} ${endpoint.path}.`);
          return nextPayloadEndpoint();
        }
        if (lower === 'skip') {
          w().setPayloads((prev) => ({ ...prev, [key]: { hasBody: true, fields: [], example: undefined, confirmed: true } }));
          say(`OK - no explicit schema for ${endpoint.method} ${endpoint.path}; the AI will infer the body from the endpoint description.`);
          resetDownstream(3);
          return nextPayloadEndpoint();
        }
        if (lower === 'fields') {
          data.field = { key };
          return askFieldName(endpoint, key);
        }
        try {
          const { example, rows } = fieldsFromExampleText(text);
          w().setPayloads((prev) => ({ ...prev, [key]: { hasBody: true, fields: rows, example, confirmed: true } }));
          const nested = rows.some((row) => row.name.includes('.'));
          say(`Got it - ${rows.length} field(s) derived for ${endpoint.method} ${endpoint.path}${nested ? ' (nested objects expanded)' : ''}.`);
          resetDownstream(3);
          return nextPayloadEndpoint();
        } catch (err) {
          say(`${err.message} Paste a JSON object, or type "fields" / "skip".`);
          return askPayloadExample(endpoint, key);
        }
      }
    );
  }

  function askFieldName(endpoint, key) {
    ask(
      `payload.field.name:${key}`,
      `Field name for ${endpoint.method} ${endpoint.path} (use dots for nested, e.g. paymentInfo.id). Type "done" to finish this endpoint.`,
      { placeholder: 'paymentInfo.id', suggestions: ['done'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (lower === 'done') {
          const payload = s().payloads[key];
          if (!payload?.fields?.length) {
            say('Add at least one field, or type "cancel" to skip this endpoint.');
            return askFieldName(endpoint, key);
          }
          w().setPayloads((prev) => ({ ...prev, [key]: { ...prev[key], confirmed: true } }));
          say(`Payload for ${endpoint.method} ${endpoint.path} saved (${payload.fields.length} field(s)).`);
          resetDownstream(3);
          return nextPayloadEndpoint();
        }
        if (lower === 'cancel') {
          w().setPayloads((prev) => ({ ...prev, [key]: { hasBody: true, fields: [], example: undefined, confirmed: true } }));
          say(`Skipped payload schema for ${endpoint.method} ${endpoint.path}.`);
          resetDownstream(3);
          return nextPayloadEndpoint();
        }
        const name = text.trim();
        if (!name) {
          say('Field name is required.');
          return askFieldName(endpoint, key);
        }
        data.field = { key, name };
        return askFieldType(endpoint, key);
      }
    );
  }

  function askFieldType(endpoint, key) {
    ask(
      `payload.field.type:${key}`,
      `Type of "${data.field.name}"? (string, number, boolean, object, array)`,
      { suggestions: FIELD_TYPES },
      async (text) => {
        const type = text.toLowerCase().trim();
        if (!FIELD_TYPES.includes(type)) {
          say(`Unknown type "${text}". Choose string, number, boolean, object or array.`);
          return askFieldType(endpoint, key);
        }
        data.field.type = type;
        return askFieldRequired(endpoint, key);
      }
    );
  }

  function askFieldRequired(endpoint, key) {
    ask(`payload.field.required:${key}`, `Is "${data.field.name}" required? (yes/no)`, { suggestions: ['yes', 'no'] }, async (text) => {
      const lower = text.toLowerCase();
      if (!['yes', 'y', 'no', 'n'].includes(lower)) {
        say('Please answer yes or no.');
        return askFieldRequired(endpoint, key);
      }
      data.field.required = lower.startsWith('y');
      return askFieldDescription(endpoint, key);
    });
  }

  function askFieldDescription(endpoint, key) {
    ask(`payload.field.description:${key}`, `Short description of "${data.field.name}"? (optional - type "skip")`, { suggestions: ['skip'] }, async (text) => {
      const description = ['skip', 'none', '-'].includes(text.toLowerCase()) ? '' : text.trim();
      const field = { ...data.field, description };
      const payload = s().payloads[key] || { hasBody: true, fields: [], example: undefined };
      const fields = [...(payload.fields || []), field];
      w().setPayloads((prev) => ({ ...prev, [key]: { ...payload, hasBody: true, fields, confirmed: false } }));
      say(`Added field "${field.name}" (${field.type}${field.required ? ', required' : ''}).`);
      return askFieldName(endpoint, key);
    });
  }

  // ============================================================
  // Step 6 - Preview
  // ============================================================

  function askPreview() {
    const existing = s().preview;
    if (existing.status === 'done' && existing.result) {
      const result = existing.result;
      say(`Plan ready: ${result.tools.length} MCP tool(s) from ${s().endpoints.length} endpoint(s) · MCP server :${result.ports.mcpServer} · AI server :${result.ports.aiServer} · model ${result.ai.model}.`);
      return askPreviewOptions();
    }
    return withTyping(async () => {
      say('Building the integration plan...');
      const result = await w().runPreview();
      if (!result) {
        say(`Preview failed: ${s().preview.error || 'unknown error'}.`);
        return askPreviewRetry();
      }
      say(`Plan ready: ${result.tools.length} MCP tool(s) from ${s().endpoints.length} endpoint(s) · MCP server :${result.ports.mcpServer} · AI server :${result.ports.aiServer} · model ${result.ai.model}.`);
      return askPreviewOptions();
    });
  }

  function askPreviewRetry() {
    ask('preview.retry', 'Type "retry" to build the preview again, or "back" to revisit the previous steps.', { suggestions: ['retry', 'back'] }, async (text) => {
      const lower = text.toLowerCase();
      if (lower === 'retry') return askPreview();
      if (lower === 'back') return openStep(4, { force: true });
      say('Type "retry" or "back".');
      return askPreviewRetry();
    });
  }

  function askPreviewOptions() {
    ask(
      'preview.next',
      'Type "generate" to build the project, or "refresh" to rebuild the plan.',
      { suggestions: ['generate', 'refresh'] },
      async (text) => {
        const lower = text.toLowerCase();
        if (lower === 'generate') {
          say(`Generating now - ${s().preview.result?.tools?.length || 0} MCP tool(s) planned.`);
          return enterStep(6);
        }
        if (['refresh', 'retry', 'rebuild'].includes(lower)) return askPreview();
        if (lower === 'back') return openStep(4, { force: true });
        say('Type "generate" or "refresh".');
        return askPreviewOptions();
      }
    );
  }

  // ============================================================
  // Step 7 - Generate
  // ============================================================

  async function waitForGeneration() {
    for (;;) {
      await sleep(1200);
      const generation = s().generation;
      if (generation.status === 'done') return { ok: true };
      if (generation.status === 'error') return { ok: false, error: generation.error || 'Generation failed' };
    }
  }

  function askGenerate() {
    const generation = s().generation;
    if (generation.status === 'done') return askGenerateOptions();
    if (generation.status === 'error') return askGenerateRetry();
    return withTyping(async () => {
      say('Starting generation - 7 phases: validate, analyze, MCP server, AI server, AI chat, docs and ZIP.');
      const id = await w().startGeneration();
      if (!id) {
        say(`Generation could not start: ${s().generation.error || 'unknown error'}.`);
        return askGenerateRetry();
      }
      const outcome = await waitForGeneration();
      if (!outcome.ok) {
        say(`Generation failed: ${outcome.error}`);
        return askGenerateRetry();
      }
      data.generate = { done: true };
      say('Your project is built and ready to download.');
      return enterStep(7);
    });
  }

  function askGenerateRetry() {
    ask('generate.retry', 'Type "retry" to run the generation again, or "back" to revisit the preview.', { suggestions: ['retry', 'back'] }, async (text) => {
      const lower = text.toLowerCase();
      if (['retry', 'regenerate', 'redo'].includes(lower)) {
        w().invalidate({ generation: true });
        data.generate = {};
        return askGenerate();
      }
      if (lower === 'back') return openStep(5, { force: true });
      say('Type "retry" or "back".');
      return askGenerateRetry();
    });
  }

  function askGenerateOptions() {
    ask('generate.options', 'The project has already been generated. Type "keep" to continue to the download step, or "regenerate" to build it again.', { suggestions: ['keep', 'regenerate'] }, async (text) => {
      const lower = text.toLowerCase();
      if (['keep', 'done', 'continue'].includes(lower)) return enterStep(7);
      if (['regenerate', 'redo', 'retry'].includes(lower)) {
        w().invalidate({ generation: true });
        data.generate = {};
        return askGenerate();
      }
      say('Type "keep" or "regenerate".');
      return askGenerateOptions();
    });
  }

  // ============================================================
  // Step 8 - Download
  // ============================================================

  async function runDownload(text) {
    const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const kind = PACKAGE_ALIASES[lower];
    if (!kind) return 'unknown';
    const kinds = kind === 'all' ? ['complete', 'mcp-server', 'ai-server', 'ai-chat'] : [kind];
    const generation = s().generation;
    if (!generation.integrationId || !generation.project) {
      say('The project is not ready yet - let me generate it first.');
      return 'not-ready';
    }
    await withTyping(async () => {
      for (const packageKind of kinds) {
        const fileName = packageFileName(generation, s().draft, packageKind);
        const artifact = artifactFor(generation, packageKind);
        try {
          if (artifact?.data) {
            downloadArtifactData(artifact.data, fileName);
          } else {
            await downloadFile(`/api/integrations/${generation.integrationId}/download?package=${packageKind}`, fileName);
          }
          say(`Saved ${fileName}.`);
        } catch (err) {
          say(`Could not download ${packageKind}: ${err.message}`);
        }
      }
    });
    return 'done';
  }

  function askDownload() {
    ask(
      'download.package',
      'Which package would you like? Type complete, mcp-server, ai-server, ai-chat, or "all".',
      { suggestions: ['complete', 'all', 'mcp-server', 'ai-server', 'ai-chat'] },
      async (text) => {
        const outcome = await runDownload(text);
        if (outcome === 'done') return askDownloadMore();
        if (outcome === 'not-ready') return enterStep(6);
        say('Unknown package. Choose complete, mcp-server, ai-server, ai-chat or all.');
        return askDownload();
      }
    );
  }

  function askDownloadMore() {
    ask('download.more', 'Anything else? Type another package name, or "new chat" to start over.', { suggestions: ['new chat'] }, async (text) => {
      const lower = text.toLowerCase();
      if (['new chat', 'reset', 'start over', 'finish', 'done', 'no'].includes(lower)) {
        onReset();
        return;
      }
      const outcome = await runDownload(text);
      if (outcome === 'done') return askDownloadMore();
      if (outcome === 'not-ready') return enterStep(6);
      say('Type a package name (complete, mcp-server, ai-server, ai-chat), "all", or "new chat".');
      return askDownloadMore();
    });
  }

  // ============================================================
  // Public API
  // ============================================================

  return {
    start() {
      navigating = false;
      stopAtStep = -1;
      step = 0;
      data = {};
      current = null;
      append({ role: 'assistant', kind: 'step', stepIndex: 0 });
      return askApplication();
    },
    restart() {
      navigating = false;
      stopAtStep = -1;
      step = 0;
      data = {};
      current = null;
      w().goToStep(0);
      append({ role: 'assistant', kind: 'step', stepIndex: 0 });
      return askApplication();
    },
    answer,
    openStep,
    navigateTo,
  };
}
