import chalk from 'chalk';
import * as clack from '@clack/prompts';
import { STEPS } from './state.js';

export {
  isCancel,
  cancel,
  intro,
  outro,
  note,
  log,
  text,
  select,
  confirm,
  multiselect,
  password,
  multiline,
  spinner,
} from '@clack/prompts';

/** Runs a clack prompt and exits cleanly when the user presses Ctrl+C. */
export async function promptOrCancel(promptFn, options) {
  const result = await promptFn(options);
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return result;
}

/** Gradient rows for the ASCII logo (indigo -> pink). */
const LOGO_GRADIENT = ['#6366f1', '#7c3aed', '#a855f7', '#c026d3', '#db2777', '#be185d'];

const LOGO = [
  '   █████╗   ██╗    ██████╗',
  '  ██╔══██╗  ██║   ██╔════╝',
  '  ███████║  ██║   ██║  ███╗',
  '  ██╔══██║  ██║   ██║   ██║',
  '  ██║  ██║  ██║   ╚██████╔╝',
  '  ╚═╝  ╚═╝  ╚═╝    ╚═════╝',
];

export function printLogo() {
  console.log('');
  for (let i = 0; i < LOGO.length; i += 1) {
    console.log(chalk.hex(LOGO_GRADIENT[i % LOGO_GRADIENT.length])(LOGO[i]));
  }
}

export function banner() {
  printLogo();
  clack.intro(chalk.bold('AI Integration Generator'));
  clack.log.message(
    [
      chalk.dim(
        'Generate a customized AI Server, MCP Server, AI Chat Client and docs for any existing API.'
      ),
      chalk.dim('All 8 steps run right here in the terminal.'),
    ],
    { spacing: 1 }
  );
}

/** Short labels used by the step tracker. */
const TRACK = [
  'App',
  'Auth',
  'AI',
  'Endpoints',
  'Payloads',
  'Preview',
  'Generate',
  'Download',
];

/**
 * Modern step tracker line, e.g.
 *   ✓ App   ✓ Auth   ◆ AI   ○ Endpoints   ○ Payloads   ○ Preview   ○ Generate   ○ Download
 */
function trackerLine(current) {
  return TRACK.map((label, i) => {
    if (i < current) return `${chalk.green('✓')} ${chalk.green.dim(label)}`;
    if (i === current) return `${chalk.cyan('◆')} ${chalk.bold.cyan(label)}`;
    return `${chalk.gray('○')} ${chalk.gray(label)}`;
  }).join('  ');
}

/** Opens a step inside the guide rail with the tracker + title. */
export function stepHeader(current) {
  clack.log.message(trackerLine(current), { spacing: 1 });
  clack.intro(chalk.bold.cyan(`Step ${current + 1}/8 · ${STEPS[current].title}`));
  clack.log.message(chalk.dim(STEPS[current].subtitle));
}

/** Vertical spacing line inside the guide rail. */
export function gap() {
  clack.log.message('');
}
