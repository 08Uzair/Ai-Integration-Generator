import chalk from 'chalk';
import { log, stepHeader, gap } from '../ui.js';

/** Step 3 - AI provider settings. The model is FIXED (openai/gpt-oss-120b). */
export async function stepAI(state) {
  stepHeader(2);

  log.info(
    `Provider: ${chalk.bold(state.ai.provider)}  ${chalk.dim('(fast inference, free tier available)')}`
  );
  log.info(
    `Model:    ${chalk.bold.magenta(state.ai.model)}  ${chalk.dim('- fixed, used by every generated project automatically')}`
  );
  gap();
  log.message(
    chalk.dim(
      'The generated code uses a provider abstraction - OpenAI, Anthropic, Gemini, Ollama and'
    )
  );
  log.message(
    chalk.dim('OpenRouter slots are ready in ai-server/src/providers/ai-provider.js.')
  );
  gap();
  log.message(
    chalk.dim(
      'You set your GROQ_API_KEY in the generated ai-server/.env file - the generator never asks'
    )
  );
  log.message(chalk.dim('for or stores your key.'));
}
