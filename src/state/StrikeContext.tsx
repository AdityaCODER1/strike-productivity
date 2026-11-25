import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  StudySubjectId,
  getChapterById,
  getPyqYearsRange,
  getSubjectMeta,
  isLearningCategoryName,
} from '../data/ncertCatalog';
import {
  CategoryColorToken,
  CategoryConfig,
  ChapterStudyState,
  DEFAULT_CATEGORIES,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_STUDY_SETTINGS,
  DoubtItem,
  DoubtSource,
  FirebaseWebConfig,
  LogEntry,
  MatchedOpenTaskItem,
  MistakeItem,
  MistakeSource,
  MistakeType,
  PendingSuggestions,
  StrikeExportPayload,
  StudySettings,
  SuggestedTaskItem,
  TaskBucket,
  TaskItem,
  UserPreferences,
  isValidMistakeType,
} from '../types/models';
import {
  createTaskRecord,
  deferTodayTasksToTomorrowLogic,
  markTaskCompletedFromMatchedLog,
  moveTaskBucketLogic,
  promoteTomorrowTasksLogic,
  sortLogsForDisplay,
  sortTasksForDisplay,
  toggleTaskCompletionLogic,
} from './taskLogLogic';
import {
  BrainDumpFocusMode,
  ChapterSummaryScope,
  analyzeBrainDumpWithGemini,
  classifyStudyItemWithGemini,
  evaluateChapterCoverageWithGemini,
  explainDoubtWithGemini,
  summarizeChapterItemsWithGemini,
} from '../services/gemini';
import {
  deleteDoubtImageLocal,
  loadAllDoubtImagesLocal,
  saveDoubtImageLocal,
} from '../services/doubtImageCache';
import {
  FirebaseHandles,
  clearLocalFirebaseConfig,
  deleteDoubtRemote,
  deleteLogRemote,
  deleteMistakeRemote,
  deleteTaskRemote,
  initFirebaseIfConfigured,
  reinitializeFirebaseWithConfig,
  savePreferencesRemote,
  signInWithEmail,
  signInWithGoogleIdToken,
  signInWithGooglePopup,
  signOutFirebase,
  signUpWithEmail,
  subscribeToAuth,
  subscribeUserChapterProgress,
  subscribeUserDoubts,
  subscribeUserLogs,
  subscribeUserMistakes,
  subscribeUserPreferences,
  subscribeUserTasks,
  syncBatchToRemote,
  upsertChapterProgressRemote,
  upsertDoubtRemote,
  upsertLogRemote,
  upsertMistakeRemote,
  upsertTaskRemote,
} from '../services/firebase';
import {
  beginDirectGoogleSignIn,
  clearLocalGoogleClientId,
  consumeGoogleOAuthHashCallback,
  resolveGoogleClientId,
  saveLocalGoogleClientId,
} from '../services/googleAuth';
import { addDaysToDateKey, createId, toDateKey } from '../utils/date';

const STORAGE_KEYS = {
  tasks: 'strike.tasks.v1',
  logs: 'strike.logs.v1',
  prefs: 'strike.prefs.v1',
  chapterProgress: 'strike.chapterProgress.v1',
  doubts: 'strike.doubts.v1',
  mistakes: 'strike.mistakes.v1',
  migratedDoubtsCategory: 'strike.migratedDoubtsCat.v1',
  migratedMistakesCategory: 'strike.migratedMistakesCat.v1',
} as const;

export type SyncStatus = 'local-only' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface StudyTagInput {
  subjectId?: StudySubjectId;
  chapterId?: string;
}

export interface NewDoubtInput {
  subjectId: StudySubjectId;
  chapterId: string;
  title: string;
  questionText: string;
  imageDataUrl?: string | null;
  pyqYear?: number | null;
  resolutionNote?: string;
  source?: DoubtSource;
}

export interface NewMistakeInput {
  subjectId: StudySubjectId;
  chapterId: string;
  title: string;
  mistakeText: string;
  correctionNote?: string;
  mistakeType?: MistakeType;
  sourceLabel?: string;
  linkedDoubtId?: string;
  source?: MistakeSource;
}

interface StrikeContextValue {
  todayKey: string;
  tomorrowKey: string;
  tasks: TaskItem[];
  logs: LogEntry[];
  preferences: UserPreferences;
  studySettings: StudySettings;
  chapterProgress: Record<string, ChapterStudyState>;
  doubts: DoubtItem[];
  mistakes: MistakeItem[];
  evaluatingChapterIds: string[];
  summarizingChapterKeys: string[];
  pendingSuggestions: PendingSuggestions | null;
  dismissSuggestions: () => void;

  // Task actions
  addTask: (
    title: string,
    bucket: TaskBucket,
    category?: string,
    studyTag?: StudyTagInput
  ) => TaskItem | null;
  updateTask: (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'title' | 'bucket' | 'category' | 'subjectId' | 'chapterId'>>
  ) => void;
  toggleTaskCompletion: (taskId: string) => void;
  moveTaskBucket: (taskId: string, bucket: TaskBucket) => void;
  promoteAllTomorrowToToday: () => void;
  deferAllTodayToTomorrow: () => void;
  deleteTask: (taskId: string) => void;

  // Daily log & Gemini actions
  addManualLog: (
    title: string,
    category: string,
    dateKey?: string,
    studyTag?: StudyTagInput
  ) => LogEntry | null;
  updateLog: (
    logId: string,
    patch: Partial<Pick<LogEntry, 'title' | 'category' | 'dateKey' | 'subjectId' | 'chapterId'>>
  ) => void;
  deleteLog: (logId: string) => void;
  processBrainDump: (
    rawText: string,
    dateKey?: string,
    options?: { focusMode?: BrainDumpFocusMode }
  ) => Promise<{
    addedCount: number;
    suggestionsCount: number;
    doubtsCount: number;
    mistakesCount: number;
  }>;
  isProcessingDump: boolean;

  // Study Progress, PYQs, Doubts & Mistakes actions
  updateStudySettings: (patch: Partial<StudySettings>) => void;
  toggleChapterPyqYear: (chapterId: string, year: number) => void;
  setChapterPyqYears: (chapterId: string, years: number[]) => void;
  setManualChapterCoverage: (chapterId: string, percent: number) => void;
  refreshChapterCoverageWithAi: (chapterId: string, options?: { silent?: boolean }) => Promise<void>;
  assignItemChapter: (
    targetType: 'task' | 'log',
    id: string,
    subjectId: StudySubjectId | undefined,
    chapterId: string | undefined
  ) => void;
  addDoubt: (input: NewDoubtInput) => DoubtItem | null;
  updateDoubt: (
    doubtId: string,
    patch: Partial<
      Pick<
        DoubtItem,
        | 'subjectId'
        | 'chapterId'
        | 'title'
        | 'questionText'
        | 'imageDataUrl'
        | 'pyqYear'
        | 'status'
        | 'resolutionNote'
        | 'aiExplanation'
      >
    >
  ) => void;
  toggleDoubtStatus: (doubtId: string) => void;
  deleteDoubt: (doubtId: string) => void;
  explainDoubt: (doubtId: string) => Promise<string>;
  addMistake: (input: NewMistakeInput) => MistakeItem | null;
  addMistakesBatch: (inputs: NewMistakeInput[]) => MistakeItem[];
  updateMistake: (
    mistakeId: string,
    patch: Partial<
      Pick<
        MistakeItem,
        | 'subjectId'
        | 'chapterId'
        | 'title'
        | 'mistakeText'
        | 'correctionNote'
        | 'mistakeType'
        | 'sourceLabel'
        | 'status'
        | 'repeatCount'
        | 'lastRepeatedAt'
      >
    >
  ) => void;
  toggleMistakeStatus: (mistakeId: string) => void;
  incrementMistakeRepeat: (mistakeId: string) => void;
  deleteMistake: (mistakeId: string) => void;
  generateChapterSummary: (chapterId: string, scope: ChapterSummaryScope) => Promise<string>;

  // Suggestion sheet actions
  acceptSuggestedTask: (suggestionId: string, bucket: TaskBucket) => void;
  dismissSuggestedTask: (suggestionId: string) => void;
  acceptMatchedTask: (matchId: string) => void;
  dismissMatchedTask: (matchId: string) => void;
  acceptAllSuggestions: () => void;

  // Preferences & Categories
  updatePreferences: (patch: Partial<Pick<UserPreferences, 'geminiApiKey' | 'geminiModel'>>) => void;
  addCategory: (name: string, colorToken: CategoryColorToken) => void;
  updateCategory: (id: string, patch: Partial<Pick<CategoryConfig, 'name' | 'colorToken'>>) => void;
  deleteCategory: (id: string) => void;

  // Import/Export
  importBackupPayload: (payload: StrikeExportPayload) => void;

  // Cloud Sync / Firebase Auth
  firebaseConfigured: boolean;
  firebaseConfigSource: 'env' | 'local' | null;
  googleClientId: string;
  googleClientIdSource: 'env' | 'local' | null;
  saveGoogleClientId: (clientId: string) => void;
  clearGoogleClientId: () => void;
  user: User | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  configureFirebase: (config: FirebaseWebConfig) => Promise<void>;
  disconnectFirebaseConfig: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;

  // Toast feedback
  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
}

const StrikeContext = createContext<StrikeContextValue | null>(null);

function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeStudySettings(raw?: Partial<StudySettings> | null): StudySettings {
  const startRaw = Number(raw?.pyqYearStart);
  const endRaw = Number(raw?.pyqYearEnd);
  const s = Number.isFinite(startRaw) ? Math.floor(startRaw) : DEFAULT_STUDY_SETTINGS.pyqYearStart;
  const e = Number.isFinite(endRaw) ? Math.floor(endRaw) : DEFAULT_STUDY_SETTINGS.pyqYearEnd;
  const clampedStart = Math.max(1988, Math.min(2035, Math.min(s, e)));
  const clampedEnd = Math.max(1988, Math.min(2035, Math.max(s, e)));
  return {
    showArchivedNcert: Boolean(raw?.showArchivedNcert),
    pyqYearStart: clampedStart,
    pyqYearEnd: clampedEnd,
  };
}

function ensureDoubtsCategoryOnce(categories: CategoryConfig[]): CategoryConfig[] {
  const alreadyMigrated = (() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.migratedDoubtsCategory) === '1';
    } catch {
      return true;
    }
  })();

  if (alreadyMigrated) return categories;

  try {
    localStorage.setItem(STORAGE_KEYS.migratedDoubtsCategory, '1');
  } catch {
    // ignore storage errors
  }

  const hasDoubts = categories.some((c) => c.name.trim().toLowerCase() === 'doubts');
  if (hasDoubts) return categories;

  const learningIndex = categories.findIndex((c) => c.name.trim().toLowerCase() === 'learning');
  const next = [...categories];
  const doubtsConfig: CategoryConfig = { id: 'cat-doubts', name: 'Doubts', colorToken: 'coral' };
  if (learningIndex >= 0) {
    next.splice(learningIndex + 1, 0, doubtsConfig);
  } else {
    next.push(doubtsConfig);
  }
  return next;
}

function ensureMistakesCategoryOnce(categories: CategoryConfig[]): CategoryConfig[] {
  const alreadyMigrated = (() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.migratedMistakesCategory) === '1';
    } catch {
      return true;
    }
  })();

  if (alreadyMigrated) return categories;

  try {
    localStorage.setItem(STORAGE_KEYS.migratedMistakesCategory, '1');
  } catch {
    // ignore storage errors
  }

  const hasMistakes = categories.some((c) => c.name.trim().toLowerCase() === 'mistakes');
  if (hasMistakes) return categories;

  const doubtsIndex = categories.findIndex((c) => c.name.trim().toLowerCase() === 'doubts');
  const learningIndex = categories.findIndex((c) => c.name.trim().toLowerCase() === 'learning');
  const insertAfter = doubtsIndex >= 0 ? doubtsIndex : learningIndex;
  const next = [...categories];
  const mistakesConfig: CategoryConfig = {
    id: 'cat-mistakes',
    name: 'Mistakes',
    colorToken: 'coral',
  };
  if (insertAfter >= 0) {
    next.splice(insertAfter + 1, 0, mistakesConfig);
  } else {
    next.push(mistakesConfig);
  }
  return next;
}

function getInitialPreferences(): UserPreferences {
  const stored = loadLocalJson<Partial<UserPreferences>>(STORAGE_KEYS.prefs, {});
  const baseCategories =
    Array.isArray(stored.categories) && stored.categories.length > 0
      ? stored.categories
      : DEFAULT_CATEGORIES;
  return {
    geminiApiKey: typeof stored.geminiApiKey === 'string' ? stored.geminiApiKey : '',
    geminiModel:
      typeof stored.geminiModel === 'string' && stored.geminiModel.trim()
        ? stored.geminiModel
        : DEFAULT_GEMINI_MODEL,
    categories: ensureMistakesCategoryOnce(ensureDoubtsCategoryOnce(baseCategories)),
    studySettings: normalizeStudySettings(stored.studySettings),
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
  };
}

function sortDoubtsForDisplay(doubts: DoubtItem[]): DoubtItem[] {
  return [...doubts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

function sortMistakesForDisplay(mistakes: MistakeItem[]): MistakeItem[] {
  return [...mistakes].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
    return b.updatedAt - a.updatedAt;
  });
}

function stripImagesForLocalStorage(doubts: DoubtItem[]): DoubtItem[] {
  return doubts.map((d) => ({
    ...d,
    imageDataUrl: d.imageDataUrl ? null : d.imageDataUrl,
  }));
}

export const StrikeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todayKey, setTodayKey] = useState<string>(() => toDateKey());
  const tomorrowKey = useMemo(() => addDaysToDateKey(todayKey, 1), [todayKey]);

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    const initial = sortTasksForDisplay(loadLocalJson<TaskItem[]>(STORAGE_KEYS.tasks, []));
    return promoteTomorrowTasksLogic(initial, { mode: 'due_only', todayKey: toDateKey() }).nextTasks;
  });
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    sortLogsForDisplay(loadLocalJson<LogEntry[]>(STORAGE_KEYS.logs, []))
  );
  const [preferences, setPreferences] = useState<UserPreferences>(getInitialPreferences);
  const [chapterProgress, setChapterProgress] = useState<Record<string, ChapterStudyState>>(() =>
    loadLocalJson<Record<string, ChapterStudyState>>(STORAGE_KEYS.chapterProgress, {})
  );
  const [doubts, setDoubts] = useState<DoubtItem[]>(() =>
    sortDoubtsForDisplay(loadLocalJson<DoubtItem[]>(STORAGE_KEYS.doubts, []))
  );
  const [mistakes, setMistakes] = useState<MistakeItem[]>(() =>
    sortMistakesForDisplay(loadLocalJson<MistakeItem[]>(STORAGE_KEYS.mistakes, []))
  );
  const [evaluatingChapterIds, setEvaluatingChapterIds] = useState<string[]>([]);
  const [summarizingChapterKeys, setSummarizingChapterKeys] = useState<string[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestions | null>(null);
  const [isProcessingDump, setIsProcessingDump] = useState(false);

  const [fbHandles, setFbHandles] = useState<FirebaseHandles | null>(() => initFirebaseIfConfigured());
  const [googleClientIdState, setGoogleClientIdState] = useState(() => resolveGoogleClientId());
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    initFirebaseIfConfigured() ? 'signed-out' : 'local-only'
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const evalTimersRef = useRef<Map<string, number>>(new Map());
  const tasksRef = useRef(tasks);
  const logsRef = useRef(logs);
  const prefsRef = useRef(preferences);
  const chapterProgressRef = useRef(chapterProgress);
  const doubtsRef = useRef(doubts);
  const mistakesRef = useRef(mistakes);
  const hydratedUidRef = useRef<string | null>(null);

  const studySettings = useMemo(
    () => normalizeStudySettings(preferences.studySettings),
    [preferences.studySettings]
  );

  // Keep todayKey reactive across midnight and when returning to an open tab
  useEffect(() => {
    const syncDateKey = () => {
      const next = toDateKey();
      setTodayKey((prev) => (prev === next ? prev : next));
    };

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
    const midnightTimer = window.setTimeout(syncDateKey, msUntilMidnight);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncDateKey();
      }
    };

    window.addEventListener('focus', syncDateKey);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', syncDateKey);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [todayKey]);

  // Hydrate cached doubt diagram images from IndexedDB on initial mount
  useEffect(() => {
    let cancelled = false;
    loadAllDoubtImagesLocal().then((imageMap) => {
      if (cancelled || Object.keys(imageMap).length === 0) return;
      setDoubts((prev) =>
        prev.map((d) => (!d.imageDataUrl && imageMap[d.id] ? { ...d, imageDataUrl: imageMap[d.id] } : d))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup pending debounce timers on unmount
  useEffect(() => {
    const timers = evalTimersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
    try {
      localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    } catch {
      // Ignore storage quota errors
    }
  }, [tasks]);

  useEffect(() => {
    logsRef.current = logs;
    try {
      localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
    } catch {
      // Ignore storage quota errors
    }
  }, [logs]);

  useEffect(() => {
    prefsRef.current = preferences;
    try {
      localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(preferences));
    } catch {
      // Ignore storage quota errors
    }
  }, [preferences]);

  useEffect(() => {
    chapterProgressRef.current = chapterProgress;
    try {
      localStorage.setItem(STORAGE_KEYS.chapterProgress, JSON.stringify(chapterProgress));
    } catch {
      // Ignore storage quota errors
    }
  }, [chapterProgress]);

  useEffect(() => {
    doubtsRef.current = doubts;
    try {
      localStorage.setItem(STORAGE_KEYS.doubts, JSON.stringify(stripImagesForLocalStorage(doubts)));
    } catch {
      // Ignore storage quota errors
    }
  }, [doubts]);

  useEffect(() => {
    mistakesRef.current = mistakes;
    try {
      localStorage.setItem(STORAGE_KEYS.mistakes, JSON.stringify(mistakes));
    } catch {
      // Ignore storage quota errors
    }
  }, [mistakes]);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = createId('toast');
    setToast({ id, text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3200);
  }, []);

  // Online / offline network indicator
  useEffect(() => {
    const handleOffline = () => {
      if (fbHandles && user) setSyncStatus('offline');
    };
    const handleOnline = () => {
      if (fbHandles && user) setSyncStatus('synced');
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [fbHandles, user]);

  // Complete direct same-tab Google OAuth callback (#id_token=...) if present
  useEffect(() => {
    if (!fbHandles) return;

    const callbackResult = consumeGoogleOAuthHashCallback();
    if (!callbackResult) return;

    if (callbackResult.status === 'error') {
      setSyncError(callbackResult.message);
      showToast(callbackResult.message, 'error');
      return;
    }

    setSyncStatus('syncing');
    setSyncError(null);
    signInWithGoogleIdToken(fbHandles.auth, callbackResult.idToken)
      .then(() => {
        showToast('Signed in with Google', 'success');
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not complete Google sign-in with Firebase.';
        setSyncError(msg);
        setSyncStatus('signed-out');
        showToast('Google sign-in failed', 'error');
      });
  }, [fbHandles, showToast]);

  // Subscribe to Firebase Auth state
  useEffect(() => {
    if (!fbHandles) {
      setUser(null);
      setSyncStatus('local-only');
      return;
    }

    const unsub = subscribeToAuth(fbHandles.auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setSyncError(null);
        setSyncStatus('syncing');
      } else {
        hydratedUidRef.current = null;
        setSyncStatus('signed-out');
      }
    });

    return () => unsub();
  }, [fbHandles]);

  // Subscribe to Firestore collections when authenticated
  useEffect(() => {
    if (!fbHandles || !user) return;

    const uid = user.uid;
    let initialTasksMerged = false;
    let initialLogsMerged = false;
    let initialProgressMerged = false;
    let initialDoubtsMerged = false;
    let initialMistakesMerged = false;

    const handleErr = (err: Error) => {
      setSyncError(err.message);
      setSyncStatus('error');
    };

    const unsubTasks = subscribeUserTasks(
      fbHandles.db,
      uid,
      (remoteTasks) => {
        if (!initialTasksMerged && hydratedUidRef.current !== uid) {
          initialTasksMerged = true;
          const remoteIds = new Set(remoteTasks.map((t) => t.id));
          const localOnly = tasksRef.current.filter((t) => !remoteIds.has(t.id));
          if (localOnly.length > 0) {
            void syncBatchToRemote(fbHandles.db, uid, { upsertTasks: localOnly }).catch(handleErr);
            setTasks(sortTasksForDisplay([...remoteTasks, ...localOnly]));
          } else {
            setTasks(sortTasksForDisplay(remoteTasks));
          }
        } else {
          setTasks(sortTasksForDisplay(remoteTasks));
        }
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      },
      handleErr
    );

    const unsubLogs = subscribeUserLogs(
      fbHandles.db,
      uid,
      (remoteLogs) => {
        if (!initialLogsMerged && hydratedUidRef.current !== uid) {
          initialLogsMerged = true;
          const remoteIds = new Set(remoteLogs.map((l) => l.id));
          const localOnly = logsRef.current.filter((l) => !remoteIds.has(l.id));
          if (localOnly.length > 0) {
            void syncBatchToRemote(fbHandles.db, uid, { upsertLogs: localOnly }).catch(handleErr);
            setLogs(sortLogsForDisplay([...remoteLogs, ...localOnly]));
          } else {
            setLogs(sortLogsForDisplay(remoteLogs));
          }
        } else {
          setLogs(sortLogsForDisplay(remoteLogs));
        }
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      },
      handleErr
    );

    const unsubProgress = subscribeUserChapterProgress(
      fbHandles.db,
      uid,
      (remoteProgress) => {
        if (!initialProgressMerged && hydratedUidRef.current !== uid) {
          initialProgressMerged = true;
          const localOnly = Object.values(chapterProgressRef.current).filter(
            (p) => !remoteProgress[p.chapterId]
          );
          if (localOnly.length > 0) {
            void syncBatchToRemote(fbHandles.db, uid, { upsertChapterProgress: localOnly }).catch(
              handleErr
            );
            const merged = { ...remoteProgress };
            for (const item of localOnly) merged[item.chapterId] = item;
            setChapterProgress(merged);
          } else {
            setChapterProgress(remoteProgress);
          }
        } else {
          setChapterProgress(remoteProgress);
        }
      },
      handleErr
    );

    const unsubDoubts = subscribeUserDoubts(
      fbHandles.db,
      uid,
      (remoteDoubts) => {
        // Persist any synced images to IndexedDB cache for offline access
        for (const d of remoteDoubts) {
          if (d.imageDataUrl) {
            void saveDoubtImageLocal(d.id, d.imageDataUrl);
          }
        }

        if (!initialDoubtsMerged && hydratedUidRef.current !== uid) {
          initialDoubtsMerged = true;
          const remoteIds = new Set(remoteDoubts.map((d) => d.id));
          const localOnly = doubtsRef.current.filter((d) => !remoteIds.has(d.id));
          if (localOnly.length > 0) {
            void syncBatchToRemote(fbHandles.db, uid, { upsertDoubts: localOnly }).catch(handleErr);
            setDoubts(sortDoubtsForDisplay([...remoteDoubts, ...localOnly]));
          } else {
            setDoubts(sortDoubtsForDisplay(remoteDoubts));
          }
        } else {
          setDoubts(sortDoubtsForDisplay(remoteDoubts));
        }
      },
      handleErr
    );

    const unsubMistakes = subscribeUserMistakes(
      fbHandles.db,
      uid,
      (remoteMistakes) => {
        if (!initialMistakesMerged && hydratedUidRef.current !== uid) {
          initialMistakesMerged = true;
          const remoteIds = new Set(remoteMistakes.map((m) => m.id));
          const localOnly = mistakesRef.current.filter((m) => !remoteIds.has(m.id));
          if (localOnly.length > 0) {
            void syncBatchToRemote(fbHandles.db, uid, { upsertMistakes: localOnly }).catch(handleErr);
            setMistakes(sortMistakesForDisplay([...remoteMistakes, ...localOnly]));
          } else {
            setMistakes(sortMistakesForDisplay(remoteMistakes));
          }
        } else {
          setMistakes(sortMistakesForDisplay(remoteMistakes));
        }
      },
      handleErr
    );

    const unsubPrefs = subscribeUserPreferences(
      fbHandles.db,
      uid,
      (remotePrefs) => {
        if (remotePrefs) {
          const baseCats =
            Array.isArray(remotePrefs.categories) && remotePrefs.categories.length > 0
              ? remotePrefs.categories
              : DEFAULT_CATEGORIES;
          setPreferences({
            geminiApiKey: remotePrefs.geminiApiKey ?? '',
            geminiModel: remotePrefs.geminiModel || DEFAULT_GEMINI_MODEL,
            categories: baseCats,
            studySettings: normalizeStudySettings(remotePrefs.studySettings),
            updatedAt: remotePrefs.updatedAt || Date.now(),
          });
        } else if (prefsRef.current.geminiApiKey || prefsRef.current.updatedAt > 0) {
          void savePreferencesRemote(fbHandles.db, uid, prefsRef.current).catch(handleErr);
        }
        hydratedUidRef.current = uid;
      },
      handleErr
    );

    return () => {
      unsubTasks();
      unsubLogs();
      unsubProgress();
      unsubDoubts();
      unsubMistakes();
      unsubPrefs();
    };
  }, [fbHandles, user]);

  const runRemote = useCallback(
    (action: (db: FirebaseHandles['db'], uid: string) => Promise<void>) => {
      if (!fbHandles || !user) return;
      action(fbHandles.db, user.uid).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Cloud sync failed';
        setSyncError(msg);
        setSyncStatus('error');
      });
    },
    [fbHandles, user]
  );

  // Auto-promote due Tomorrow tasks into Today when the local date arrives or remote tasks arrive
  useEffect(() => {
    const { nextTasks, changedTasks, promotedCount } = promoteTomorrowTasksLogic(tasks, {
      mode: 'due_only',
      todayKey,
    });
    if (changedTasks.length === 0) return;

    setTasks(nextTasks);
    runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertTasks: changedTasks }));
    if (promotedCount > 0) {
      showToast(
        `Moved ${promotedCount} planned ${promotedCount === 1 ? 'task' : 'tasks'} into Today`,
        'info'
      );
    }
  }, [tasks, todayKey, runRemote, showToast]);

  // --- AI Holistic Chapter Coverage Evaluation ---
  const refreshChapterCoverageWithAi = useCallback(
    async (chapterId: string, options?: { silent?: boolean }) => {
      const chapter = getChapterById(chapterId);
      if (!chapter) return;

      const apiKey = prefsRef.current.geminiApiKey.trim();
      if (!apiKey) {
        if (!options?.silent) {
          showToast('Add your Gemini API key in Settings to calculate AI coverage %', 'error');
        }
        return;
      }

      const chapterLogs = logsRef.current
        .filter((l) => l.chapterId === chapterId && isLearningCategoryName(l.category))
        .map((l) => ({ dateKey: l.dateKey, title: l.title }));
      const existingProgress = chapterProgressRef.current[chapterId];
      const completedPyqYears = existingProgress?.completedPyqYears ?? [];
      const currentSettings = normalizeStudySettings(prefsRef.current.studySettings);
      const totalPyqYears = getPyqYearsRange(
        currentSettings.pyqYearStart,
        currentSettings.pyqYearEnd
      ).length;

      // Fast-path: no logs and no PYQ years -> 0% without burning an API call
      if (chapterLogs.length === 0 && completedPyqYears.length === 0) {
        const zeroState: ChapterStudyState = {
          ...(existingProgress ?? {}),
          chapterId: chapter.id,
          subjectId: chapter.subjectId,
          coveragePercent: 0,
          coverageSource: 'ai',
          aiSummary: 'No completed study logs or PYQs recorded yet.',
          lastEvaluatedAt: Date.now(),
          completedPyqYears: [],
          updatedAt: Date.now(),
        };
        setChapterProgress((prev) => ({ ...prev, [chapter.id]: zeroState }));
        runRemote((db, uid) => upsertChapterProgressRemote(db, uid, zeroState));
        return;
      }

      setEvaluatingChapterIds((prev) => (prev.includes(chapterId) ? prev : [...prev, chapterId]));
      try {
        const result = await evaluateChapterCoverageWithGemini({
          apiKey,
          model: prefsRef.current.geminiModel,
          chapter,
          completedLogs: chapterLogs,
          completedPyqYears,
          totalPyqYears,
          previousPercent: existingProgress?.coveragePercent ?? 0,
        });

        const now = Date.now();
        const latestExisting = chapterProgressRef.current[chapterId];
        const nextState: ChapterStudyState = {
          ...(latestExisting ?? {}),
          chapterId: chapter.id,
          subjectId: chapter.subjectId,
          coveragePercent: result.coveragePercent,
          coverageSource: 'ai',
          aiSummary: result.aiSummary,
          lastEvaluatedAt: now,
          completedPyqYears: latestExisting?.completedPyqYears ?? completedPyqYears,
          updatedAt: now,
        };

        setChapterProgress((prev) => ({ ...prev, [chapter.id]: nextState }));
        runRemote((db, uid) => upsertChapterProgressRemote(db, uid, nextState));
        if (!options?.silent) {
          showToast(`${chapter.title}: ${result.coveragePercent}% covered`, 'success');
        }
      } catch (err) {
        if (!options?.silent) {
          showToast(
            err instanceof Error ? err.message : 'Could not update chapter coverage %',
            'error'
          );
        }
      } finally {
        setEvaluatingChapterIds((prev) => prev.filter((id) => id !== chapterId));
      }
    },
    [runRemote, showToast]
  );

  const scheduleChapterEvaluation = useCallback(
    (chapterId: string | undefined, delayMs: number) => {
      if (!chapterId || !prefsRef.current.geminiApiKey.trim()) return;
      const existingTimer = evalTimersRef.current.get(chapterId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      const timerId = window.setTimeout(() => {
        evalTimersRef.current.delete(chapterId);
        void refreshChapterCoverageWithAi(chapterId, { silent: true });
      }, delayMs);
      evalTimersRef.current.set(chapterId, timerId);
    },
    [refreshChapterCoverageWithAi]
  );

  const autoTagLogAndEvaluate = useCallback(
    async (logEntry: LogEntry, linkedTaskId?: string | null) => {
      const apiKey = prefsRef.current.geminiApiKey.trim();
      if (!apiKey || !isLearningCategoryName(logEntry.category)) return;
      if (logEntry.chapterId) {
        scheduleChapterEvaluation(logEntry.chapterId, 300);
        return;
      }

      try {
        const currentSettings = normalizeStudySettings(prefsRef.current.studySettings);
        const result = await classifyStudyItemWithGemini({
          apiKey,
          model: prefsRef.current.geminiModel,
          text: logEntry.title,
          includeArchivedNcert: currentSettings.showArchivedNcert,
        });

        if (!result.chapterId || !result.subjectId) return;

        const now = Date.now();
        let updatedLog: LogEntry | null = null;
        setLogs((prev) =>
          sortLogsForDisplay(
            prev.map((l) => {
              if (l.id === logEntry.id && !l.chapterId) {
                updatedLog = {
                  ...l,
                  subjectId: result.subjectId!,
                  chapterId: result.chapterId!,
                  updatedAt: now,
                };
                return updatedLog;
              }
              return l;
            })
          )
        );

        let updatedTask: TaskItem | null = null;
        if (linkedTaskId) {
          setTasks((prev) =>
            sortTasksForDisplay(
              prev.map((t) => {
                if (t.id === linkedTaskId && !t.chapterId) {
                  updatedTask = {
                    ...t,
                    subjectId: result.subjectId!,
                    chapterId: result.chapterId!,
                    updatedAt: now,
                  };
                  return updatedTask;
                }
                return t;
              })
            )
          );
        }

        if (updatedLog || updatedTask) {
          runRemote((db, uid) =>
            syncBatchToRemote(db, uid, {
              upsertLogs: updatedLog ? [updatedLog] : undefined,
              upsertTasks: updatedTask ? [updatedTask] : undefined,
            })
          );
        }

        scheduleChapterEvaluation(result.chapterId, 250);
      } catch {
        // Silent fallback: user can still tag chapter manually in Study -> Needs Chapter Tag
      }
    },
    [runRemote, scheduleChapterEvaluation]
  );

  // --- Task Actions ---
  const addTask = useCallback(
    (
      title: string,
      bucket: TaskBucket,
      category?: string,
      studyTag?: StudyTagInput
    ): TaskItem | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const resolvedChap = getChapterById(studyTag?.chapterId);
      const task = createTaskRecord(trimmed, bucket, tasksRef.current, {
        category,
        subjectId: resolvedChap?.subjectId ?? studyTag?.subjectId,
        chapterId: resolvedChap?.id,
        scheduledForDateKey: bucket === 'tomorrow' ? tomorrowKey : undefined,
      });
      setTasks((prev) => sortTasksForDisplay([task, ...prev]));
      runRemote((db, uid) => upsertTaskRemote(db, uid, task));
      return task;
    },
    [runRemote, tomorrowKey]
  );

  const updateTask = useCallback(
    (
      taskId: string,
      patch: Partial<Pick<TaskItem, 'title' | 'bucket' | 'category' | 'subjectId' | 'chapterId'>>
    ) => {
      const existing = tasksRef.current.find((t) => t.id === taskId);
      if (!existing) return;

      const nextBucket = patch.bucket ?? existing.bucket;
      const { scheduledForDateKey: existingScheduled, ...existingWithoutScheduled } = existing;
      const nextScheduled =
        nextBucket === 'tomorrow'
          ? patch.bucket === 'tomorrow'
            ? existingScheduled ?? tomorrowKey
            : existingScheduled ?? tomorrowKey
          : undefined;

      const updated: TaskItem = {
        ...existingWithoutScheduled,
        ...patch,
        bucket: nextBucket,
        ...(nextScheduled ? { scheduledForDateKey: nextScheduled } : {}),
        title: patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
        updatedAt: Date.now(),
      };

      setTasks((prev) => sortTasksForDisplay(prev.map((t) => (t.id === taskId ? updated : t))));
      runRemote((db, uid) => upsertTaskRemote(db, uid, updated));
    },
    [runRemote, tomorrowKey]
  );

  const toggleTaskCompletion = useCallback(
    (taskId: string) => {
      const result = toggleTaskCompletionLogic(
        { tasks: tasksRef.current, logs: logsRef.current },
        taskId,
        prefsRef.current.categories,
        { todayKey }
      );
      if (!result) return;

      setTasks(sortTasksForDisplay(result.nextState.tasks));
      setLogs(sortLogsForDisplay(result.nextState.logs));

      runRemote((db, uid) =>
        syncBatchToRemote(db, uid, {
          upsertTasks: [result.updatedTask],
          upsertLogs: result.createdLog ? [result.createdLog] : undefined,
          deleteLogIds: result.deletedLogId ? [result.deletedLogId] : undefined,
        })
      );

      if (result.createdLog) {
        showToast('Checked off & added to Today’s log', 'success');
        if (isLearningCategoryName(result.createdLog.category)) {
          void autoTagLogAndEvaluate(result.createdLog, result.updatedTask.id);
        }
      } else if (result.updatedTask.chapterId && isLearningCategoryName(result.updatedTask.category)) {
        scheduleChapterEvaluation(result.updatedTask.chapterId, 500);
      }
    },
    [autoTagLogAndEvaluate, runRemote, scheduleChapterEvaluation, showToast, todayKey]
  );

  const moveTaskBucket = useCallback(
    (taskId: string, bucket: TaskBucket) => {
      const { nextTasks, updatedTask } = moveTaskBucketLogic(
        tasksRef.current,
        taskId,
        bucket,
        Date.now(),
        { scheduledForDateKey: bucket === 'tomorrow' ? tomorrowKey : undefined }
      );
      if (!updatedTask) return;
      setTasks(sortTasksForDisplay(nextTasks));
      runRemote((db, uid) => upsertTaskRemote(db, uid, updatedTask));
    },
    [runRemote, tomorrowKey]
  );

  const promoteAllTomorrowToToday = useCallback(() => {
    const { nextTasks, changedTasks, promotedCount } = promoteTomorrowTasksLogic(
      tasksRef.current,
      { mode: 'all', todayKey }
    );
    if (changedTasks.length === 0) return;
    setTasks(nextTasks);
    runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertTasks: changedTasks }));
    showToast(
      `Moved ${promotedCount} ${promotedCount === 1 ? 'task' : 'tasks'} to Today`,
      'success'
    );
  }, [runRemote, showToast, todayKey]);

  const deferAllTodayToTomorrow = useCallback(() => {
    const { nextTasks, changedTasks } = deferTodayTasksToTomorrowLogic(tasksRef.current, {
      todayKey,
      tomorrowKey,
    });
    if (changedTasks.length === 0) return;
    setTasks(nextTasks);
    runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertTasks: changedTasks }));
    showToast(
      `Deferred ${changedTasks.length} ${changedTasks.length === 1 ? 'task' : 'tasks'} to Tomorrow`,
      'info'
    );
  }, [runRemote, showToast, todayKey, tomorrowKey]);

  const deleteTask = useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      runRemote((db, uid) => deleteTaskRemote(db, uid, taskId));
    },
    [runRemote]
  );

  // --- Log Actions ---
  const addManualLog = useCallback(
    (
      title: string,
      category: string,
      dateKey: string = toDateKey(),
      studyTag?: StudyTagInput
    ): LogEntry | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const resolvedChap = getChapterById(studyTag?.chapterId);
      const now = Date.now();
      const entry: LogEntry = {
        id: createId('log'),
        dateKey,
        title: trimmed,
        category: category || prefsRef.current.categories[0]?.name || 'Personal',
        subjectId: resolvedChap?.subjectId ?? studyTag?.subjectId,
        chapterId: resolvedChap?.id,
        source: 'manual',
        linkedTaskId: null,
        createdAt: now,
        updatedAt: now,
      };

      setLogs((prev) => sortLogsForDisplay([entry, ...prev]));
      runRemote((db, uid) => upsertLogRemote(db, uid, entry));

      if (isLearningCategoryName(entry.category)) {
        void autoTagLogAndEvaluate(entry, null);
      }

      return entry;
    },
    [autoTagLogAndEvaluate, runRemote]
  );

  const updateLog = useCallback(
    (
      logId: string,
      patch: Partial<Pick<LogEntry, 'title' | 'category' | 'dateKey' | 'subjectId' | 'chapterId'>>
    ) => {
      const existing = logsRef.current.find((l) => l.id === logId);
      if (!existing) return;

      const updated: LogEntry = {
        ...existing,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
        updatedAt: Date.now(),
      };

      setLogs((prev) => sortLogsForDisplay(prev.map((l) => (l.id === logId ? updated : l))));
      runRemote((db, uid) => upsertLogRemote(db, uid, updated));

      if (existing.chapterId && existing.chapterId !== updated.chapterId) {
        scheduleChapterEvaluation(existing.chapterId, 500);
      }
      if (updated.chapterId && isLearningCategoryName(updated.category)) {
        scheduleChapterEvaluation(updated.chapterId, 500);
      }
    },
    [runRemote, scheduleChapterEvaluation]
  );

  const deleteLog = useCallback(
    (logId: string) => {
      const existing = logsRef.current.find((l) => l.id === logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      runRemote((db, uid) => deleteLogRemote(db, uid, logId));
      if (existing?.chapterId && isLearningCategoryName(existing.category)) {
        scheduleChapterEvaluation(existing.chapterId, 500);
      }
    },
    [runRemote, scheduleChapterEvaluation]
  );

  // --- Study Progress, PYQs & Doubts Actions ---
  const commitPreferences = useCallback(
    (next: UserPreferences) => {
      setPreferences(next);
      runRemote((db, uid) => savePreferencesRemote(db, uid, next));
    },
    [runRemote]
  );

  const updateStudySettings = useCallback(
    (patch: Partial<StudySettings>) => {
      const current = normalizeStudySettings(prefsRef.current.studySettings);
      const nextStudy = normalizeStudySettings({ ...current, ...patch });
      commitPreferences({
        ...prefsRef.current,
        studySettings: nextStudy,
        updatedAt: Date.now(),
      });
    },
    [commitPreferences]
  );

  const toggleChapterPyqYear = useCallback(
    (chapterId: string, year: number) => {
      const chapter = getChapterById(chapterId);
      if (!chapter) return;
      const existing = chapterProgressRef.current[chapterId];
      const currentYears = existing?.completedPyqYears ?? [];
      const hasYear = currentYears.includes(year);
      const nextYears = hasYear
        ? currentYears.filter((y) => y !== year)
        : [...currentYears, year].sort((a, b) => b - a);

      const nextState: ChapterStudyState = {
        ...(existing ?? {}),
        chapterId: chapter.id,
        subjectId: chapter.subjectId,
        coveragePercent: existing?.coveragePercent ?? 0,
        coverageSource: existing?.coverageSource ?? 'ai',
        aiSummary: existing?.aiSummary,
        lastEvaluatedAt: existing?.lastEvaluatedAt,
        completedPyqYears: nextYears,
        updatedAt: Date.now(),
      };

      setChapterProgress((prev) => ({ ...prev, [chapter.id]: nextState }));
      runRemote((db, uid) => upsertChapterProgressRemote(db, uid, nextState));
      scheduleChapterEvaluation(chapter.id, 2500);
    },
    [runRemote, scheduleChapterEvaluation]
  );

  const setChapterPyqYears = useCallback(
    (chapterId: string, years: number[]) => {
      const chapter = getChapterById(chapterId);
      if (!chapter) return;
      const existing = chapterProgressRef.current[chapterId];
      const cleanYears = Array.from(new Set(years)).sort((a, b) => b - a);
      const nextState: ChapterStudyState = {
        ...(existing ?? {}),
        chapterId: chapter.id,
        subjectId: chapter.subjectId,
        coveragePercent: existing?.coveragePercent ?? 0,
        coverageSource: existing?.coverageSource ?? 'ai',
        aiSummary: existing?.aiSummary,
        lastEvaluatedAt: existing?.lastEvaluatedAt,
        completedPyqYears: cleanYears,
        updatedAt: Date.now(),
      };
      setChapterProgress((prev) => ({ ...prev, [chapter.id]: nextState }));
      runRemote((db, uid) => upsertChapterProgressRemote(db, uid, nextState));
      scheduleChapterEvaluation(chapter.id, 2500);
    },
    [runRemote, scheduleChapterEvaluation]
  );

  const setManualChapterCoverage = useCallback(
    (chapterId: string, percent: number) => {
      const chapter = getChapterById(chapterId);
      if (!chapter) return;
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      const existing = chapterProgressRef.current[chapterId];
      const nextState: ChapterStudyState = {
        ...(existing ?? {}),
        chapterId: chapter.id,
        subjectId: chapter.subjectId,
        coveragePercent: clamped,
        coverageSource: 'manual',
        aiSummary: existing?.aiSummary,
        lastEvaluatedAt: existing?.lastEvaluatedAt,
        completedPyqYears: existing?.completedPyqYears ?? [],
        updatedAt: Date.now(),
      };
      setChapterProgress((prev) => ({ ...prev, [chapter.id]: nextState }));
      runRemote((db, uid) => upsertChapterProgressRemote(db, uid, nextState));
    },
    [runRemote]
  );

  const assignItemChapter = useCallback(
    (
      targetType: 'task' | 'log',
      id: string,
      subjectId: StudySubjectId | undefined,
      chapterId: string | undefined
    ) => {
      if (targetType === 'task') {
        updateTask(id, { subjectId, chapterId });
      } else {
        updateLog(id, { subjectId, chapterId });
      }
    },
    [updateLog, updateTask]
  );

  const addDoubt = useCallback(
    (input: NewDoubtInput): DoubtItem | null => {
      const title = input.title.trim();
      const questionText = input.questionText.trim() || title;
      if (!title && !questionText) return null;

      const chap = getChapterById(input.chapterId);
      const subjectId = chap?.subjectId ?? input.subjectId;
      const chapterId = chap?.id ?? input.chapterId;
      const now = Date.now();

      const item: DoubtItem = {
        id: createId('doubt'),
        subjectId,
        chapterId,
        title: title || questionText.slice(0, 72),
        questionText,
        imageDataUrl: input.imageDataUrl ?? null,
        pyqYear: input.pyqYear ?? null,
        status: 'open',
        resolutionNote: input.resolutionNote?.trim() ?? '',
        source: input.source ?? 'manual',
        createdAt: now,
        updatedAt: now,
      };

      if (item.imageDataUrl) {
        void saveDoubtImageLocal(item.id, item.imageDataUrl);
      }

      setDoubts((prev) => sortDoubtsForDisplay([item, ...prev]));
      runRemote((db, uid) => upsertDoubtRemote(db, uid, item));
      return item;
    },
    [runRemote]
  );

  const updateDoubt = useCallback(
    (
      doubtId: string,
      patch: Partial<
        Pick<
          DoubtItem,
          | 'subjectId'
          | 'chapterId'
          | 'title'
          | 'questionText'
          | 'imageDataUrl'
          | 'pyqYear'
          | 'status'
          | 'resolutionNote'
          | 'aiExplanation'
        >
      >
    ) => {
      const existing = doubtsRef.current.find((d) => d.id === doubtId);
      if (!existing) return;

      const chap = patch.chapterId ? getChapterById(patch.chapterId) : undefined;
      const updated: DoubtItem = {
        ...existing,
        ...patch,
        subjectId: chap?.subjectId ?? patch.subjectId ?? existing.subjectId,
        chapterId: chap?.id ?? patch.chapterId ?? existing.chapterId,
        title: patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
        updatedAt: Date.now(),
      };

      if (patch.imageDataUrl !== undefined) {
        if (patch.imageDataUrl) {
          void saveDoubtImageLocal(doubtId, patch.imageDataUrl);
        } else {
          void deleteDoubtImageLocal(doubtId);
        }
      }

      setDoubts((prev) => sortDoubtsForDisplay(prev.map((d) => (d.id === doubtId ? updated : d))));
      runRemote((db, uid) => upsertDoubtRemote(db, uid, updated));
    },
    [runRemote]
  );

  const toggleDoubtStatus = useCallback(
    (doubtId: string) => {
      const existing = doubtsRef.current.find((d) => d.id === doubtId);
      if (!existing) return;
      const nextStatus = existing.status === 'open' ? 'resolved' : 'open';
      updateDoubt(doubtId, { status: nextStatus });
      showToast(nextStatus === 'resolved' ? 'Doubt marked resolved' : 'Doubt reopened', 'success');
    },
    [showToast, updateDoubt]
  );

  const deleteDoubt = useCallback(
    (doubtId: string) => {
      setDoubts((prev) => prev.filter((d) => d.id !== doubtId));
      void deleteDoubtImageLocal(doubtId);
      runRemote((db, uid) => deleteDoubtRemote(db, uid, doubtId));
    },
    [runRemote]
  );

  const explainDoubt = useCallback(
    async (doubtId: string): Promise<string> => {
      const target = doubtsRef.current.find((d) => d.id === doubtId);
      if (!target) throw new Error('Doubt not found.');

      const apiKey = prefsRef.current.geminiApiKey.trim();
      if (!apiKey) {
        throw new Error('Add your Gemini API key in Settings to get AI explanations.');
      }

      const chap = getChapterById(target.chapterId);
      const subjectMeta = getSubjectMeta(target.subjectId);

      const explanation = await explainDoubtWithGemini({
        apiKey,
        model: prefsRef.current.geminiModel,
        subjectName: subjectMeta.name,
        chapterTitle: chap?.title ?? target.chapterId,
        classLevel: chap?.classLevel ?? 11,
        title: target.title,
        questionText: target.questionText,
        imageDataUrl: target.imageDataUrl,
      });

      updateDoubt(doubtId, { aiExplanation: explanation });
      return explanation;
    },
    [updateDoubt]
  );

  // --- Mistake Log Actions ---
  const buildMistakeRecord = useCallback((input: NewMistakeInput, timestamp: number): MistakeItem | null => {
    const title = input.title.trim();
    const mistakeText = input.mistakeText.trim() || title;
    if (!title && !mistakeText) return null;

    const chap = getChapterById(input.chapterId);
    const subjectId = chap?.subjectId ?? input.subjectId;
    const chapterId = chap?.id ?? input.chapterId;
    const cleanSource = input.sourceLabel?.trim();

    return {
      id: createId('mistake'),
      subjectId,
      chapterId,
      title: title || mistakeText.slice(0, 80),
      mistakeText,
      correctionNote: input.correctionNote?.trim() ?? '',
      mistakeType: isValidMistakeType(input.mistakeType) ? input.mistakeType : 'conceptual',
      ...(cleanSource ? { sourceLabel: cleanSource } : {}),
      status: 'active',
      repeatCount: 1,
      ...(input.linkedDoubtId ? { linkedDoubtId: input.linkedDoubtId } : {}),
      source: input.source ?? 'manual',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }, []);

  const addMistake = useCallback(
    (input: NewMistakeInput): MistakeItem | null => {
      const item = buildMistakeRecord(input, Date.now());
      if (!item) return null;
      setMistakes((prev) => sortMistakesForDisplay([item, ...prev]));
      runRemote((db, uid) => upsertMistakeRemote(db, uid, item));
      return item;
    },
    [buildMistakeRecord, runRemote]
  );

  const addMistakesBatch = useCallback(
    (inputs: NewMistakeInput[]): MistakeItem[] => {
      const now = Date.now();
      const created: MistakeItem[] = [];
      inputs.forEach((inp, idx) => {
        const rec = buildMistakeRecord(inp, now + idx);
        if (rec) created.push(rec);
      });
      if (created.length === 0) return [];
      setMistakes((prev) => sortMistakesForDisplay([...created, ...prev]));
      runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertMistakes: created }));
      return created;
    },
    [buildMistakeRecord, runRemote]
  );

  const updateMistake = useCallback(
    (
      mistakeId: string,
      patch: Partial<
        Pick<
          MistakeItem,
          | 'subjectId'
          | 'chapterId'
          | 'title'
          | 'mistakeText'
          | 'correctionNote'
          | 'mistakeType'
          | 'sourceLabel'
          | 'status'
          | 'repeatCount'
          | 'lastRepeatedAt'
        >
      >
    ) => {
      const existing = mistakesRef.current.find((m) => m.id === mistakeId);
      if (!existing) return;

      const chap = patch.chapterId ? getChapterById(patch.chapterId) : undefined;
      const nextSourceLabel =
        patch.sourceLabel !== undefined
          ? patch.sourceLabel.trim() || undefined
          : existing.sourceLabel;

      const updated: MistakeItem = {
        ...existing,
        ...patch,
        subjectId: chap?.subjectId ?? patch.subjectId ?? existing.subjectId,
        chapterId: chap?.id ?? patch.chapterId ?? existing.chapterId,
        title: patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
        mistakeText:
          patch.mistakeText !== undefined
            ? patch.mistakeText.trim() || existing.mistakeText
            : existing.mistakeText,
        correctionNote:
          patch.correctionNote !== undefined ? patch.correctionNote : existing.correctionNote,
        mistakeType:
          patch.mistakeType !== undefined && isValidMistakeType(patch.mistakeType)
            ? patch.mistakeType
            : existing.mistakeType,
        sourceLabel: nextSourceLabel,
        repeatCount:
          patch.repeatCount !== undefined && Number.isFinite(patch.repeatCount)
            ? Math.max(1, Math.floor(patch.repeatCount))
            : existing.repeatCount,
        updatedAt: Date.now(),
      };

      setMistakes((prev) =>
        sortMistakesForDisplay(prev.map((m) => (m.id === mistakeId ? updated : m)))
      );
      runRemote((db, uid) => upsertMistakeRemote(db, uid, updated));
    },
    [runRemote]
  );

  const toggleMistakeStatus = useCallback(
    (mistakeId: string) => {
      const existing = mistakesRef.current.find((m) => m.id === mistakeId);
      if (!existing) return;
      const nextStatus = existing.status === 'active' ? 'fixed' : 'active';
      updateMistake(mistakeId, { status: nextStatus });
      showToast(
        nextStatus === 'fixed' ? 'Mistake marked fixed' : 'Mistake reopened for review',
        'success'
      );
    },
    [showToast, updateMistake]
  );

  const incrementMistakeRepeat = useCallback(
    (mistakeId: string) => {
      const existing = mistakesRef.current.find((m) => m.id === mistakeId);
      if (!existing) return;
      const nextCount = existing.repeatCount + 1;
      updateMistake(mistakeId, {
        repeatCount: nextCount,
        status: 'active',
        lastRepeatedAt: Date.now(),
      });
      showToast(`Logged repeat (${nextCount}×) — flagged active`, 'info');
    },
    [showToast, updateMistake]
  );

  const deleteMistake = useCallback(
    (mistakeId: string) => {
      setMistakes((prev) => prev.filter((m) => m.id !== mistakeId));
      runRemote((db, uid) => deleteMistakeRemote(db, uid, mistakeId));
    },
    [runRemote]
  );

  const generateChapterSummary = useCallback(
    async (chapterId: string, scope: ChapterSummaryScope): Promise<string> => {
      const chapter = getChapterById(chapterId);
      if (!chapter) throw new Error('NCERT chapter not found.');

      const apiKey = prefsRef.current.geminiApiKey.trim();
      if (!apiKey) {
        throw new Error('Add your Gemini API key in Settings to generate chapter summaries.');
      }

      const key = `${chapterId}:${scope}`;
      setSummarizingChapterKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));

      try {
        const chapterMistakes = mistakesRef.current.filter((m) => m.chapterId === chapterId);
        const chapterDoubts = doubtsRef.current.filter((d) => d.chapterId === chapterId);

        const summary = await summarizeChapterItemsWithGemini({
          apiKey,
          model: prefsRef.current.geminiModel,
          chapter,
          scope,
          mistakes: chapterMistakes,
          doubts: chapterDoubts,
        });

        const now = Date.now();
        const existing = chapterProgressRef.current[chapterId];
        const nextState: ChapterStudyState = {
          ...(existing ?? {}),
          chapterId: chapter.id,
          subjectId: chapter.subjectId,
          coveragePercent: existing?.coveragePercent ?? 0,
          coverageSource: existing?.coverageSource ?? 'ai',
          completedPyqYears: existing?.completedPyqYears ?? [],
          ...(scope === 'mistakes'
            ? {
                mistakesSummaryAi: summary,
                mistakesSummaryUpdatedAt: now,
                mistakesSummaryCount: chapterMistakes.length,
              }
            : {
                doubtsSummaryAi: summary,
                doubtsSummaryUpdatedAt: now,
                doubtsSummaryCount: chapterDoubts.length,
              }),
          updatedAt: now,
        };

        setChapterProgress((prev) => ({ ...prev, [chapter.id]: nextState }));
        runRemote((db, uid) => upsertChapterProgressRemote(db, uid, nextState));
        return summary;
      } finally {
        setSummarizingChapterKeys((prev) => prev.filter((k) => k !== key));
      }
    },
    [runRemote]
  );

  // --- Gemini Brain Dump ---
  const processBrainDump = useCallback(
    async (
      rawText: string,
      dateKey: string = toDateKey(),
      options?: { focusMode?: BrainDumpFocusMode }
    ): Promise<{
      addedCount: number;
      suggestionsCount: number;
      doubtsCount: number;
      mistakesCount: number;
    }> => {
      setIsProcessingDump(true);
      try {
        const openTasks = tasksRef.current
          .filter((t) => !t.completed)
          .map((t) => ({ id: t.id, title: t.title, bucket: t.bucket }));
        const currentSettings = normalizeStudySettings(prefsRef.current.studySettings);

        const analysis = await analyzeBrainDumpWithGemini({
          apiKey: prefsRef.current.geminiApiKey,
          model: prefsRef.current.geminiModel,
          rawText,
          categories: prefsRef.current.categories,
          openTasks,
          dateKey,
          includeArchivedNcert: currentSettings.showArchivedNcert,
          focusMode: options?.focusMode ?? 'all',
        });

        const now = Date.now();
        const rawDumpId = createId('dump');
        const createdLogs: LogEntry[] = analysis.completedActivities.map((item, idx) => ({
          id: createId('log'),
          dateKey,
          title: item.title,
          category: item.category,
          ...(item.subjectId ? { subjectId: item.subjectId } : {}),
          ...(item.chapterId ? { chapterId: item.chapterId } : {}),
          source: 'brain_dump',
          linkedTaskId: item.matchedOpenTaskId,
          rawDumpId,
          createdAt: now + idx,
          updatedAt: now + idx,
        }));

        const createdDoubts: DoubtItem[] = (analysis.doubts ?? []).map((d, idx) => ({
          id: createId('doubt'),
          subjectId: d.subjectId,
          chapterId: d.chapterId,
          title: d.title,
          questionText: d.questionText,
          imageDataUrl: null,
          pyqYear: d.pyqYear,
          status: 'open',
          resolutionNote: '',
          source: 'brain_dump',
          createdAt: now + idx,
          updatedAt: now + idx,
        }));

        const createdMistakes: MistakeItem[] = (analysis.mistakes ?? []).map((m, idx) => ({
          id: createId('mistake'),
          subjectId: m.subjectId,
          chapterId: m.chapterId,
          title: m.title,
          mistakeText: m.mistakeText,
          correctionNote: m.correctionNote,
          mistakeType: m.mistakeType,
          ...(m.sourceLabel ? { sourceLabel: m.sourceLabel } : {}),
          status: 'active',
          repeatCount: 1,
          source: 'brain_dump',
          createdAt: now + idx,
          updatedAt: now + idx,
        }));

        if (createdLogs.length > 0) {
          setLogs((prev) => sortLogsForDisplay([...createdLogs, ...prev]));
        }
        if (createdDoubts.length > 0) {
          setDoubts((prev) => sortDoubtsForDisplay([...createdDoubts, ...prev]));
        }
        if (createdMistakes.length > 0) {
          setMistakes((prev) => sortMistakesForDisplay([...createdMistakes, ...prev]));
        }
        if (createdLogs.length > 0 || createdDoubts.length > 0 || createdMistakes.length > 0) {
          runRemote((db, uid) =>
            syncBatchToRemote(db, uid, {
              upsertLogs: createdLogs.length > 0 ? createdLogs : undefined,
              upsertDoubts: createdDoubts.length > 0 ? createdDoubts : undefined,
              upsertMistakes: createdMistakes.length > 0 ? createdMistakes : undefined,
            })
          );
        }

        // Trigger background holistic chapter coverage refresh for any newly logged Learning chapters
        const touchedChapterIds = new Set<string>();
        for (const entry of createdLogs) {
          if (entry.chapterId && isLearningCategoryName(entry.category)) {
            touchedChapterIds.add(entry.chapterId);
          }
        }
        touchedChapterIds.forEach((chapId) => {
          scheduleChapterEvaluation(chapId, 400);
        });

        const matchedTasks: MatchedOpenTaskItem[] = [];
        const seenMatchedTaskIds = new Set<string>();
        analysis.completedActivities.forEach((act, idx) => {
          if (act.matchedOpenTaskId && !seenMatchedTaskIds.has(act.matchedOpenTaskId)) {
            const matchedTask = tasksRef.current.find(
              (t) => t.id === act.matchedOpenTaskId && !t.completed
            );
            if (matchedTask) {
              seenMatchedTaskIds.add(matchedTask.id);
              matchedTasks.push({
                id: createId('match'),
                taskId: matchedTask.id,
                taskTitle: matchedTask.title,
                activityTitle: act.title,
                category: act.category,
                linkedLogEntryId: createdLogs[idx].id,
              });
            }
          }
        });

        const unfinishedTasks: SuggestedTaskItem[] = analysis.unfinishedTasks.map((u) => ({
          id: createId('sug'),
          title: u.title,
          suggestedBucket: u.suggestedBucket,
          category: u.category,
          ...(u.subjectId ? { subjectId: u.subjectId } : {}),
          ...(u.chapterId ? { chapterId: u.chapterId } : {}),
        }));

        const suggestionsCount = unfinishedTasks.length + matchedTasks.length;
        if (suggestionsCount > 0) {
          setPendingSuggestions({
            dateKey,
            unfinishedTasks,
            matchedTasks,
          });
        }

        const toastParts: string[] = [];
        if (createdLogs.length > 0) {
          toastParts.push(
            `Logged ${createdLogs.length} ${createdLogs.length === 1 ? 'activity' : 'activities'}`
          );
        }
        if (createdMistakes.length > 0) {
          toastParts.push(
            `${toastParts.length === 0 ? 'Saved ' : ''}${createdMistakes.length} ${
              createdMistakes.length === 1 ? 'mistake' : 'mistakes'
            }`
          );
        }
        if (createdDoubts.length > 0) {
          toastParts.push(
            `${toastParts.length === 0 ? 'Saved ' : ''}${createdDoubts.length} ${
              createdDoubts.length === 1 ? 'doubt' : 'doubts'
            }`
          );
        }

        if (toastParts.length > 0) {
          const joined =
            toastParts.length === 1
              ? toastParts[0]
              : `${toastParts.slice(0, -1).join(', ')} & ${toastParts[toastParts.length - 1]}`;
          const suffix =
            createdLogs.length === 0 && (createdMistakes.length > 0 || createdDoubts.length > 0)
              ? ' to Study'
              : '';
          showToast(`${joined}${suffix}`, 'success');
        } else if (suggestionsCount > 0) {
          showToast('Detected follow-up tasks to review', 'info');
        } else {
          showToast(
            options?.focusMode === 'mistakes'
              ? 'No distinct mistakes detected in that note'
              : 'No distinct activities detected in that note',
            'info'
          );
        }

        return {
          addedCount: createdLogs.length,
          suggestionsCount,
          doubtsCount: createdDoubts.length,
          mistakesCount: createdMistakes.length,
        };
      } finally {
        setIsProcessingDump(false);
      }
    },
    [runRemote, scheduleChapterEvaluation, showToast]
  );

  // --- Suggestion Sheet Handlers ---
  const dismissSuggestions = useCallback(() => {
    setPendingSuggestions(null);
  }, []);

  const acceptSuggestedTask = useCallback(
    (suggestionId: string, bucket: TaskBucket) => {
      setPendingSuggestions((prev) => {
        if (!prev) return null;
        const found = prev.unfinishedTasks.find((s) => s.id === suggestionId);
        if (found) {
          addTask(found.title, bucket, found.category, {
            subjectId: found.subjectId,
            chapterId: found.chapterId,
          });
        }
        const remaining = prev.unfinishedTasks.filter((s) => s.id !== suggestionId);
        if (remaining.length === 0 && prev.matchedTasks.length === 0) return null;
        return { ...prev, unfinishedTasks: remaining };
      });
    },
    [addTask]
  );

  const dismissSuggestedTask = useCallback((suggestionId: string) => {
    setPendingSuggestions((prev) => {
      if (!prev) return null;
      const remaining = prev.unfinishedTasks.filter((s) => s.id !== suggestionId);
      if (remaining.length === 0 && prev.matchedTasks.length === 0) return null;
      return { ...prev, unfinishedTasks: remaining };
    });
  }, []);

  const acceptMatchedTask = useCallback(
    (matchId: string) => {
      setPendingSuggestions((prev) => {
        if (!prev) return null;
        const found = prev.matchedTasks.find((m) => m.id === matchId);
        if (found) {
          const { nextTasks, updatedTask } = markTaskCompletedFromMatchedLog(
            tasksRef.current,
            found.taskId,
            found.linkedLogEntryId,
            prev.dateKey
          );
          if (updatedTask) {
            setTasks(sortTasksForDisplay(nextTasks));
            runRemote((db, uid) => upsertTaskRemote(db, uid, updatedTask));
          }
        }
        const remaining = prev.matchedTasks.filter((m) => m.id !== matchId);
        if (remaining.length === 0 && prev.unfinishedTasks.length === 0) return null;
        return { ...prev, matchedTasks: remaining };
      });
    },
    [runRemote]
  );

  const dismissMatchedTask = useCallback((matchId: string) => {
    setPendingSuggestions((prev) => {
      if (!prev) return null;
      const remaining = prev.matchedTasks.filter((m) => m.id !== matchId);
      if (remaining.length === 0 && prev.unfinishedTasks.length === 0) return null;
      return { ...prev, matchedTasks: remaining };
    });
  }, []);

  const acceptAllSuggestions = useCallback(() => {
    if (!pendingSuggestions) return;
    const upsertTasks: TaskItem[] = [];
    let workingTasks = [...tasksRef.current];

    for (const s of pendingSuggestions.unfinishedTasks) {
      const task = createTaskRecord(s.title, s.suggestedBucket, workingTasks, {
        category: s.category,
        subjectId: s.subjectId,
        chapterId: s.chapterId,
        scheduledForDateKey: s.suggestedBucket === 'tomorrow' ? tomorrowKey : undefined,
      });
      workingTasks = [task, ...workingTasks];
      upsertTasks.push(task);
    }

    for (const m of pendingSuggestions.matchedTasks) {
      const { nextTasks, updatedTask } = markTaskCompletedFromMatchedLog(
        workingTasks,
        m.taskId,
        m.linkedLogEntryId,
        pendingSuggestions.dateKey
      );
      if (updatedTask) {
        workingTasks = nextTasks;
        upsertTasks.push(updatedTask);
      }
    }

    setTasks(sortTasksForDisplay(workingTasks));
    if (upsertTasks.length > 0) {
      runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertTasks }));
    }
    setPendingSuggestions(null);
    showToast('Updated your Plan from brain dump', 'success');
  }, [pendingSuggestions, runRemote, showToast, tomorrowKey]);

  // --- Preferences & Categories ---
  const updatePreferences = useCallback(
    (patch: Partial<Pick<UserPreferences, 'geminiApiKey' | 'geminiModel'>>) => {
      const next: UserPreferences = {
        ...prefsRef.current,
        ...patch,
        updatedAt: Date.now(),
      };
      commitPreferences(next);
    },
    [commitPreferences]
  );

  const addCategory = useCallback(
    (name: string, colorToken: CategoryColorToken) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (prefsRef.current.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        showToast('Category already exists', 'error');
        return;
      }
      const next: UserPreferences = {
        ...prefsRef.current,
        categories: [
          ...prefsRef.current.categories,
          { id: createId('cat'), name: trimmed, colorToken },
        ],
        updatedAt: Date.now(),
      };
      commitPreferences(next);
      showToast(`Added category "${trimmed}"`, 'success');
    },
    [commitPreferences, showToast]
  );

  const updateCategory = useCallback(
    (id: string, patch: Partial<Pick<CategoryConfig, 'name' | 'colorToken'>>) => {
      const existing = prefsRef.current.categories.find((c) => c.id === id);
      if (!existing) return;

      const nextName = patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;
      const nextCategories = prefsRef.current.categories.map((c) =>
        c.id === id ? { ...c, ...patch, name: nextName } : c
      );

      commitPreferences({
        ...prefsRef.current,
        categories: nextCategories,
        updatedAt: Date.now(),
      });

      if (nextName !== existing.name) {
        const updatedLogs: LogEntry[] = [];
        setLogs((prev) =>
          prev.map((entry) => {
            if (entry.category === existing.name) {
              const renamed = { ...entry, category: nextName, updatedAt: Date.now() };
              updatedLogs.push(renamed);
              return renamed;
            }
            return entry;
          })
        );
        if (updatedLogs.length > 0) {
          runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertLogs: updatedLogs }));
        }
      }
    },
    [commitPreferences, runRemote]
  );

  const deleteCategory = useCallback(
    (id: string) => {
      if (prefsRef.current.categories.length <= 1) {
        showToast('Keep at least one category', 'error');
        return;
      }
      const nextCategories = prefsRef.current.categories.filter((c) => c.id !== id);
      commitPreferences({
        ...prefsRef.current,
        categories: nextCategories,
        updatedAt: Date.now(),
      });
    },
    [commitPreferences, showToast]
  );

  // --- Backup Import ---
  const importBackupPayload = useCallback(
    (payload: StrikeExportPayload) => {
      const mergedTasksMap = new Map<string, TaskItem>();
      for (const t of tasksRef.current) mergedTasksMap.set(t.id, t);
      for (const t of payload.tasks) mergedTasksMap.set(t.id, t);

      const mergedLogsMap = new Map<string, LogEntry>();
      for (const l of logsRef.current) mergedLogsMap.set(l.id, l);
      for (const l of payload.logs) mergedLogsMap.set(l.id, l);

      const mergedProgress: Record<string, ChapterStudyState> = {
        ...chapterProgressRef.current,
        ...(payload.chapterProgress ?? {}),
      };

      const mergedDoubtsMap = new Map<string, DoubtItem>();
      for (const d of doubtsRef.current) mergedDoubtsMap.set(d.id, d);
      for (const d of payload.doubts ?? []) {
        mergedDoubtsMap.set(d.id, d);
        if (d.imageDataUrl) {
          void saveDoubtImageLocal(d.id, d.imageDataUrl);
        }
      }

      const mergedMistakesMap = new Map<string, MistakeItem>();
      for (const m of mistakesRef.current) mergedMistakesMap.set(m.id, m);
      for (const m of payload.mistakes ?? []) {
        mergedMistakesMap.set(m.id, m);
      }

      const nextTasks = sortTasksForDisplay(Array.from(mergedTasksMap.values()));
      const nextLogs = sortLogsForDisplay(Array.from(mergedLogsMap.values()));
      const nextDoubts = sortDoubtsForDisplay(Array.from(mergedDoubtsMap.values()));
      const nextMistakes = sortMistakesForDisplay(Array.from(mergedMistakesMap.values()));
      const nextPrefs: UserPreferences = {
        ...prefsRef.current,
        categories: payload.categories.length > 0 ? payload.categories : prefsRef.current.categories,
        studySettings: payload.studySettings
          ? normalizeStudySettings(payload.studySettings)
          : prefsRef.current.studySettings,
        updatedAt: Date.now(),
      };

      setTasks(nextTasks);
      setLogs(nextLogs);
      setChapterProgress(mergedProgress);
      setDoubts(nextDoubts);
      setMistakes(nextMistakes);
      setPreferences(nextPrefs);

      const importedProgressList = Object.values(payload.chapterProgress ?? {});
      const importedDoubtsList = payload.doubts ?? [];
      const importedMistakesList = payload.mistakes ?? [];

      runRemote((db, uid) =>
        syncBatchToRemote(db, uid, {
          upsertTasks: payload.tasks,
          upsertLogs: payload.logs,
          upsertChapterProgress: importedProgressList.length > 0 ? importedProgressList : undefined,
          upsertDoubts: importedDoubtsList.length > 0 ? importedDoubtsList : undefined,
          upsertMistakes: importedMistakesList.length > 0 ? importedMistakesList : undefined,
          preferences: nextPrefs,
        })
      );

      const extraSummary: string[] = [];
      if (importedDoubtsList.length > 0) extraSummary.push(`${importedDoubtsList.length} doubts`);
      if (importedMistakesList.length > 0)
        extraSummary.push(`${importedMistakesList.length} mistakes`);

      showToast(
        `Imported ${payload.tasks.length} tasks, ${payload.logs.length} logs${
          extraSummary.length > 0 ? ` & ${extraSummary.join(', ')}` : ''
        }`,
        'success'
      );
    },
    [runRemote, showToast]
  );

  // --- Firebase Configuration & Auth ---
  const configureFirebase = useCallback(
    async (config: FirebaseWebConfig) => {
      const handles = await reinitializeFirebaseWithConfig(config);
      setFbHandles(handles);
      setSyncError(null);
      setSyncStatus('signed-out');
      showToast('Firebase connected — sign in to sync across devices', 'success');
    },
    [showToast]
  );

  const disconnectFirebaseConfig = useCallback(async () => {
    await clearLocalFirebaseConfig();
    setFbHandles(initFirebaseIfConfigured());
    setUser(null);
    setSyncError(null);
    setSyncStatus('local-only');
    showToast('Switched to local-only storage', 'info');
  }, [showToast]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!fbHandles) throw new Error('Connect a Firebase project first.');
      await signInWithEmail(fbHandles.auth, email, password);
      showToast('Signed in to Strike Cloud', 'success');
    },
    [fbHandles, showToast]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!fbHandles) throw new Error('Connect a Firebase project first.');
      await signUpWithEmail(fbHandles.auth, email, password);
      showToast('Account created & cloud sync enabled', 'success');
    },
    [fbHandles, showToast]
  );

  const saveGoogleClientId = useCallback(
    (clientId: string) => {
      saveLocalGoogleClientId(clientId);
      setGoogleClientIdState(resolveGoogleClientId());
      showToast('Google Web Client ID saved — mobile sign-in ready', 'success');
    },
    [showToast]
  );

  const clearGoogleClientId = useCallback(() => {
    clearLocalGoogleClientId();
    setGoogleClientIdState(resolveGoogleClientId());
    showToast('Cleared local Google Web Client ID', 'info');
  }, [showToast]);

  const loginWithGoogle = useCallback(async () => {
    if (!fbHandles) throw new Error('Connect a Firebase project first.');
    if (googleClientIdState.clientId) {
      beginDirectGoogleSignIn(googleClientIdState.clientId);
      return;
    }
    await signInWithGooglePopup(fbHandles.auth);
    showToast('Signed in with Google', 'success');
  }, [fbHandles, googleClientIdState.clientId, showToast]);

  const logout = useCallback(async () => {
    if (!fbHandles) return;
    await signOutFirebase(fbHandles.auth);
    showToast('Signed out', 'info');
  }, [fbHandles, showToast]);

  const value = useMemo<StrikeContextValue>(
    () => ({
      todayKey,
      tomorrowKey,
      tasks,
      logs,
      preferences,
      studySettings,
      chapterProgress,
      doubts,
      mistakes,
      evaluatingChapterIds,
      summarizingChapterKeys,
      pendingSuggestions,
      dismissSuggestions,
      addTask,
      updateTask,
      toggleTaskCompletion,
      moveTaskBucket,
      promoteAllTomorrowToToday,
      deferAllTodayToTomorrow,
      deleteTask,
      addManualLog,
      updateLog,
      deleteLog,
      processBrainDump,
      isProcessingDump,
      updateStudySettings,
      toggleChapterPyqYear,
      setChapterPyqYears,
      setManualChapterCoverage,
      refreshChapterCoverageWithAi,
      assignItemChapter,
      addDoubt,
      updateDoubt,
      toggleDoubtStatus,
      deleteDoubt,
      explainDoubt,
      addMistake,
      addMistakesBatch,
      updateMistake,
      toggleMistakeStatus,
      incrementMistakeRepeat,
      deleteMistake,
      generateChapterSummary,
      acceptSuggestedTask,
      dismissSuggestedTask,
      acceptMatchedTask,
      dismissMatchedTask,
      acceptAllSuggestions,
      updatePreferences,
      addCategory,
      updateCategory,
      deleteCategory,
      importBackupPayload,
      firebaseConfigured: Boolean(fbHandles),
      firebaseConfigSource: fbHandles?.configSource ?? null,
      googleClientId: googleClientIdState.clientId,
      googleClientIdSource: googleClientIdState.source,
      saveGoogleClientId,
      clearGoogleClientId,
      user,
      syncStatus,
      syncError,
      configureFirebase,
      disconnectFirebaseConfig,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      logout,
      toast,
      showToast,
    }),
    [
      todayKey,
      tomorrowKey,
      tasks,
      logs,
      preferences,
      studySettings,
      chapterProgress,
      doubts,
      mistakes,
      evaluatingChapterIds,
      summarizingChapterKeys,
      pendingSuggestions,
      dismissSuggestions,
      addTask,
      updateTask,
      toggleTaskCompletion,
      moveTaskBucket,
      promoteAllTomorrowToToday,
      deferAllTodayToTomorrow,
      deleteTask,
      addManualLog,
      updateLog,
      deleteLog,
      processBrainDump,
      isProcessingDump,
      updateStudySettings,
      toggleChapterPyqYear,
      setChapterPyqYears,
      setManualChapterCoverage,
      refreshChapterCoverageWithAi,
      assignItemChapter,
      addDoubt,
      updateDoubt,
      toggleDoubtStatus,
      deleteDoubt,
      explainDoubt,
      addMistake,
      addMistakesBatch,
      updateMistake,
      toggleMistakeStatus,
      incrementMistakeRepeat,
      deleteMistake,
      generateChapterSummary,
      acceptSuggestedTask,
      dismissSuggestedTask,
      acceptMatchedTask,
      dismissMatchedTask,
      acceptAllSuggestions,
      updatePreferences,
      addCategory,
      updateCategory,
      deleteCategory,
      importBackupPayload,
      fbHandles,
      googleClientIdState,
      saveGoogleClientId,
      clearGoogleClientId,
      user,
      syncStatus,
      syncError,
      configureFirebase,
      disconnectFirebaseConfig,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      logout,
      toast,
      showToast,
    ]
  );

  return <StrikeContext.Provider value={value}>{children}</StrikeContext.Provider>;
};

export function useStrike(): StrikeContextValue {
  const ctx = useContext(StrikeContext);
  if (!ctx) {
    throw new Error('useStrike must be used within StrikeProvider');
  }
  return ctx;
}
