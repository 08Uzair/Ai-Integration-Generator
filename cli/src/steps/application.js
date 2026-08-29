import { log, text, promptOrCancel, stepHeader } from '../ui.js';

const URL_RE = /^https?:\/\//i;

/** Step 1 - application details: project name, app URL, API base URL. */
export async function stepApplication(state) {
  stepHeader(0);

  state.name = await promptOrCancel(text, {
    message: 'Project name:',
    placeholder: 'e.g. My API Assistant',
    initialValue: state.name || undefined,
    validate: (v) =>
      v.trim().length >= 2 ? undefined : 'Project name must be at least 2 characters',
  });

  state.appUrl = await promptOrCancel(text, {
    message: 'Application URL (optional):',
    placeholder: 'https://example.com',
    initialValue: state.appUrl || undefined,
    validate: (v) =>
      !v.trim() || URL_RE.test(v.trim())
        ? undefined
        : 'Must start with http:// or https://',
  });

  state.apiBaseUrl = await promptOrCancel(text, {
    message: 'API Base URL:',
    placeholder: 'https://example.com/api',
    initialValue: state.apiBaseUrl || undefined,
    validate: (v) => (URL_RE.test(v.trim()) ? undefined : 'Must be a valid http(s) URL'),
  });

  log.success(`Project "${state.name}" · API base ${state.apiBaseUrl}`);
}
