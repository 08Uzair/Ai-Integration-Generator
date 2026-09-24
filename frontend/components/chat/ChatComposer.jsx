'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChatButton } from './ui';

export function ChatComposer({ onSend, busy = false, placeholder }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-3">
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-lg shadow-zinc-900/[0.04] transition focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/15 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/20">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder={busy ? 'Working on itâ€¦' : placeholder || 'Type your answerâ€¦'}
          aria-label="Message"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <ChatButton size="icon" onClick={submit} disabled={busy || !value.trim()} aria-label="Send message">
          <ArrowUp size={16} aria-hidden="true" />
        </ChatButton>
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
        Credentials stay in your browser and are never written into the generated project.
      </p>
    </div>
  );
}
