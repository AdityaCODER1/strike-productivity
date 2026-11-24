export type TaskBucket = 'today' | 'later';

export type CategoryColorToken =
  | 'blue'
  | 'green'
  | 'amber'
  | 'teal'
  | 'coral'
  | 'cyan'
  | 'slate';

export interface CategoryConfig {
  id: string;
  name: string;
  colorToken: CategoryColorToken;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export const GEMINI_MODEL_PRESETS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Default)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
] as const;

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'cat-work', name: 'Work', colorToken: 'blue' },
  { id: 'cat-personal', name: 'Personal', colorToken: 'teal' },
  { id: 'cat-health', name: 'Health', colorToken: 'green' },
  { id: 'cat-learning', name: 'Learning', colorToken: 'amber' },
  { id: 'cat-home', name: 'Home', colorToken: 'coral' },
  { id: 'cat-social', name: 'Social', colorToken: 'cyan' },
];

export interface UserPreferences {
  geminiApiKey: string;
  geminiModel: string;
  categories: CategoryConfig[];
  updatedAt: number;
}

export interface TaskItem {
  id: string;
  title: string;
  bucket: TaskBucket;
  completed: boolean;
  completedAt: number | null;
  completedDateKey: string | null;
  linkedLogEntryId: string | null;
  category?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type LogEntrySource = 'brain_dump' | 'task_checkoff' | 'manual';

export interface LogEntry {
  id: string;
  dateKey: string; // Local YYYY-MM-DD
  title: string;
  category: string;
  source: LogEntrySource;
  linkedTaskId: string | null;
  rawDumpId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SuggestedTaskItem {
  id: string;
  title: string;
  suggestedBucket: TaskBucket;
  category: string;
}

export interface MatchedOpenTaskItem {
  id: string;
  taskId: string;
  taskTitle: string;
  activityTitle: string;
  category: string;
  linkedLogEntryId: string;
}

export interface PendingSuggestions {
  dateKey: string;
  unfinishedTasks: SuggestedTaskItem[];
  matchedTasks: MatchedOpenTaskItem[];
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface StrikeExportPayload {
  version: 1;
  exportedAt: string;
  app: 'Strike';
  tasks: TaskItem[];
  logs: LogEntry[];
  categories: CategoryConfig[];
}

export type ActiveTab = 'plan' | 'today' | 'history' | 'settings';
