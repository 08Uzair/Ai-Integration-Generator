import { AppWindow, Bot, Download, Eye, FileJson2, Hammer, KeyRound, Radar } from 'lucide-react';

export const STEP_META = [
  { id: 'application', title: 'Application', short: 'Application', subtitle: 'App & API details', icon: AppWindow },
  { id: 'authentication', title: 'Authentication', short: 'Auth', subtitle: 'How clients sign in', icon: KeyRound },
  { id: 'ai', title: 'AI Configuration', short: 'AI Config', subtitle: 'Model provider', icon: Bot },
  { id: 'discovery', title: 'API Discovery', short: 'Discovery', subtitle: 'Test & analyze', icon: Radar },
  { id: 'payload', title: 'Payloads', short: 'Payloads', subtitle: 'Request bodies', icon: FileJson2 },
  { id: 'preview', title: 'Preview', short: 'Preview', subtitle: 'Review the plan', icon: Eye },
  { id: 'generate', title: 'Generate', short: 'Generate', subtitle: 'Build the project', icon: Hammer },
  { id: 'download', title: 'Download', short: 'Download', subtitle: 'Get your files', icon: Download },
];

export const TOTAL_STEPS = STEP_META.length;
