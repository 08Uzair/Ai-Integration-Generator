import chalk from 'chalk';
import { apiFetch, buildConfig } from '../api.js';
import { log, spinner, stepHeader, gap } from '../ui.js';
import { askAfterFailure } from './preview.js';

const GENERATION_STEPS = [
  'Validating application',
  'Analyzing API',
  'Generating MCP Server',
  'Generating AI Server',
  'Preparing AI Chat component',
  'Generating Documentation',
  'Creating ZIP',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderDoneSteps(job) {
  const steps = job?.steps?.length
    ? job.steps
    : GENERATION_STEPS.map((label) => ({ label, status: 'completed' }));
  for (const s of steps) {
    if (s.status === 'failed') {
      log.error(`${s.label}${s.detail ? chalk.dim(`  ${s.detail}`) : ''}`);
    } else {
      log.step(s.label + (s.detail ? chalk.dim(`  ${s.detail}`) : ''));
    }
  }
}

function currentStepLabel(job) {
  if (job?.currentStep != null && job.steps?.[job.currentStep])
    return job.steps[job.currentStep].label;
  const running = job?.steps?.find((s) => s.status === 'running');
  return running?.label || 'Working...';
}

/** Step 7 - runs the generation job with live progress tracking. */
export async function stepGenerate(state) {
  stepHeader(6);

  const s = spinner();

  if (!state.generation?.integrationId) {
    s.start('Starting generation...');
    try {
      const config = buildConfig(state);
      config.tools = state.preview?.tools;
      const data = await apiFetch('/api/integrations/generate', {
        method: 'POST',
        body: config,
        timeoutMs: 20_000,
      });
      state.generation = {
        integrationId: data.integration._id,
        job: data.job,
        project: null,
      };
    } catch (err) {
      s.stop('Generation could not be started.');
      log.error(err.message);
      const choice = await askAfterFailure('Generation', '← Back to preview');
      if (choice === 'retry') return 'retry';
      if (choice === 'back') return 'back';
      return 'quit';
    }
  }

  while (true) {
    await sleep(2000);

    let status;
    try {
      status = await apiFetch(
        `/api/integrations/${state.generation.integrationId}/status`
      );
    } catch {
      s.message('Still polling the generation job...');
      continue;
    }

    state.generation.job = status.job;
    state.generation.project = status.project;
    s.message(currentStepLabel(status.job));

    if (status.job?.status === 'completed') {
      s.stop('Generation completed.');
      log.success('Your project is ready to download.');
      gap();
      renderDoneSteps(status.job);
      break;
    }
    if (status.job?.status === 'failed') {
      s.stop('Generation failed.');
      log.error(status.job.error || 'Generation failed.');
      renderDoneSteps(status.job);
      const choice = await askAfterFailure('Generation', '← Back to preview');
      if (choice === 'retry') {
        state.generation = null; // start a fresh job on retry
        return 'retry';
      }
      if (choice === 'back') return 'back';
      return 'quit';
    }
  }
}
