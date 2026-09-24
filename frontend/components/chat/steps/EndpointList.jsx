'use client';

import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { endpointKey, useWizard } from '../../wizard/WizardContext';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const EMPTY_DRAFT = { method: 'GET', path: '', summary: '' };

export function MethodPill({ method }) {
  return <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset ${methodColor(method)}`}>{method}</span>;
}

export function methodColor(method) {
  switch (method) {
    case 'GET':
      return 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300';
    case 'POST':
      return 'bg-green-500/10 text-green-600 ring-green-500/30 dark:text-green-300';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-300';
    case 'DELETE':
      return 'bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300';
    default:
      return 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/30 dark:text-zinc-400';
  }
}

const INPUT_CLASS =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200';

function normalizePath(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function EndpointList() {
  const { endpoints, setEndpoints, payloads, setPayloads, invalidate } = useWizard();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const commit = (next) => {
    setEndpoints(next);
    invalidate({ preview: true, generation: true });
  };

  const isDuplicate = (method, path, ignore = -1) =>
    endpoints.some((endpoint, index) => index !== ignore && endpointKey(endpoint) === endpointKey({ method, path }));

  const migratePayload = (from, to) => {
    if (from === to || !payloads[from]) return;
    setPayloads((prev) => {
      if (!prev[from]) return prev;
      const next = { ...prev, [to]: prev[from] };
      delete next[from];
      return next;
    });
  };

  const addEndpoint = (event) => {
    event.preventDefault();
    const path = normalizePath(draft.path);
    if (!path) {
      setError('Enter a path, e.g. /users/:id.');
      return;
    }
    if (isDuplicate(draft.method, path)) {
      setError(`${draft.method} ${path} is already in the list.`);
      return;
    }
    commit([
      ...endpoints,
      { method: draft.method, path, summary: draft.summary.trim() || `Custom ${draft.method} endpoint`, source: 'manual' },
    ]);
    setDraft(EMPTY_DRAFT);
    setAdding(false);
    setError('');
  };

  const saveEdit = () => {
    if (!editing) return;
    const path = normalizePath(editing.path);
    if (!path) {
      setError('Enter a path, e.g. /users/:id.');
      return;
    }
    if (isDuplicate(editing.method, path, editing.idx)) {
      setError(`${editing.method} ${path} is already in the list.`);
      return;
    }
    const target = endpoints[editing.idx];
    const next = endpoints.map((endpoint, index) =>
      index === editing.idx
        ? { ...endpoint, method: editing.method, path, summary: editing.summary.trim() || endpoint.summary }
        : endpoint
    );
    migratePayload(endpointKey(target), endpointKey({ method: editing.method, path }));
    commit(next);
    setEditing(null);
    setError('');
  };

  const removeEndpoint = (index) => {
    const target = endpoints[index];
    const key = endpointKey(target);
    commit(endpoints.filter((_, i) => i !== index));
    if (payloads[key]) {
      setPayloads((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <tr>
              <th scope="col" className="w-8 px-3 py-2 font-medium">#</th>
              <th scope="col" className="w-24 px-3 py-2 font-medium">Method</th>
              <th scope="col" className="px-3 py-2 font-medium">Path</th>
              <th scope="col" className="px-3 py-2 font-medium">Summary</th>
              <th scope="col" className="w-20 px-3 py-2 font-medium">Source</th>
              <th scope="col" className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {endpoints.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-5 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                  No endpoints yet - add one below or paste route lines in the chat.
                </td>
              </tr>
            )}
            {endpoints.map((endpoint, index) => {
              const isEditing = editing?.idx === index;
              return (
                <tr key={`${endpoint.method}-${endpoint.path}-${index}`} className="bg-white dark:bg-zinc-950/80">
                  <td className="px-3 py-2 text-right font-mono text-[11px] text-zinc-400 dark:text-zinc-600">{index + 1}</td>
                  {isEditing ? (
                    <>
                      <td className="px-3 py-1.5">
                        <select
                          value={editing.method}
                          onChange={(event) => setEditing({ ...editing, method: event.target.value })}
                          aria-label="Method"
                          className={`${INPUT_CLASS} w-full font-mono`}
                        >
                          {METHODS.map((method) => <option key={method}>{method}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={editing.path}
                          onChange={(event) => setEditing({ ...editing, path: event.target.value })}
                          aria-label="Endpoint path"
                          className={`${INPUT_CLASS} w-full min-w-36 font-mono`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={editing.summary}
                          onChange={(event) => setEditing({ ...editing, summary: event.target.value })}
                          aria-label="Summary"
                          className={`${INPUT_CLASS} w-full min-w-36`}
                        />
                      </td>
                      <td className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">{endpoint.source}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={saveEdit} aria-label="Save endpoint" className="rounded p-1 text-emerald-500 transition hover:bg-emerald-500/10 dark:text-emerald-400">
                          <Check size={14} />
                        </button>
                        <button type="button" onClick={() => { setEditing(null); setError(''); }} aria-label="Cancel editing" className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white">
                          <X size={14} />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2"><MethodPill method={endpoint.method} /></td>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{endpoint.path}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">{endpoint.summary}</td>
                      <td className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">{endpoint.source}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => { setEditing({ idx: index, method: endpoint.method, path: endpoint.path, summary: endpoint.summary || '' }); setError(''); }}
                          aria-label={`Edit ${endpoint.method} ${endpoint.path}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:text-emerald-400"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEndpoint(index)}
                          aria-label={`Remove ${endpoint.method} ${endpoint.path}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-900 dark:bg-zinc-950/60">
        {adding ? (
          <form onSubmit={addEndpoint} className="flex flex-wrap items-center gap-2">
            <select
              value={draft.method}
              onChange={(event) => setDraft({ ...draft, method: event.target.value })}
              aria-label="Method"
              className={`${INPUT_CLASS} font-mono`}
            >
              {METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
            <input
              value={draft.path}
              onChange={(event) => setDraft({ ...draft, path: event.target.value })}
              placeholder="/users/:id"
              aria-label="Endpoint path"
              className={`${INPUT_CLASS} min-w-36 flex-1 font-mono placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
            />
            <input
              value={draft.summary}
              onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              placeholder="Summary (optional)"
              aria-label="Summary"
              className={`${INPUT_CLASS} min-w-36 flex-1 placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
            />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110">
              <Plus size={13} /> Add
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); }} className="rounded-lg px-2 py-1.5 text-[11px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white">
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white">
            <Plus size={13} /> Add endpoint
          </button>
        )}
        {error && <p className="mt-1.5 text-[11px] text-rose-500 dark:text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
