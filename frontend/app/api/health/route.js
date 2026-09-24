import { ok } from '../../../server/local/http.js';

/**
 * GET /api/health - local-mode health readout.
 * When the wizard runs standalone there is no MongoDB - generation runs in
 * this Next.js process, so the settings page reports that instead.
 */
export async function GET() {
  return ok(
    {
      status: 'ok',
      mode: 'local',
      generation: 'in-process',
      database: 'none (standalone)',
      engine: 'vendored',
    },
    'Local mode healthy'
  );
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
