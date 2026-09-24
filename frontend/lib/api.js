/**
 * API endpoint resolution.
 *
 * The wizard can run in two modes:
 *   - LOCAL (default): no NEXT_PUBLIC_API_URL is set -> requests go to the
 *     Next.js app itself (`/api/...` route handlers), which run the vendored
 *     generation engine in-process. No backend API or MongoDB required.
 *   - REMOTE: NEXT_PUBLIC_API_URL points at the platform backend
 *     (http://localhost:4000) -> MongoDB-backed sessions + background jobs.
 */
const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

export const LOCAL_MODE = !configured;
export const API_URL = configured;

class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Unified API client. Unwraps the envelope
 * ({ success, data, message } | { success, error: { code, message } }) and
 * always throws ApiError with a readable message on failure.
 */
/** Builds a path with an optional query string, same-origin or absolute. */
function resolveUrl(path, params) {
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString()}`
    : '';
  return LOCAL_MODE ? `${path}${query}` : `${API_URL}${path}${query}`;
}

export async function apiFetch(path, { method = 'GET', body, params, timeoutMs } = {}) {
  const url = resolveUrl(path, params);

  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs) : null;

  try {
    const response = await fetch(url, {
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
      const message = payload?.error?.message || `Request failed (HTTP ${response.status})`;
      const code = payload?.error?.code || 'REQUEST_FAILED';
      throw new ApiError(code, message, payload?.error?.details);
    }
    return payload.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') throw new ApiError('TIMEOUT', 'Request timed out - try again');
    const hint = LOCAL_MODE
      ? 'Cannot reach the local generator. Make sure the Next.js app is running.'
      : `Cannot reach the API at ${API_URL}. Start the backend with: npm run dev:backend`;
    throw new ApiError('NETWORK_ERROR', hint);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Streams a file download from an API endpoint (returns the blob url). */
export async function downloadFile(path, fileName) {
  const response = await fetch(resolveUrl(path));
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
  const blob = await response.blob();
  triggerDownload(blob, fileName);
}

/**
 * Downloads a ZIP whose bytes were embedded in the generation response
 * (base64) - used on serverless hosts where the artifact only exists inside
 * the single generate request and is kept client-side afterwards.
 */
export function downloadArtifactData(base64, fileName) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  triggerDownload(new Blob([bytes], { type: 'application/zip' }), fileName);
}

/** Saves a blob through a hidden anchor click (no server round-trip). */
function triggerDownload(blob, fileName) {
  const urlObject = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = urlObject;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(urlObject), 10_000);
}

export { ApiError };
