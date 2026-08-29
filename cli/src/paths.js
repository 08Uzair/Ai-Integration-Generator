import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The directory this module lives in (cli/src). */
const MODULE_DIR = path.dirname(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
);

/**
 * Walks up from a directory until it finds a package.json with a
 * `workspaces` field - i.e. the repository root of this project.
 */
function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (Array.isArray(pkg.workspaces)) return dir;
    } catch {
      /* not a workspace root - keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const REPO_ROOT = findRepoRoot(MODULE_DIR);

/**
 * Resolves a user-supplied file path to an existing file.
 *
 * Handles the common mistakes when running the CLI through npm workspaces
 * or run.ps1 (where the working directory is the `cli/` folder):
 *   - relative paths are tried against the current directory FIRST, then
 *     against the repository root (so `./app/routes.txt` works even when
 *     the CLI is launched from `cli/`)
 *   - `~` expands to the user's home directory
 *   - surrounding quotes (e.g. Windows "Copy as path") are stripped
 *
 * Returns { found: true, path } or { found: false, tried: [absolute paths] }.
 */
export function resolveFilePath(input) {
  const raw = String(input || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!raw) return { found: false, tried: [] };

  const candidates = [];
  if (raw.startsWith('~')) {
    candidates.push(path.join(os.homedir(), raw.slice(1)));
  } else if (path.isAbsolute(raw)) {
    candidates.push(raw);
  } else {
    candidates.push(path.resolve(process.cwd(), raw));
    if (REPO_ROOT && path.resolve(REPO_ROOT) !== path.resolve(process.cwd())) {
      candidates.push(path.resolve(REPO_ROOT, raw));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { found: true, path: candidate };
  }
  return { found: false, tried: candidates };
}

/** Human-readable validation error listing every attempted location. */
export function fileNotResolvedError(input, resolved) {
  const tries = resolved.tried?.length ? ` (tried: ${resolved.tried.join(', ')})` : '';
  return `File not found: "${input.trim()}"${tries}`;
}
