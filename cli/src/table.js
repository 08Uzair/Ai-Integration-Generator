import Table from 'cli-table3';
import chalk from 'chalk';

/**
 * Renders a boxed terminal table, e.g.
 *
 *   ┌────────┬───────────┬─────────┐
 *   │ Method │ Path      │ Summary │
 *   └────────┴───────────┴─────────┘
 */
export function renderTable(head, rows, { colWidths, wrapWord = false } = {}) {
  const table = new Table({
    head: head.map((h) => chalk.bold.cyan(h)),
    style: {
      head: [],
      border: [],
      'padding-left': 1,
      'padding-right': 1,
    },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
    colWidths,
    wrapWord,
  });

  for (const row of rows) table.push(row.map((cell) => String(cell ?? '')));
  console.log(table.toString());
}

export function methodColor(method) {
  switch (String(method).toUpperCase()) {
    case 'GET':
      return chalk.green;
    case 'POST':
      return chalk.cyan;
    case 'PUT':
    case 'PATCH':
      return chalk.yellow;
    case 'DELETE':
      return chalk.red;
    default:
      return chalk.gray;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function slugify(name) {
  return (
    String(name || 'project')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}
