import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CategoryColorToken,
  CategoryConfig,
  DEFAULT_CATEGORIES,
  DEFAULT_GEMINI_MODEL,
  FirebaseWebConfig,
  LogEntry,
  MatchedOpenTaskItem,
  PendingSuggestions,
  StrikeExportPayload,
  SuggestedTaskItem,
  TaskBucket,
  TaskItem,
  UserPreferences,
} from '../types/models';
import {
  createTaskRecord,
  markTaskCompletedFromMatchedLog,
  moveTaskBucketLogic,
  sortLogsForDisplay,
  sortTasksForDisplay,
  toggleTaskCompletionLogic,
} from './taskLogLogic';
import { analyzeBrainDumpWithGemini } from '../services/gemini';
import {
  FirebaseHandles,
  clearLocalFirebaseConfig,
  deleteLogRemote,
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
  subscribeUserLogs,
  subscribeUserPreferences,
  subscribeUserTasks,
  syncBatchToRemote,
  upsertLogRemote,
  upsertTaskRemote,
} from '../services/firebase';
import {
  beginDirectGoogleSignIn,
  clearLocalGoogleClientId,
  consumeGoogleOAuthHashCallback,
  resolveGoogleClientId,
  saveLocalGoogleClientId,
} from '../services/googleAuth';
import { createId, toDateKey } from '../utils/date';

const STORAGE_KEYS = {
  tasks: 'strike.tasks.v1',
  logs: 'strike.logs.v1',
  prefs: 'strike.prefs.v1',
} as const;

export type SyncStatus = 'local-only' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface StrikeContextValue {
  tasks: TaskItem[];
  logs: LogEntry[];
  preferences: UserPreferences;
  pendingSuggestions: PendingSuggestions | null;
  dismissSuggestions: () => void;

  // Task actions
  addTask: (title: string, bucket: TaskBucket, category?: string) => TaskItem | null;
  updateTask: (taskId: string, patch: Partial<Pick<TaskItem, 'title' | 'bucket' | 'category'>>) => void;
  toggleTaskCompletion: (taskId: string) => void;
  moveTaskBucket: (taskId: string, bucket: TaskBucket) => void;
  deleteTask: (taskId: string) => void;

  // Daily log & Gemini actions
  addManualLog: (title: string, category: string, dateKey?: string) => LogEntry | null;
  updateLog: (logId: string, patch: Partial<Pick<LogEntry, 'title' | 'category' | 'dateKey'>>) => void;
  deleteLog: (logId: string) => void;
  processBrainDump: (rawText: string, dateKey?: string) => Promise<{ addedCount: number; suggestionsCount: number }>;
  isProcessingDump: boolean;

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

function getInitialPreferences(): UserPreferences {
  const stored = loadLocalJson<Partial<UserPreferences>>(STORAGE_KEYS.prefs, {});
  return {
    geminiApiKey: typeof stored.geminiApiKey === 'string' ? stored.geminiApiKey : '',
    geminiModel:
      typeof stored.geminiModel === 'string' && stored.geminiModel.trim()
        ? stored.geminiModel
        : DEFAULT_GEMINI_MODEL,
    categories:
      Array.isArray(stored.categories) && stored.categories.length > 0
        ? stored.categories
        : DEFAULT_CATEGORIES,
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
  };
}

export const StrikeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    sortTasksForDisplay(loadLocalJson<TaskItem[]>(STORAGE_KEYS.tasks, []))
  );
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    sortLogsForDisplay(loadLocalJson<LogEntry[]>(STORAGE_KEYS.logs, []))
  );
  const [preferences, setPreferences] = useState<UserPreferences>(getInitialPreferences);
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
  const tasksRef = useRef(tasks);
  const logsRef = useRef(logs);
  const prefsRef = useRef(preferences);
  const hydratedUidRef = useRef<string | null>(null);

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

    const unsubPrefs = subscribeUserPreferences(
      fbHandles.db,
      uid,
      (remotePrefs) => {
        if (remotePrefs) {
          setPreferences({
            geminiApiKey: remotePrefs.geminiApiKey ?? '',
            geminiModel: remotePrefs.geminiModel || DEFAULT_GEMINI_MODEL,
            categories:
              Array.isArray(remotePrefs.categories) && remotePrefs.categories.length > 0
                ? remotePrefs.categories
                : DEFAULT_CATEGORIES,
            updatedAt: remotePrefs.updatedAt || Date.now(),
          });
        } else if (prefsRef.current.geminiApiKey || prefsRef.current.updatedAt > 0) {
          // Seed cloud preferences from local settings on first sign-in
          void savePreferencesRemote(fbHandles.db, uid, prefsRef.current).catch(handleErr);
        }
        hydratedUidRef.current = uid;
      },
      handleErr
    );

    return () => {
      unsubTasks();
      unsubLogs();
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

  // --- Task Actions ---
  const addTask = useCallback(
    (title: string, bucket: TaskBucket, category?: string): TaskItem | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const task = createTaskRecord(trimmed, bucket, tasksRef.current, { category });
      setTasks((prev) => sortTasksForDisplay([task, ...prev]));
      runRemote((db, uid) => upsertTaskRemote(db, uid, task));
      return task;
    },
    [runRemote]
  );

  const updateTask = useCallback(
    (taskId: string, patch: Partial<Pick<TaskItem, 'title' | 'bucket' | 'category'>>) => {
      const existing = tasksRef.current.find((t) => t.id === taskId);
      if (!existing) return;

      const updated: TaskItem = {
        ...existing,
        ...patch,
        title: patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
        updatedAt: Date.now(),
      };

      setTasks((prev) => sortTasksForDisplay(prev.map((t) => (t.id === taskId ? updated : t))));
      runRemote((db, uid) => upsertTaskRemote(db, uid, updated));
    },
    [runRemote]
  );

  const toggleTaskCompletion = useCallback(
    (taskId: string) => {
      const result = toggleTaskCompletionLogic(
        { tasks: tasksRef.current, logs: logsRef.current },
        taskId,
        prefsRef.current.categories
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
      }
    },
    [runRemote, showToast]
  );

  const moveTaskBucket = useCallback(
    (taskId: string, bucket: TaskBucket) => {
      const { nextTasks, updatedTask } = moveTaskBucketLogic(tasksRef.current, taskId, bucket);
      if (!updatedTask) return;
      setTasks(sortTasksForDisplay(nextTasks));
      runRemote((db, uid) => upsertTaskRemote(db, uid, updatedTask));
    },
    [runRemote]
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      runRemote((db, uid) => deleteTaskRemote(db, uid, taskId));
    },
    [runRemote]
  );

  // --- Log Actions ---
  const addManualLog = useCallback(
    (title: string, category: string, dateKey: string = toDateKey()): LogEntry | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const now = Date.now();
      const entry: LogEntry = {
        id: createId('log'),
        dateKey,
        title: trimmed,
        category: category || prefsRef.current.categories[0]?.name || 'Personal',
        source: 'manual',
        linkedTaskId: null,
        createdAt: now,
        updatedAt: now,
      };

      setLogs((prev) => sortLogsForDisplay([entry, ...prev]));
      runRemote((db, uid) => upsertLogRemote(db, uid, entry));
      return entry;
    },
    [runRemote]
  );

  const updateLog = useCallback(
    (logId: string, patch: Partial<Pick<LogEntry, 'title' | 'category' | 'dateKey'>>) => {
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
    },
    [runRemote]
  );

  const deleteLog = useCallback(
    (logId: string) => {
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      runRemote((db, uid) => deleteLogRemote(db, uid, logId));
    },
    [runRemote]
  );

  // --- Gemini Brain Dump ---
  const processBrainDump = useCallback(
    async (
      rawText: string,
      dateKey: string = toDateKey()
    ): Promise<{ addedCount: number; suggestionsCount: number }> => {
      setIsProcessingDump(true);
      try {
        const openTasks = tasksRef.current
          .filter((t) => !t.completed)
          .map((t) => ({ id: t.id, title: t.title, bucket: t.bucket }));

        const analysis = await analyzeBrainDumpWithGemini({
          apiKey: prefsRef.current.geminiApiKey,
          model: prefsRef.current.geminiModel,
          rawText,
          categories: prefsRef.current.categories,
          openTasks,
          dateKey,
        });

        const now = Date.now();
        const rawDumpId = createId('dump');
        const createdLogs: LogEntry[] = analysis.completedActivities.map((item, idx) => ({
          id: createId('log'),
          dateKey,
          title: item.title,
          category: item.category,
          source: 'brain_dump',
          linkedTaskId: item.matchedOpenTaskId,
          rawDumpId,
          createdAt: now + idx,
          updatedAt: now + idx,
        }));

        if (createdLogs.length > 0) {
          setLogs((prev) => sortLogsForDisplay([...createdLogs, ...prev]));
          runRemote((db, uid) => syncBatchToRemote(db, uid, { upsertLogs: createdLogs }));
        }

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
        }));

        const suggestionsCount = unfinishedTasks.length + matchedTasks.length;
        if (suggestionsCount > 0) {
          setPendingSuggestions({
            dateKey,
            unfinishedTasks,
            matchedTasks,
          });
        }

        if (createdLogs.length > 0) {
          showToast(
            `Logged ${createdLogs.length} ${createdLogs.length === 1 ? 'activity' : 'activities'}`,
            'success'
          );
        } else if (suggestionsCount > 0) {
          showToast('Detected follow-up tasks to review', 'info');
        } else {
          showToast('No distinct activities detected in that note', 'info');
        }

        return { addedCount: createdLogs.length, suggestionsCount };
      } finally {
        setIsProcessingDump(false);
      }
    },
    [runRemote, showToast]
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
          addTask(found.title, bucket, found.category);
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
  }, [pendingSuggestions, runRemote, showToast]);

  // --- Preferences & Categories ---
  const commitPreferences = useCallback(
    (next: UserPreferences) => {
      setPreferences(next);
      runRemote((db, uid) => savePreferencesRemote(db, uid, next));
    },
    [runRemote]
  );

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

      // Rename existing logs using this category so history stays consistent
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

      const nextTasks = sortTasksForDisplay(Array.from(mergedTasksMap.values()));
      const nextLogs = sortLogsForDisplay(Array.from(mergedLogsMap.values()));
      const nextPrefs: UserPreferences = {
        ...prefsRef.current,
        categories: payload.categories.length > 0 ? payload.categories : prefsRef.current.categories,
        updatedAt: Date.now(),
      };

      setTasks(nextTasks);
      setLogs(nextLogs);
      setPreferences(nextPrefs);

      runRemote((db, uid) =>
        syncBatchToRemote(db, uid, {
          upsertTasks: payload.tasks,
          upsertLogs: payload.logs,
          preferences: nextPrefs,
        })
      );

      showToast(
        `Imported ${payload.tasks.length} tasks & ${payload.logs.length} log entries`,
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
      tasks,
      logs,
      preferences,
      pendingSuggestions,
      dismissSuggestions,
      addTask,
      updateTask,
      toggleTaskCompletion,
      moveTaskBucket,
      deleteTask,
      addManualLog,
      updateLog,
      deleteLog,
      processBrainDump,
      isProcessingDump,
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
      tasks,
      logs,
      preferences,
      pendingSuggestions,
      dismissSuggestions,
      addTask,
      updateTask,
      toggleTaskCompletion,
      moveTaskBucket,
      deleteTask,
      addManualLog,
      updateLog,
      deleteLog,
      processBrainDump,
      isProcessingDump,
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
