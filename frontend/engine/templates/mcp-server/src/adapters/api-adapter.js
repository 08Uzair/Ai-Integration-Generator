import { env } from '../config/env.js';
import { TargetApiError } from '../utils/errors.js';

/**
 * API Adapter - the ONLY place that talks to the target application.
 *
 * Responsibilities:
 *   - resolve the full URL (base + path + query parameters)
 *   - attach authentication headers from environment variables
 *   - send the request with a timeout
 *   - parse and normalize the response
 *
 * Configuration comes exclusively from environment variables set in .env.
 */
export async function executeTargetRequest(request, args) {
  const url = buildUrl(request, args);
  const body = request.body && args.body ? JSON.stringify(args.body) : undefined;
  const headers = buildHeaders(body !== undefined);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Target API timed out after ${env.TARGET_API_TIMEOUT_MS}ms`)), env.TARGET_API_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new TargetApiError(
        response.status,
        'TARGET_HTTP_ERROR',
        `Target API returned HTTP ${response.status} ${response.statusText || ''}`.trim(),
        { url, status: response.status, body: data }
      );
    }

    return {
      success: true,
      data,
      meta: {
        status: response.status,
        latencyMs: Date.now() - startedAt,
        url,
      },
    };
  } catch (err) {
    if (err instanceof TargetApiError) throw err;
    if (err?.name === 'AbortError' || /timed out/i.test(err?.message || '')) {
      throw new TargetApiError(504, 'TARGET_API_TIMEOUT', err.message);
    }
    throw new TargetApiError(502, 'TARGET_API_UNREACHABLE', `Failed to reach target API: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** TARGET_API_BASE_URL + path + query params from validated arguments. */
function buildUrl(request, args) {
  let pathTemplate = request.path || '/';
  // Substitute every placeholder style seen in real projects:
  // `/users/:id`, `/users/{id}` and `/users/${id}`. `${id}` MUST be matched
  // first, otherwise only `{id}` is replaced and a stray `$` corrupts the URL.
  pathTemplate = pathTemplate.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|:([A-Za-z_][A-Za-z0-9_]*)|{([A-Za-z_][A-Za-z0-9_]*)}/g,
    (match, template, colon, braces) => {
      const name = template || colon || braces;
      const value = args?.[name];
      return value === undefined ? match : encodeURIComponent(String(value));
    }
  );

  const url = new URL(pathTemplate || '/', ensureTrailingSlash(env.TARGET_API_BASE_URL));

  for (const qp of request.queryParams || []) {
    const value = args?.[qp.name];
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(qp.name, String(value));
    }
  }
  return url.toString();
}

function ensureTrailingSlash(base) {
  return base.endsWith('/') ? base : `${base}/`;
}

/** Authentication headers resolved from environment variables only. */
function buildHeaders(hasBody = false) {
  const headers = { Accept: 'application/json' };
  // JSON bodies MUST carry this header. Without it, fetch sends a string body
  // as `text/plain`, Express's body-parser skips it (req.body = {}) and the
  // target API silently stores/creates empty records while still returning 200.
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (env.TARGET_API_BASIC_USERNAME || env.TARGET_API_BASIC_PASSWORD) {
    // Basic auth loses its meaning over plain HTTP - degrade loudly.
    headers.Authorization = `Basic ${Buffer.from(`${env.TARGET_API_BASIC_USERNAME}:${env.TARGET_API_BASIC_PASSWORD}`).toString('base64')}`;
  }
  switch ((env.TARGET_API_AUTH_TYPE || 'none').toLowerCase()) {
    case 'bearer':
      if (env.TARGET_API_TOKEN) headers.Authorization = `Bearer ${env.TARGET_API_TOKEN}`;
      break;
    case 'api-key':
      if (env.TARGET_API_API_KEY) headers[env.TARGET_API_API_KEY_HEADER || 'x-api-key'] = env.TARGET_API_API_KEY;
      break;
    case 'custom-header':
      if (env.TARGET_API_AUTH_HEADER_NAME && env.TARGET_API_AUTH_HEADER_VALUE) {
        headers[env.TARGET_API_AUTH_HEADER_NAME] = env.TARGET_API_AUTH_HEADER_VALUE;
      }
      break;
    case 'basic':
      // handled above
      break;
    default:
      break;
  }
  return headers;
}