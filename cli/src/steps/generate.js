import chalk from 'chalk';
import { JOB_STEPS, configHash, runGeneration } from '../run.js';
import { log, spinner, stepHeader, gap } from '../ui.js';
import { askAfterFailure } from './preview.js';

function renderDoneSteps(job) {
  const steps = job?.steps?.length
    ? job.steps
    : JOB_STEPS.map((s) => ({ label: s.label, status: 'completed' }));
  for (const s of steps) {
    if (s.status === 'failed') {
      log.error(`${s.label}${s.detail ? chalk.dim(`  ${s.detail}`) : ''}`);
    } else {
      log.step(s.label + (s.detail ? chalk.dim(`  ${s.detail}`) : ''));
    }
  }
}

/** Step 7 - runs the generation job locally with live progress. */
export async function stepGenerate(state) {
  stepHeader(6);

  const s = spinner();

  // Re-entering with an unchanged draft (e.g. after going back) reuses it.
  if (
    state.generation?.status === 'completed' &&
    state.generation.configHash === configHash(state)
  ) {
    gap();
    log.success('Your project is ready to download (already generated).');
    gap();
    renderDoneSteps(state.generation);
    return;
  }

  s.start('Starting generation...');
  try {
    await runGeneration(state, (index, status) => {
      if (status === 'running') s.message(JOB_STEPS[index].label);
    });
    s.stop('Generation completed.');
    log.success('Your project is ready to download.');
    gap();
    renderDoneSteps(state.generation);
  } catch (err) {
    s.stop('Generation failed.');
    log.error(err.message || String(err));
    gap();
    renderDoneSteps(state.generation);
    const choice = await askAfterFailure('Generation', '← Back to preview');
    if (choice === 'retry') return 'retry';
    if (choice === 'back') return 'back';
    return 'quit';
  }
}
