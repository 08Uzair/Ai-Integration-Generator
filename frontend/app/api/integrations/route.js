import { ok, fail } from '../../../server/local/http.js';
import { listIntegrations, startGeneration } from '../../../server/local/run.js';

/** GET /api/integrations - list sessions (newest first). */
export async function GET() {
  try {
    return ok(listIntegrations(), 'Integrations retrieved');
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST /api/integrations/generate - runs the whole generation job
 * synchronously and returns the finished session (integration + job +
 * project with embedded artifacts). Single-request flow so the app works on
 * serverless hosts (Vercel) without any background worker or shared store.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const session = await startGeneration(body);
    return ok(
      { integration: session.integration, job: session.job, project: session.project },
      session.job.status === 'completed' ? 'Generation completed' : 'Generation finished with errors'
    );
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Generation probes the target API and zips the project - allow up to 60s. */
export const maxDuration = 60;
