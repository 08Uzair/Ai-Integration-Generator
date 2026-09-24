import { NextResponse } from 'next/server';

/**
 * Local-mode HTTP contract helpers - mirror the envelope the platform
 * backend uses ({ success, data, message } | { success, error }), so the
 * wizard UI is completely agnostic about where generation runs.
 */

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const httpError = {
  notFound: (message) => new HttpError(404, 'INTEGRATION_NOT_FOUND', message),
  artifactNotFound: (message) => new HttpError(404, 'ARTIFACT_NOT_FOUND', message),
  badRequest: (code, message, details) => new HttpError(400, code, message, details),
  internal: (message) => new HttpError(500, 'INTERNAL_ERROR', message),
};

export function ok(data, message) {
  return NextResponse.json({ success: true, data, message });
}

export function accepted(data, message) {
  return NextResponse.json({ success: true, data, message }, { status: 202 });
}

export function fail(err) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status }
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message } },
    { status: 500 }
  );
}
