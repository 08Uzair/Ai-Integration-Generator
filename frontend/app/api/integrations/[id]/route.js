import { ok, fail, httpError } from '../../../../server/local/http.js';
import { integrationDetail } from '../../../../server/local/run.js';
import { deleteSession } from '../../../../server/local/store.js';

/** GET /api/integrations/:id - integration detail with job + artifacts. */
export async function GET(_request, { params }) {
  try {
    const { id } = params;
    return ok(integrationDetail(id), 'Integration retrieved');
  } catch (err) {
    return fail(err);
  }
}

/** DELETE /api/integrations/:id - remove session + generated artifacts. */
export async function DELETE(_request, { params }) {
  try {
    const { id } = params;
    const removed = await deleteSession(id);
    if (!removed) throw httpError.notFound('Integration not found');
    return ok({ deleted: true }, 'Integration deleted');
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
