import fs from 'node:fs/promises';
import { fail } from '../../../../../server/local/http.js';
import { resolveArtifact } from '../../../../../server/local/run.js';

/** GET /api/integrations/:id/download?package=complete|ai-server|mcp-server|ai-chat */
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const packageKey = new URL(request.url).searchParams.get('package') || 'complete';
    const artifact = await resolveArtifact(id, packageKey);
    const buffer = await fs.readFile(artifact.filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
        'Content-Length': String(artifact.sizeBytes),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return fail(err);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
