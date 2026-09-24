/**
 * Tiny helper used by the docs service - renders one tokenized file.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { renderTokens } from '../utils/template-engine.js';
import { readTemplateFile } from '../utils/template-manifest.js';

export async function renderTokenizedFile(srcPath, destPath, tokens) {
  const content = await readTemplateFile(srcPath);
  const rendered = renderTokens(content, tokens);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, rendered, 'utf8');
  return destPath;
}