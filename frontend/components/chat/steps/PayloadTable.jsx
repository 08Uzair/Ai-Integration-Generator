'use client';

import { Braces, Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FIELD_TYPES, buildExampleFromFields, fieldsFromExampleText } from '../../../lib/payload';
import { endpointKey, useWizard } from '../../wizard/WizardContext';
import { ChatButton, Chip } from '../ui';
import { MethodPill } from './EndpointList';

const EMPTY_FIELD = { name: '', type: 'string', required: false, description: '' };

const INPUT_CLASS =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200';

export function PayloadTable({ endpoint }) {
  const { payloads, setPayloads, invalidate } = useWizard();
  const key = endpointKey(endpoint);
  const payload = payloads[key];
  const fields = payload?.fields || [];
  const hasBody = payload?.hasBody !== false;
  const configured = Boolean(payload) && (payload.hasBody === false || payload.confirmed === true || fields.length > 0 || payload.example !== undefined);

  const [draft, setDraft] = useState(EMPTY_FIELD);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');

  const update = (patch) => {
    setPayloads((prev) => ({
      ...prev,
      [key]: { hasBody: true, fields: [], example: undefined, ...prev[key], ...patch, confirmed: true },
    }));
    invalidate({ preview: true, generation: true });
  };

  const setFields = (nextFields) => {
    update({ fields: nextFields, example: nextFields.length ? buildExampleFromFields(nextFields) : undefined });
  };

  const editField = (index, patch) => {
    setFields(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const addField = (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setError('Field name is required.');
      return;
    }
    if (fields.some((field) => field.name === name)) {
      setError(`"${name}" is already in the table.`);
      return;
    }
    setFields([...fields, { name, type: draft.type, required: draft.required, description: draft.description.trim() }]);
    setDraft(EMPTY_FIELD);
    setError('');
  };

  const markNoBody = () => {
    update({ hasBody: false, fields: [], example: undefined });
    setJsonOpen(false);
    setError('');
  };

  const markBody = () => update({ hasBody: true });

  const toggleJson = () => {
    if (jsonOpen) {
      setJsonOpen(false);
      return;
    }
    setJsonText(JSON.stringify(payload?.example ?? buildExampleFromFields(fields), null, 2));
    setJsonOpen(true);
    setError('');
  };

  const applyJson = () => {
    try {
      const { example, rows } = fieldsFromExampleText(jsonText);
      update({ hasBody: true, example, fields: rows });
      setJsonOpen(false);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-900 dark:bg-zinc-950/80">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-900 dark:bg-zinc-950">
        <MethodPill method={endpoint.method} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{endpoint.path}</span>
        <Chip tone={configured ? 'emerald' : 'amber'}>{hasBody ? `${fields.length} field(s)` : 'no request body'}</Chip>
        {hasBody ? (
          <button type="button" onClick={markNoBody} className="text-[11px] text-zinc-400 transition hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400">
            No body
          </button>
        ) : (
          <button type="button" onClick={markBody} className="text-[11px] text-emerald-600 transition hover:underline dark:text-emerald-400">
            Add body
          </button>
        )}
      </div>

      {!hasBody && (
        <p className="px-3 py-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          Marked as no request body - the AI will call this endpoint without a JSON body.
        </p>
      )}

      {hasBody && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-zinc-50/60 text-[11px] uppercase tracking-wide text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Field</th>
                  <th scope="col" className="w-28 px-3 py-2 font-medium">Type</th>
                  <th scope="col" className="w-16 px-3 py-2 font-medium">Required</th>
                  <th scope="col" className="px-3 py-2 font-medium">Description</th>
                  <th scope="col" className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                      No fields yet - add one below or paste a JSON example.
                    </td>
                  </tr>
                )}
                {fields.map((field, index) => (
                  <tr key={`${field.name}-${index}`}>
                    <td className="px-3 py-1.5">
                      <input
                        value={field.name}
                        onChange={(event) => editField(index, { name: event.target.value })}
                        aria-label="Field name"
                        className={`${INPUT_CLASS} w-full min-w-28 font-mono`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={field.type || 'string'}
                        onChange={(event) => editField(index, { type: event.target.value })}
                        aria-label="Field type"
                        className={`${INPUT_CLASS} w-full font-mono`}
                      >
                        {FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(event) => editField(index, { required: event.target.checked })}
                        aria-label={`${field.name || 'Field'} required`}
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={field.description || ''}
                        onChange={(event) => editField(index, { description: event.target.value })}
                        placeholder="optional"
                        aria-label="Field description"
                        className={`${INPUT_CLASS} w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        aria-label={`Remove ${field.name || 'field'}`}
                        className="rounded p-1 text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={addField} className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-900">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="paymentInfo.id"
              aria-label="New field name"
              className={`${INPUT_CLASS} min-w-36 flex-1 font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
            />
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              aria-label="New field type"
              className={`${INPUT_CLASS} font-mono`}
            >
              {FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              required
            </label>
            <input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Description (optional)"
              aria-label="New field description"
              className={`${INPUT_CLASS} min-w-32 flex-1 placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
            />
            <ChatButton type="submit" size="sm">
              <Plus size={13} /> Add field
            </ChatButton>
            <ChatButton type="button" size="sm" variant="secondary" onClick={toggleJson}>
              <Braces size={13} /> JSON
            </ChatButton>
          </form>

          {jsonOpen && (
            <div className="space-y-2 border-t border-zinc-200 bg-zinc-50/60 px-3 py-3 dark:border-zinc-900 dark:bg-zinc-950/60">
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={7}
                spellCheck={false}
                aria-label="Payload JSON example"
                className={`${INPUT_CLASS} w-full font-mono`}
              />
              {error && <p className="text-[11px] text-rose-500 dark:text-rose-400">{error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <ChatButton type="button" size="sm" onClick={applyJson}>
                  <Check size={13} /> Apply JSON
                </ChatButton>
                <ChatButton type="button" size="sm" variant="ghost" onClick={() => { setJsonOpen(false); setError(''); }}>
                  Cancel
                </ChatButton>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Every nested field becomes a row.</span>
              </div>
            </div>
          )}

          {error && !jsonOpen && <p className="px-3 pb-2 text-[11px] text-rose-500 dark:text-rose-400">{error}</p>}
        </>
      )}
    </div>
  );
}
