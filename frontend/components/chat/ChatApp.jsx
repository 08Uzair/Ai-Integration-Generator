'use client';

import { BookOpen, LayoutDashboard, Moon, RotateCcw, Sun, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stepAccess, useWizard, WizardProvider } from '@/components/wizard/WizardContext';
import { createConversation } from './conversation';
import { AssistantRow, AssistantText, StepCard, SuggestionChips, TypingRow, UserRow } from './ChatBubble';
import { ChatComposer } from './ChatComposer';
import { STEP_META } from './stepMeta';
import { StepTree } from './StepTree';
import { AiStep } from './steps/AiStep';
import { ApplicationStep } from './steps/ApplicationStep';
import { AuthenticationStep } from './steps/AuthenticationStep';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { DownloadStep } from './steps/DownloadStep';
import { GenerateStep } from './steps/GenerateStep';
import { PayloadStep } from './steps/PayloadStep';
import { PreviewStep } from './steps/PreviewStep';
import { StepSummary } from './steps/StepSummary';

const STEP_COMPONENTS = [ApplicationStep, AuthenticationStep, AiStep, DiscoveryStep, PayloadStep, PreviewStep, GenerateStep, DownloadStep];

const WELCOME =
  'Hi, I am your integration assistant. I will generate a complete, standalone AI integration for your API: an MCP server, a Groq-powered AI server, a drop-in chat component, Docker configuration and documentation. Everything happens right here in the chat - I ask each question and you answer in the message box below.';

let entrySeq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(entrySeq += 1).toString(36)}`;

function IconLink({ href, label, children }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

function ChatShell() {
  const wizard = useWizard();
  const { step, reset, discovery, preview, generation } = wizard;
  const { canEnter } = stepAccess(wizard);

  const [theme, setTheme] = useState('dark');
  const [maxStep, setMaxStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [entries, setEntries] = useState(() => [{ id: 'welcome', role: 'assistant', kind: 'text', text: WELCOME }]);

  const wizardRef = useRef(wizard);
  wizardRef.current = wizard;

  const activeQuestionRef = useRef(activeQuestion);
  activeQuestionRef.current = activeQuestion;

  const appendRef = useRef(null);
  const resetRef = useRef(null);
  const conversationRef = useRef(null);
  const startedRef = useRef(false);
  const bottomRef = useRef(null);

  const append = useCallback((entry) => {
    const id = nextId(entry.role === 'user' ? 'user' : 'assistant');
    setEntries((prev) => [...prev, { ...entry, id }]);
    return id;
  }, []);

  appendRef.current = append;

  if (!conversationRef.current) {
    conversationRef.current = createConversation({
      wizard: () => wizardRef.current,
      append: (entry) => appendRef.current(entry),
      setTyping: (value) => setTyping(value),
      setActive: (question) => setActiveQuestion(question),
      onReset: () => resetRef.current(),
    });
  }

  const busy = typing || discovery.status === 'loading' || preview.status === 'loading' || generation.status === 'starting' || generation.status === 'running';
  const isDark = theme === 'dark';

  useEffect(() => {
    const stored = window.localStorage.getItem('aig.theme');
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
    } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('aig.theme', next);
      return next;
    });
  };

  useEffect(() => {
    setMaxStep((current) => Math.max(current, step));
  }, [step]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length, typing, activeQuestion]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    conversationRef.current?.start();
  }, []);

  const startNewChat = useCallback(() => {
    reset();
    setMaxStep(0);
    setTyping(false);
    setActiveQuestion(null);
    setEntries([{ id: nextId('welcome'), role: 'assistant', kind: 'text', text: WELCOME }]);
    conversationRef.current?.restart();
  }, [reset]);

  resetRef.current = startNewChat;

  const send = useCallback((text) => {
    const value = String(text ?? '').trim();
    if (!value) return;
    const question = activeQuestionRef.current;
    append({ role: 'user', kind: 'text', text: question?.secret ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : value });
    setActiveQuestion(null);
    Promise.resolve(conversationRef.current?.answer(value)).catch((err) => {
      append({ role: 'assistant', kind: 'text', text: `Something went wrong: ${err.message}` });
    });
  }, [append]);

  const selectStep = useCallback((index) => {
    const current = wizardRef.current.step;
    if (index === current) return;
    conversationRef.current?.navigateTo(index);
  }, []);

  const lastStepEntryId = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      if (entry.kind === 'step') map.set(entry.stepIndex, entry.id);
    });
    return map;
  }, [entries]);

  return (
    <div
      className={`flex h-dvh flex-col overflow-hidden ${isDark ? 'dark bg-black text-zinc-100' : 'bg-[#fafafa] text-zinc-900'}`}
      style={{ colorScheme: isDark ? 'dark' : 'light' }}
    >
      <div aria-hidden="true" className="chat-grid pointer-events-none fixed inset-0 opacity-70" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/15"
      />

      <header className="relative z-20 shrink-0 border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-900/80 dark:bg-black/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30">
              <Zap size={17} aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-bold tracking-tight">
              AI Integration{' '}
              <span className="bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-green-400">
                Generator
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconLink href="/dashboard" label="Dashboard">
              <LayoutDashboard size={15} aria-hidden="true" />
            </IconLink>
            <IconLink href="/documentation" label="Documentation">
              <BookOpen size={15} aria-hidden="true" />
            </IconLink>
            <IconButton label="New chat" onClick={startNewChat}>
              <RotateCcw size={15} aria-hidden="true" />
            </IconButton>
            <IconButton label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
              {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
        <StepTree maxStep={maxStep} onSelectStep={selectStep} />
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
          {entries.map((entry) => {
            if (entry.kind === 'text') {
              return entry.role === 'user' ? (
                <UserRow key={entry.id}>{entry.text}</UserRow>
              ) : (
                <AssistantRow key={entry.id}>
                  <AssistantText>{entry.text}</AssistantText>
                  {!busy && entry.suggestions?.length > 0 && activeQuestion?.messageId === entry.id && (
                    <SuggestionChips options={entry.suggestions} onPick={send} />
                  )}
                </AssistantRow>
              );
            }

            const meta = STEP_META[entry.stepIndex];
            const StepBody = STEP_COMPONENTS[entry.stepIndex];
            const isActive = entry.stepIndex === step && lastStepEntryId.get(entry.stepIndex) === entry.id;
            const failed = entry.stepIndex === 6 && generation.status === 'error';
            const status = isActive ? 'active' : failed ? 'failed' : entry.stepIndex < maxStep ? 'done' : 'waiting';

            return (
              <AssistantRow key={entry.id}>
                <StepCard
                  index={entry.stepIndex}
                  meta={meta}
                  status={status}
                  onEdit={!isActive && (canEnter[entry.stepIndex] || entry.stepIndex < maxStep) ? () => selectStep(entry.stepIndex) : undefined}
                >
                  {isActive ? <StepBody /> : <StepSummary stepIndex={entry.stepIndex} />}
                </StepCard>
              </AssistantRow>
            );
          })}

          {typing && <TypingRow />}
          <div ref={bottomRef} className="h-px" />
        </div>
      </main>

      <footer className="relative z-20 shrink-0 border-t border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-900/80 dark:bg-black/80">
        <ChatComposer onSend={send} busy={busy} placeholder={activeQuestion?.placeholder} />
      </footer>
    </div>
  );
}

export function ChatApp() {
  return (
    <WizardProvider>
      <ChatShell />
    </WizardProvider>
  );
}
