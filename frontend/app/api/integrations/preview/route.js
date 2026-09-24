import { ok, fail } from '../../../../server/local/http.js';
import { runPreview } from '../../../../server/local/run.js';

/** POST /api/integrations/preview - full project plan (tools, ports, env). */
export async function POST(request) {
  try {
    const body = await request.json();
    const plan = await runPreview(body);
    return ok(plan, 'Preview generated');
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
