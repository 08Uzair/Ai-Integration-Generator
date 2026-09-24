import fs from 'node:fs/promises';
import path from 'node:path';
import { readTemplateDir, readTemplateFile } from './template-manifest.js';

export const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.json', '.md', '.yml', '.yaml', '.env', '.example',
  '.gitignore', '.dockerignore', '.txt', '.html', '.css', '.properties',
]);

/**
 * Recursively copies a template directory into `dest`, replacing every
 * {{TOKEN}} occurrence in text files with its value.
 */
export async function renderTemplate(sourceDir, destDir, tokens) {
  await fs.mkdir(destDir, { recursive: true });

  const entries = await readTemplateDir(sourceDir);
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await renderTemplate(srcPath, destPath, tokens);
      continue;
    }

    const content = await readTemplateFile(srcPath);
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
      await fs.writeFile(destPath, renderTokens(content, tokens), 'utf8');
    } else {
      // Unknown extension (e.g. Dockerfile): copy verbatim.
      await fs.writeFile(destPath, content, 'utf8');
    }
  }
}

export function renderTokens(content, tokens) {
  let out = content;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return out;
}

/** Copies one file applying token replacement (for generated non-template files). */
export async function renderFile(srcPath, destPath, tokens) {
  const content = await readTemplateFile(srcPath);
  await fs.writeFile(destPath, renderTokens(content, tokens), 'utf8');
  return destPath;
}