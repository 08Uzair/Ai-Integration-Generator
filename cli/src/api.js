import fs from 'node:fs/promises';
import path from 'node:path';
import { endpointKey } from './state.js';

export const API_URL = (
  process.env.API_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:4000'
).replace(/\/+$/, '');

class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Backend client. Unwraps the { success, data } / { success, error } envelope
 * and throws ApiError with a readable message on failure - same contract as
 * the wizard frontend (frontend/lib/api.js).
 */
export async function apiFetch(pathname, { method = 'GET', body, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = timeoutMs
    ? setTimeout(
        () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    : null;

  try {
    const response = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.success) {
      const message =
        payload?.error?.message || `Request failed (HTTP ${response.status})`;
      const code = payload?.error?.code || 'REQUEST_FAILED';
      throw new ApiError(code, message, payload?.error?.details);
    }
    return payload.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError')
      throw new ApiError('TIMEOUT', 'Request timed out - is the backend running?');
    throw new ApiError(
      'NETWORK_ERROR',
      `Cannot reach the API at ${API_URL}. Start the backend with: npm run dev:backend`
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Downloads a generated ZIP artifact and saves it to destFile. */
export async function downloadZip(pathname, destFile) {
  const response = await fetch(`${API_URL}${pathname}`);
  if (!response.ok) {
    let message = `Download failed (HTTP ${response.status})`;
    try {
      const body = await response.json();
      message = body?.error?.message || message;
    } catch {
      /* keep default */
    }
    throw new ApiError('DOWNLOAD_FAILED', message);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  await fs.writeFile(destFile, buffer);
  return { fileName: path.basename(destFile), sizeBytes: buffer.length };
}

/** Transient auth payload - sent for live tests only, never persisted. */
export function transientAuth(state) {
  const a = state.auth;
  const payload = { authType: a.type };
  if (a.token) payload.token = a.token;
  if (a.apiKeyHeader) payload.apiKeyHeader = a.apiKeyHeader;
  if (a.headerName) payload.headerName = a.headerName;
  if (a.headerValue) payload.headerValue = a.headerValue;
  if (a.username) payload.username = a.username;
  if (a.basicPassword) payload.basicPassword = a.basicPassword;
  return payload;
}

/** Non-secret auth metadata used for preview/generate. */
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
    payload: state.payloads[endpointKey(ep)] || undefined,
  }));
}

/** The full draft used by preview + generate. */
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

export { ApiError };
