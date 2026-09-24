import { ok, fail } from '../../../../server/local/http.js';
import { runDiscover } from '../../../../server/local/run.js';

/** POST /api/integrations/discover - deep discovery + endpoint analysis. */
export async function POST(request) {
  try {
    const body = await request.json();
    const result = await runDiscover(body);
    return ok(result, 'Discovery completed');
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Discovery probes the target API (up to 60s client-side) - allow the full window. */
export const maxDuration = 60;
