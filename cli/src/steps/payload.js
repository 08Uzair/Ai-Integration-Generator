import chalk from 'chalk';
import { BODY_METHODS, endpointKey } from '../state.js';
import {
  FIELD_TYPES,
  fieldsFromExampleText,
  buildExampleFromFields,
} from '../payload.js';
import {
  log,
  select,
  confirm,
  text,
  multiline,
  promptOrCancel,
  stepHeader,
  gap,
} from '../ui.js';
import { renderTable, methodColor } from '../table.js';

function showPayloadTable(ep, payload) {
  const rows = (payload.fields || []).map((f) => [
    chalk.cyan(f.name),
    f.type,
    f.required ? chalk.green('yes') : chalk.gray('no'),
    f.description || '',
  ]);
  if (!rows.length) {
    log.warn('No fields defined yet.');
    return;
  }
  renderTable(['Field', 'Type', 'Required', 'Description'], rows, {
    colWidths: [36, 12, 10, 42],
  });
}

function showReconstructedJson(payload) {
  const fields = payload.fields || [];
  if (!fields.length) return;
  const rebuilt = buildExampleFromFields(fields);
  log.message([
    chalk.dim('Reconstructed payload from the table:'),
    ...JSON.stringify(rebuilt, null, 2)
      .split('\n')
      .map((l) => chalk.gray(l)),
  ]);
}

async function promptField(existing = {}) {
  const name = await promptOrCancel(text, {
    message: 'Field name (use dots for nested, e.g. paymentInfo.id):',
    placeholder: 'paymentInfo.id',
    initialValue: existing.name || undefined,
    validate: (v) => (v.trim() ? undefined : 'Field name is required'),
  });
  const type = await promptOrCancel(select, {
    message: 'Type:',
    options: FIELD_TYPES.map((t) => ({ label: t, value: t })),
    initialValue: existing.type || 'string',
  });
  const required = await promptOrCancel(confirm, {
    message: 'Required field?',
    initialValue: Boolean(existing.required),
  });
  const description = await promptOrCancel(text, {
    message: 'Description (optional):',
    placeholder: 'What is this field?',
    initialValue: existing.description || '',
  });
  return {
    name: name.trim(),
    type,
    required: Boolean(required),
    description: (description || '').trim(),
  };
}

/** Per-endpoint payload editor: table in the terminal with add/edit/remove. */
async function editPayloadFor(state, ep) {
  const key = endpointKey(ep);
  const payload = state.payloads[key];

  while (true) {
    const hasBody = payload.hasBody !== false;
    const action = await promptOrCancel(select, {
      message: `${methodColor(ep.method)(ep.method)} ${ep.path} - payload editor:`,
      options: [
        {
          label: 'Apply JSON example (auto-fill all fields, including nested)',
          value: 'example',
        },
        { label: 'Add field manually', value: 'add' },
        { label: 'Edit field', value: 'edit' },
        { label: 'Remove field', value: 'remove' },
        hasBody
          ? { label: 'Mark as "no request body"', value: 'toggle' }
          : { label: 'This endpoint expects a JSON request body', value: 'toggle' },
        { label: 'Done', value: 'done' },
      ],
    });

    if (action === 'example') {
      const pasted = await promptOrCancel(multiline, {
        message: 'Paste your example JSON payload:',
        placeholder: '{ "title": "My post", "content": "Hello" }',
        validate: (v) => {
          try {
            JSON.parse(v);
            return undefined;
          } catch {
            return 'Invalid JSON - fix the syntax, then press Enter twice to submit';
          }
        },
      });
      try {
        const { example, rows } = fieldsFromExampleText(pasted);
        const known = new Set((payload.fields || []).map((f) => f.name));
        const fresh = rows.filter((r) => !known.has(r.name));
        payload.example = example;
        if (fresh.length) {
          payload.fields = [...(payload.fields || []), ...fresh];
          log.success(
            `${fresh.length} field(s) added - nested objects fully expanded into the table.`
          );
        } else {
          log.info('All fields from the example already exist - example JSON updated.');
        }
        showPayloadTable(ep, payload);
        showReconstructedJson(payload);
      } catch (err) {
        log.error(err.message);
      }
    } else if (action === 'add') {
      payload.fields = [...(payload.fields || []), await promptField()];
      log.success('Field added.');
      showPayloadTable(ep, payload);
      showReconstructedJson(payload);
    } else if (action === 'edit') {
      const fields = payload.fields || [];
      if (!fields.length) {
        log.warn('No fields to edit yet.');
        continue;
      }
      const idx = await promptOrCancel(select, {
        message: 'Which field?',
        options: fields.map((f, i) => ({ label: f.name, value: i })),
      });
      payload.fields[idx] = await promptField(fields[idx]);
      log.success('Field updated.');
      showPayloadTable(ep, payload);
      showReconstructedJson(payload);
    } else if (action === 'remove') {
      const fields = payload.fields || [];
      if (!fields.length) {
        log.warn('No fields to remove yet.');
        continue;
      }
      const idx = await promptOrCancel(select, {
        message: 'Which field?',
        options: fields.map((f, i) => ({ label: f.name, value: i })),
      });
      payload.fields.splice(idx, 1);
      log.success('Field removed.');
      showPayloadTable(ep, payload);
      showReconstructedJson(payload);
    } else if (action === 'toggle') {
      payload.hasBody = !hasBody;
      if (!payload.hasBody) {
        payload.fields = [];
        payload.example = undefined;
      }
      log.info(
        payload.hasBody
          ? 'Endpoint now expects a JSON request body.'
          : 'Endpoint marked as having no request body.'
      );
    } else {
      break;
    }
  }

  if (payload.hasBody !== false && !(payload.fields || []).length && !payload.example) {
    const noBody = await promptOrCancel(confirm, {
      message: 'No fields or example defined - mark this endpoint as "no request body"?',
      initialValue: true,
    });
    if (noBody) payload.hasBody = false;
  }
}

/** Step 5 - define the request payload each endpoint needs (nested-aware). */
export async function stepPayload(state) {
  stepHeader(4);

  const bodyEndpoints = state.endpoints.filter((e) =>
    BODY_METHODS.includes(e.method.toUpperCase())
  );
  if (!bodyEndpoints.length) {
    log.info('No POST/PUT/PATCH endpoints - no request payloads needed.');
    return;
  }

  for (const ep of bodyEndpoints) {
    const key = endpointKey(ep);
    if (!state.payloads[key])
      state.payloads[key] = { hasBody: true, fields: [], example: undefined };
    const payload = state.payloads[key];
    const alreadyConfigured =
      payload.hasBody === false ||
      (payload.fields?.length || 0) > 0 ||
      payload.example !== undefined;
    if (alreadyConfigured) {
      const keep = await promptOrCancel(select, {
        message: `${methodColor(ep.method)(ep.method)} ${ep.path} - payload already configured:`,
        options: [
          { label: 'Keep it', value: 'keep' },
          { label: 'Edit payload', value: 'edit' },
        ],
        initialValue: 'keep',
      });
      if (keep === 'keep') continue;
    }
    await editPayloadFor(state, ep);
  }

  renderTable(
    ['Endpoint', 'Payload status'],
    bodyEndpoints.map((ep) => {
      const p = state.payloads[endpointKey(ep)];
      const ok =
        p.hasBody === false || (p.fields?.length || 0) > 0 || p.example !== undefined;
      const count = p.hasBody === false ? 'no body' : `${p.fields?.length || 0} field(s)`;
      return [
        `${methodColor(ep.method)(ep.method)} ${ep.path}`,
        ok ? chalk.green(count) : chalk.yellow('missing payload'),
      ];
    }),
    { colWidths: [52, 24] }
  );

  gap();
  log.success('Payloads configured for all body endpoints.');
}
