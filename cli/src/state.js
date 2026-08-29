export const STEP_IDS = [
  'application',
  'authentication',
  'ai',
  'discovery',
  'payload',
  'preview',
  'generate',
  'download',
];

export const STEPS = [
  { id: 'application', title: 'Application', subtitle: 'Your app & API details' },
  {
    id: 'authentication',
    title: 'Authentication',
    subtitle: 'How clients call your API',
  },
  { id: 'ai', title: 'AI Configuration', subtitle: 'Model provider settings' },
  { id: 'discovery', title: 'API Discovery', subtitle: 'Import & review your endpoints' },
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

export function createState() {
  return {
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
    endpoints: [],
    payloads: {},
    discovery: null,
    preview: null,
    generation: null,
  };
}
