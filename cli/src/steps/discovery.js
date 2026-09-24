import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { parseRouteFile } from '../routeParser.js';
import { runDiscovery } from '../run.js';
import { endpointKey } from '../state.js';
import { resolveFilePath, fileNotResolvedError } from '../paths.js';
import { log, select, text, spinner, promptOrCancel, stepHeader, gap } from '../ui.js';
import { renderTable, methodColor } from '../table.js';

/** Validate a user-supplied endpoints file path (relative or absolute). */
const filePathValidator = (v) => {
  const input = (v || '').trim();
  if (!input) return undefined;
  const resolved = resolveFilePath(input);
  return resolved.found ? undefined : fileNotResolvedError(input, resolved);
};

/**
 * Step 4 - "API Discovery".
 * The primary flow: point at a .txt file containing your endpoints, the file
 * is parsed automatically and the results are shown in a terminal table.
 * Manual add/remove and an optional live connection test are also available.
 */
export async function stepDiscovery(state) {
  stepHeader(3);

  const importFile = async (filePath) => {
    const input = (filePath || '').trim();
    if (!input) return false;
    const resolved = resolveFilePath(input);
    if (!resolved.found) {
      log.error(fileNotResolvedError(input, resolved));
      return false;
    }
    try {
      const content = fs.readFileSync(resolved.path, 'utf8');
      const parsed = parseRouteFile(content);
      if (!parsed.length) {
        log.error(
          `No routes detected in "${input}". Supported formats: "GET /users", "router.get('/x')", "@app.post('/x')" or bare "/x" lines.`
        );
        return false;
      }
      const seen = new Set(state.endpoints.map((e) => endpointKey(e)));
      const fresh = parsed.filter((e) => !seen.has(endpointKey(e)));
      state.endpoints.push(...fresh);
      log.success(
        `${parsed.length} endpoint(s) parsed from ${path.basename(resolved.path)} (${fresh.length} new).`
      );
      log.message(chalk.dim(`  using: ${resolved.path}`));
      return fresh.length > 0;
    } catch (err) {
      log.error(`Could not read "${input}": ${err.message}`);
      return false;
    }
  };

  const runLive = async () => {
    const s = spinner();
    s.start(`Testing connection against ${state.apiBaseUrl} ...`);
    try {
      const result = await runDiscovery(state);
      state.discovery = result;
      if (result.endpoints?.length) {
        const seen = new Set(state.endpoints.map((e) => endpointKey(e)));
        const fresh = result.endpoints.filter((e) => !seen.has(endpointKey(e)));
        state.endpoints.push(...fresh);
        s.stop(
          `Connection test complete - ${result.endpoints.length} endpoint(s) found (${fresh.length} new).`
        );
      } else {
        s.stop('Connection test complete.');
        log.error(
          'No endpoints discovered (no OpenAPI spec found). Import a .txt file or add endpoints manually instead.'
        );
      }
    } catch (err) {
      s.stop('Connection test failed.');
      log.error(err.message);
    }
  };

  const addManual = async () => {
    const method = await promptOrCancel(select, {
      message: 'Method:',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
        label: m,
        value: m,
      })),
      initialValue: 'GET',
    });
    const pathValue = await promptOrCancel(text, {
      message: 'Path (e.g. /users/:id):',
      placeholder: '/users/:id',
      validate: (v) => (v.trim().startsWith('/') ? undefined : 'Path must start with /'),
    });
    const summary = await promptOrCancel(text, {
      message: 'Summary (optional):',
      placeholder: 'List all users',
      initialValue: '',
    });
    state.endpoints.push({
      method,
      path: pathValue.trim(),
      summary: summary.trim() || `${method} ${pathValue.trim()}`,
      source: 'manual',
    });
    log.success('Endpoint added.');
  };

  const removeOne = async () => {
    if (!state.endpoints.length) {
      log.warn('No endpoints to remove yet.');
      return;
    }
    const idx = await promptOrCancel(select, {
      message: 'Remove which endpoint?',
      options: state.endpoints.map((e, i) => ({
        label: `${e.method} ${e.path}`,
        value: i,
      })),
    });
    const [removed] = state.endpoints.splice(idx, 1);
    log.success(`Removed ${removed.method} ${removed.path}.`);
  };

  const showTable = () => {
    if (!state.endpoints.length) {
      log.warn('No endpoints configured yet.');
      return;
    }
    renderTable(
      ['#', 'Method', 'Path', 'Summary', 'Source'],
      state.endpoints.map((e, i) => [
        i + 1,
        methodColor(e.method)(e.method),
        e.path,
        e.summary || '',
        e.source,
      ]),
      { colWidths: [4, 8, 42, 34, 10] }
    );
  };

  // Kick-off: ask for the endpoints .txt file path first (the primary flow).
  const filePath = await promptOrCancel(text, {
    message: 'Path to your endpoints file (.txt):',
    placeholder: 'e.g. ./endpoints.txt  (Enter to skip)',
    initialValue: state.lastFile || undefined,
    validate: filePathValidator,
  });
  const imported = await importFile(filePath);
  state.lastFile = (filePath || '').trim();
  if (imported) showTable();
  gap();

  // Editing loop.
  while (true) {
    const action = await promptOrCancel(select, {
      message: 'What do you want to do?',
      options: [
        { label: 'Import endpoints from a .txt file', value: 'file' },
        {
          label: 'Run live connection test (auto-discover from API URL)',
          value: 'discover',
        },
        { label: 'Add endpoint manually', value: 'add' },
        { label: 'Remove endpoint', value: 'remove' },
        { label: 'Show endpoints table', value: 'show' },
        { label: 'Done', value: 'done' },
      ],
      initialValue: state.endpoints.length ? 'done' : undefined,
    });

    if (action === 'file') {
      const file = await promptOrCancel(text, {
        message: 'Path to endpoints file (.txt):',
        validate: filePathValidator,
      });
      const ok = await importFile(file);
      state.lastFile = file.trim();
      if (ok) showTable();
    } else if (action === 'discover') {
      await runLive();
      if (state.endpoints.length) showTable();
    } else if (action === 'add') {
      await addManual();
      showTable();
    } else if (action === 'remove') {
      await removeOne();
      if (state.endpoints.length) showTable();
    } else if (action === 'show') {
      showTable();
    } else {
      break;
    }
  }

  if (!state.endpoints.length) {
    log.error(
      'At least one endpoint is required to continue - import a .txt file or add endpoints manually.'
    );
    return 'retry';
  }

  log.success(`${state.endpoints.length} endpoint(s) configured.`);
}
