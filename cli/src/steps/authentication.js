import chalk from 'chalk';
import { log, select, password, text, promptOrCancel, stepHeader, gap } from '../ui.js';

const AUTH_TYPES = [
  { value: 'none', label: 'No authentication' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key', label: 'API Key' },
  { value: 'custom-header', label: 'Custom Header' },
  { value: 'basic', label: 'Basic Authentication' },
];

/** Step 2 - how clients authenticate against the target API. */
export async function stepAuthentication(state) {
  stepHeader(1);

  const type = await promptOrCancel(select, {
    message: 'Authentication method:',
    options: AUTH_TYPES,
    initialValue: state.auth.type,
  });
  state.auth.type = type;

  if (type === 'bearer') {
    state.auth.token = await promptOrCancel(password, {
      message: 'Bearer token:',
      placeholder: 'tok_... or JWT',
      initialValue: state.auth.token || '',
    });
  }

  if (type === 'api-key') {
    state.auth.apiKeyHeader = await promptOrCancel(text, {
      message: 'API key header:',
      initialValue: state.auth.apiKeyHeader || 'x-api-key',
    });
    state.auth.token = await promptOrCancel(password, {
      message: 'API key:',
      placeholder: 'Your secret key',
      initialValue: state.auth.token || '',
    });
  }

  if (type === 'custom-header') {
    state.auth.headerName = await promptOrCancel(text, {
      message: 'Header name:',
      initialValue: state.auth.headerName || 'x-auth-token',
    });
    state.auth.headerValue = await promptOrCancel(password, {
      message: 'Header value:',
      placeholder: 'Static header value',
      initialValue: state.auth.headerValue || '',
    });
  }

  if (type === 'basic') {
    state.auth.username = await promptOrCancel(text, {
      message: 'Username:',
      initialValue: state.auth.username || undefined,
    });
    state.auth.basicPassword = await promptOrCancel(password, {
      message: 'Password:',
      initialValue: state.auth.basicPassword || '',
    });
  }

  gap();
  log.message(
    chalk.dim(
      'Credentials are used only for the live connection test - never stored, never exported.'
    )
  );
}
