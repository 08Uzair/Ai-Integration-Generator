import { ok, fail } from '../../../../../server/local/http.js';
import { integrationStatus } from '../../../../../server/local/run.js';

/** GET /api/integrations/:id/status - polling snapshot for the wizard. */
export async function GET(_request, { params }) {
  try {
    const { id } = params;
    return ok(integrationStatus(id), 'Status retrieved');
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
