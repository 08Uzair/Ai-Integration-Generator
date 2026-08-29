import path from 'node:path';
import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import { downloadZip } from '../api.js';
import {
  log,
  note,
  select,
  confirm,
  text,
  multiselect,
  spinner,
  promptOrCancel,
  stepHeader,
  gap,
} from '../ui.js';
import { formatBytes, slugify } from '../table.js';

const PACKAGES = [
  { value: 'complete', label: 'Complete project (all services + docs + docker-compose)' },
  { value: 'mcp-server', label: 'MCP Server (port 5000)' },
  { value: 'ai-server', label: 'AI Server (port 4100)' },
  { value: 'ai-chat', label: 'AI Chat component (AiChat.jsx)' },
];

function extractZip(zipPath, destDir) {
  try {
    if (process.platform === 'win32') {
      const command = `Expand-Archive -LiteralPath '${String(zipPath).replace(/'/g, "''")}' -DestinationPath '${String(destDir).replace(/'/g, "''")}' -Force`;
      const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
        stdio: 'pipe',
      });
      if (result.status !== 0)
        throw new Error(result.stderr?.toString() || 'Expand-Archive failed');
    } else {
      const result = spawnSync('tar', ['-xzf', zipPath, '-C', destDir], {
        stdio: 'pipe',
      });
      if (result.status !== 0) throw new Error(result.stderr?.toString() || 'tar failed');
    }
    log.success(`Extracted ${path.basename(zipPath)}`);
  } catch (err) {
    log.error(`Could not extract ${path.basename(zipPath)}: ${err.message}`);
  }
}

/** Step 8 - download the complete project or individual services. */
export async function stepDownload(state) {
  const slug = state.generation?.project?.projectName || slugify(state.name);
  stepHeader(7);

  const packages = await promptOrCancel(multiselect, {
    message: 'Select packages to download:',
    options: PACKAGES,
    required: true,
    initialValues: ['complete'],
  });

  const dir = await promptOrCancel(text, {
    message: 'Download folder:',
    placeholder: path.join(process.cwd(), slug),
    initialValue: state.downloadDir || path.join(process.cwd(), slug),
  });
  state.downloadDir = dir;

  const saved = [];
  for (const kind of packages) {
    const fileName = `${slug}-${kind}.zip`;
    const dest = path.join(dir, fileName);
    const s = spinner();
    s.start(`Downloading ${fileName} ...`);
    try {
      const info = await downloadZip(
        `/api/integrations/${state.generation.integrationId}/download?package=${kind}`,
        dest
      );
      s.stop(`${fileName} saved.`);
      log.success(`  ${fileName} · ${formatBytes(info.sizeBytes)}`);
      saved.push(dest);
    } catch (err) {
      s.stop(`Download of ${fileName} failed.`);
      log.error(err.message);
    }
  }

  if (!saved.length) {
    log.error('No packages were downloaded - check that the backend is running.');
    return;
  }

  const extract = await promptOrCancel(confirm, {
    message: `Extract the downloaded ZIP(s) into ${dir}?`,
    initialValue: true,
  });

  if (extract) {
    for (const zip of saved) extractZip(zip, dir);
  }

  gap();
  note(
    [
      chalk.gray(`Directory: ${dir}`),
      ...saved.map((f) => chalk.gray(`  · ${path.basename(f)}`)),
      chalk.gray(''),
      chalk.dim('Generated artifacts are cleaned up automatically after 24h.'),
    ],
    'Download complete'
  );
  gap();

  const { explore } = await promptOrCancel(select, {
    message: 'What next?',
    options: [
      { label: 'Create another integration', value: 'again' },
      { label: 'Finish', value: 'done' },
    ],
  });
  state.nextAction = explore;
}
