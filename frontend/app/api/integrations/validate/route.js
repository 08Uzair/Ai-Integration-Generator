import { ok, fail } from '../../../../server/local/http.js';
import { runValidate } from '../../../../server/local/run.js';

/** POST /api/integrations/validate - quick preflight connection test. */
export async function POST(request) {
  try {
    const body = await request.json();
    const result = await runValidate(body);
    return ok(result, 'Validation completed');
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Validation probes the target API - allow up to 60s for slow endpoints. */
export const maxDuration = 60;
