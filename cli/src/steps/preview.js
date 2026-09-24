import chalk from 'chalk';
import { buildPreview } from '../run.js';
import { log, note, spinner, select, promptOrCancel, stepHeader, gap } from '../ui.js';
import { renderTable } from '../table.js';

/** Ask what to do after a failed preview/generation instead of auto-navigating back. */
export async function askAfterFailure(what, backLabel) {
  gap();
  log.message(
    chalk.dim('Generation runs locally - check the values entered in the previous steps.')
  );
  gap();
  const choice = await promptOrCancel(select, {
    message: `${what} failed - what next?`,
    options: [
      { label: 'Retry', value: 'retry' },
      { label: backLabel, value: 'back' },
      { label: 'Quit', value: 'quit' },
    ],
    initialValue: 'retry',
  });
  return choice;
}

/** Step 6 - review the complete plan before generating. */
export async function stepPreview(state) {
  stepHeader(5);

  const s = spinner();
  s.start('Building preview...');

  let result;
  try {
    result = await buildPreview(state);
    s.stop('Preview built.');
    state.preview = result;
  } catch (err) {
    s.stop('Preview failed.');
    log.error(err.message);
    const choice = await askAfterFailure('Preview', '← Back to payloads');
    if (choice === 'retry') return 'retry';
    if (choice === 'back') return 'back';
    return 'quit';
  }

  gap();
  log.info(
    chalk.bold(`MCP Server :${result.ports.mcpServer}`) +
      chalk.dim(
        `  · ${result.tools.length} tool(s) from ${state.endpoints.length} endpoint(s)`
      )
  );
  log.info(
    chalk.bold(`AI Server  :${result.ports.aiServer}`) +
      chalk.dim(`  · ${result.ai.model}`)
  );
  log.info(
    chalk.bold(`AI Chat    :`) +
      chalk.dim(`  AiChat.jsx drop-in component (react-markdown)`)
  );
  gap();

  renderTable(
    ['Tool', 'Description', 'Request'],
    result.tools.map((t) => [
      chalk.magenta(t.name),
      t.description,
      `${t.request.method} ${t.request.path}`,
    ]),
    { colWidths: [24, 62, 30], wrapWord: true }
  );

  gap();
  note(
    [
      ...result.auth.env.lines.map((l) => chalk.gray(l)),
      chalk.gray('GROQ_API_KEY='),
      chalk.gray(`GROQ_MODEL=${result.ai.model}`),
    ],
    'Environment contract - secrets stay out of the project'
  );
  gap();

  log.success('Preview ready - generation is started on the next screen.');
}
