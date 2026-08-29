#!/usr/bin/env node
import { createRequire } from 'node:module';
import chalk from 'chalk';
import { banner, outro, select, cancel, promptOrCancel } from './ui.js';
import { createState, STEPS } from './state.js';
import { stepApplication } from './steps/application.js';
import { stepAuthentication } from './steps/authentication.js';
import { stepAI } from './steps/ai.js';
import { stepDiscovery } from './steps/discovery.js';
import { stepPayload } from './steps/payload.js';
import { stepPreview } from './steps/preview.js';
import { stepGenerate } from './steps/generate.js';
import { stepDownload } from './steps/download.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const HELP = `${chalk.bold(pkg.name)} v${pkg.version}

Interactive terminal wizard - generates a customized AI Server, MCP Server,
AI Chat Client and documentation for any existing API (all 8 steps run here).

Usage:
  ${chalk.cyan('ai-generate')}          start the wizard
  ${chalk.cyan('npx ai-integration-generator-cli')}   run without installing

Options:
  -v, --version   print the version
  -h, --help      show this help

Environment:
  API_URL         backend API base URL (default http://localhost:4000)

Examples:
  ${chalk.cyan('ai-generate')}
  ${chalk.cyan('$env:API_URL = "https://api.example.com"; ai-generate')}   (PowerShell)
`;

const args = process.argv.slice(2);
if (args.includes('-v') || args.includes('--version')) {
  console.log(pkg.version);
  process.exit(0);
}
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const STEPS_IMPL = [
  stepApplication,
  stepAuthentication,
  stepAI,
  stepDiscovery,
  stepPayload,
  stepPreview,
  stepGenerate,
  stepDownload,
];

process.on('SIGINT', () => {
  cancel('Operation cancelled.');
  process.exit(0);
});
async function navMenu(current) {
  return promptOrCancel(select, {
    message: 'Next:',
    options: [
      {
        label: `Continue to "${STEPS[current + 1].title}"`,
        value: 'next',
        hint: 'enter',
      },
      ...(current > 0
        ? [{ label: `← Back to "${STEPS[current - 1].title}"`, value: 'back' }]
        : []),
      { label: 'Quit', value: 'quit' },
    ],
  });
}

async function main() {
  banner();
  const state = createState();
  let current = 0;

  while (current < STEPS.length) {
    const result = await STEPS_IMPL[current](state);
    if (result === 'retry') continue;
    if (result === 'back') {
      current = Math.max(0, current - 1);
      continue;
    }
    if (result === 'quit') {
      console.log('');
      cancel('Stopped.');
      process.exit(0);
    }

    if (current === STEPS.length - 1) {
      if (state.nextAction === 'again') {
        Object.assign(state, createState());
        current = 0;
        console.log('');
        banner();
        continue;
      }
      break;
    }

    const nav = await navMenu(current);
    if (nav === 'next') current += 1;
    else if (nav === 'back') current = Math.max(0, current - 1);
    else break;
  }

  console.log('');
  outro(
    chalk.bold('Done! Check the README inside the downloaded project to run everything.')
  );
}

main().catch((err) => {
  console.error(chalk.red(`\n  [error] ${err?.message || err}`));
  process.exit(1);
});
