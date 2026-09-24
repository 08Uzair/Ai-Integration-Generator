import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * In-memory store for standalone ("local") mode.
 *
 * The web wizard normally persists integrations/jobs in MongoDB through the
 * platform backend. When the wizard runs on its own (no NEXT_PUBLIC_API_URL),
 * generation runs inside the Next.js server and every session lives here:
 * rows are plain objects with the same shapes the UI already consumes, and
 * generated ZIP artifacts are written under a temp folder.
 *
 * The registry hangs off globalThis so it survives Next.js dev-server module
 * reloads while a background job is still running.
 */

const REGISTRY_KEY = '__aig_web_local_registry__';
const DEFAULT_ROOT = () => path.join(os.tmpdir(), 'aig-web-standalone');

function registry() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = {
      rootDir: DEFAULT_ROOT(),
      sessions: new Map(), // id -> session
      seq: 0,
    };
  }
  return globalThis[REGISTRY_KEY];
}

export function storeRoot() {
  return registry().rootDir;
}

/** Session dir: ZIP artifacts + extracted project land under <root>/<id>. */
export function sessionDir(id) {
  return path.join(storeRoot(), id);
}

/**
 * A session mirrors the backend trio (Integration + GenerationJob +
 * GeneratedProject) as plain data. `job`/`integration`/`project` are mutated
 * in place while the job runs, so polling always sees fresh progress.
 */
export function createSession(integrationRow, job, config) {
  const reg = registry();
  const id = `local-${Date.now().toString(36)}-${(reg.seq += 1).toString(36)}`;
  const session = {
    id,
    integration: { ...integrationRow, _id: id, jobId: id, createdAt: new Date(), updatedAt: new Date() },
    job,
    project: null,
    config,
  };
  reg.sessions.set(id, session);
  return session;
}

export function getSession(id) {
  return registry().sessions.get(id) || null;
}

export function requireSession(id) {
  const session = getSession(id);
  if (!session) return null;
  return session;
}

/** Sorted newest-first - same ordering the Mongo list endpoint used. */
export function listSessions() {
  return [...registry().sessions.values()].sort(
    (a, b) => new Date(b.integration.createdAt) - new Date(a.integration.createdAt)
  );
}

export async function deleteSession(id) {
  const reg = registry();
  const removed = reg.sessions.delete(id);
  if (removed) {
    try {
      await fs.rm(sessionDir(id), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  return removed;
}

/** Removes temp dirs left behind by sessions older than `ttlHours`. */
export async function sweepExpired({ ttlHours = 24 } = {}) {
  const root = storeRoot();
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      try {
        const stat = await fs.stat(full);
        if (stat.isDirectory() && stat.mtimeMs < cutoff) {
          await fs.rm(full, { recursive: true, force: true });
        }
      } catch {
        /* keep going */
      }
    }
  } catch {
    /* root may not exist yet */
  }
}
