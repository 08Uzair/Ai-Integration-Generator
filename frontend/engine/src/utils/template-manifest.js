/**
 * Virtual template store: reads template files from the bundled manifest
 * (engine/src/template-files.js) when the requested path belongs to the
 * templates folder, falling back to the real filesystem otherwise.
 *
 * On serverless hosts (Vercel) `__dirname`-based template paths do not
 * exist on disk at runtime; the manifest keeps generation working there
 * while local dev / `next start` still resolves through the manifest too
 * (it is regenerated on every build/dev start).
 */
import fs from 'node:fs/promises';
import { TEMPLATE_FILES } from '../template-files.js';

const TEMPLATES_MARKER = '/templates/';

/** Relative manifest key for a template path, or null when not a template. */
function keyFor(absPath) {
  const normalized = String(absPath).replace(/\\/g, '/');
  const idx = normalized.lastIndexOf(TEMPLATES_MARKER);
  if (idx === -1) return null;
  return normalized.slice(idx + TEMPLATES_MARKER.length);
}

/** File content: from the manifest when possible, else the real filesystem. */
export async function readTemplateFile(absPath) {
  const key = keyFor(absPath);
  if (key !== null && Object.prototype.hasOwnProperty.call(TEMPLATE_FILES, key)) {
    return TEMPLATE_FILES[key];
  }
  return fs.readFile(absPath, 'utf8');
}

/** Directory listing (dirent-like entries) synthesized from the manifest. */
export async function readTemplateDir(absPath) {
  const normalized = String(absPath).replace(/\\/g, '/');
  const idx = normalized.lastIndexOf(TEMPLATES_MARKER);
  if (idx === -1) return fs.readdir(absPath, { withFileTypes: true });

  const prefix = normalized.slice(idx + TEMPLATES_MARKER.length).replace(/\/$/, '');
  const entries = new Map();
  for (const key of Object.keys(TEMPLATE_FILES)) {
    if (prefix && !key.startsWith(`${prefix}/`)) continue;
    const rest = prefix ? key.slice(prefix.length + 1) : key;
    if (!rest) continue;
    const slash = rest.indexOf('/');
    const name = slash === -1 ? rest : rest.slice(0, slash);
    if (!entries.has(name)) {
      const isDir = slash !== -1;
      entries.set(name, {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });
    }
  }
  if (entries.size === 0) return fs.readdir(absPath, { withFileTypes: true });
  return [...entries.values()];
}
