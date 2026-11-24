import { FirebaseApp, deleteApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ChapterStudyState,
  DoubtItem,
  FirebaseWebConfig,
  LogEntry,
  TaskItem,
  UserPreferences,
} from '../types/models';

const LOCAL_FIREBASE_CONFIG_KEY = 'strike.firebaseConfig.v1';

export const FIRESTORE_SECURITY_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  configSource: 'env' | 'local';
}

let activeHandles: FirebaseHandles | null = null;

export function getEnvFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    appId,
  };
}

export function getStoredFirebaseConfig(): FirebaseWebConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_FIREBASE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirebaseWebConfig>;
    if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
      return null;
    }
    return {
      apiKey: parsed.apiKey.trim(),
      authDomain: parsed.authDomain.trim(),
      projectId: parsed.projectId.trim(),
      storageBucket: parsed.storageBucket?.trim(),
      messagingSenderId: parsed.messagingSenderId?.trim(),
      appId: parsed.appId.trim(),
    };
  } catch {
    return null;
  }
}

export function parseFirebaseConfigInput(input: string): FirebaseWebConfig {
  const trimmed = input.trim();
  // Support both strict JSON and JS object snippet copied from Firebase Console
  const normalized = trimmed
    .replace(/^const\s+firebaseConfig\s*=\s*/i, '')
    .replace(/;\s*$/, '')
    .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,\s*}/g, '}');

  const parsed = JSON.parse(normalized) as Partial<FirebaseWebConfig>;
  if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
    throw new Error('Config must include apiKey, authDomain, projectId, and appId.');
  }

  return {
    apiKey: String(parsed.apiKey).trim(),
    authDomain: String(parsed.authDomain).trim(),
    projectId: String(parsed.projectId).trim(),
    storageBucket: parsed.storageBucket ? String(parsed.storageBucket).trim() : undefined,
    messagingSenderId: parsed.messagingSenderId ? String(parsed.messagingSenderId).trim() : undefined,
    appId: String(parsed.appId).trim(),
  };
}

export function saveLocalFirebaseConfig(config: FirebaseWebConfig): void {
  localStorage.setItem(LOCAL_FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export async function clearLocalFirebaseConfig(): Promise<void> {
  localStorage.removeItem(LOCAL_FIREBASE_CONFIG_KEY);
  if (activeHandles) {
    await deleteApp(activeHandles.app).catch(() => {});
    activeHandles = null;
  }
}

export function resolveActiveFirebaseConfig(): {
  config: FirebaseWebConfig;
  source: 'env' | 'local';
} | null {
  const envCfg = getEnvFirebaseConfig();
  if (envCfg) return { config: envCfg, source: 'env' };
  const localCfg = getStoredFirebaseConfig();
  if (localCfg) return { config: localCfg, source: 'local' };
  return null;
}

export function initFirebaseIfConfigured(): FirebaseHandles | null {
  if (activeHandles) return activeHandles;

  const resolved = resolveActiveFirebaseConfig();
  if (!resolved) return null;

  const existing = getApps()[0];
  const app = existing ?? initializeApp(resolved.config);
  const auth = getAuth(app);

  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }

  activeHandles = { app, auth, db, configSource: resolved.source };
  return activeHandles;
}

export async function reinitializeFirebaseWithConfig(
  config: FirebaseWebConfig
): Promise<FirebaseHandles> {
  saveLocalFirebaseConfig(config);
  if (activeHandles) {
    await deleteApp(activeHandles.app).catch(() => {});
    activeHandles = null;
  }
  const handles = initFirebaseIfConfigured();
  if (!handles) {
    throw new Error('Could not initialize Firebase with provided config.');
  }
  return handles;
}

export function subscribeToAuth(
  auth: Auth,
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function signUpWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function signInWithGooglePopup(auth: Auth): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithGoogleIdToken(auth: Auth, idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signOutFirebase(auth: Auth): Promise<void> {
  await signOut(auth);
}

// Firestore document & collection sync helpers
export function subscribeUserTasks(
  db: Firestore,
  uid: string,
  onData: (tasks: TaskItem[]) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'tasks'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as TaskItem);
      onData(items);
    },
    (err) => onError(err)
  );
}

export function subscribeUserLogs(
  db: Firestore,
  uid: string,
  onData: (logs: LogEntry[]) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'logs'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as LogEntry);
      onData(items);
    },
    (err) => onError(err)
  );
}

export function subscribeUserPreferences(
  db: Firestore,
  uid: string,
  onData: (prefs: UserPreferences | null) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'settings', 'preferences'),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserPreferences) : null);
    },
    (err) => onError(err)
  );
}

export function subscribeUserChapterProgress(
  db: Firestore,
  uid: string,
  onData: (progress: Record<string, ChapterStudyState>) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'chapterProgress'),
    (snap) => {
      const map: Record<string, ChapterStudyState> = {};
      for (const d of snap.docs) {
        const item = d.data() as ChapterStudyState;
        if (item && typeof item.chapterId === 'string') {
          map[item.chapterId] = item;
        }
      }
      onData(map);
    },
    (err) => onError(err)
  );
}

export function subscribeUserDoubts(
  db: Firestore,
  uid: string,
  onData: (doubts: DoubtItem[]) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'doubts'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as DoubtItem);
      onData(items);
    },
    (err) => onError(err)
  );
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

export async function upsertTaskRemote(db: Firestore, uid: string, task: TaskItem): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'tasks', task.id), stripUndefined({ ...task }));
}

export async function deleteTaskRemote(db: Firestore, uid: string, taskId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
}

export async function upsertLogRemote(db: Firestore, uid: string, entry: LogEntry): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'logs', entry.id), stripUndefined({ ...entry }));
}

export async function deleteLogRemote(db: Firestore, uid: string, logId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'logs', logId));
}

export async function upsertChapterProgressRemote(
  db: Firestore,
  uid: string,
  progress: ChapterStudyState
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'chapterProgress', progress.chapterId),
    stripUndefined({ ...progress })
  );
}

export async function upsertDoubtRemote(
  db: Firestore,
  uid: string,
  doubt: DoubtItem
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'doubts', doubt.id), stripUndefined({ ...doubt }));
}

export async function deleteDoubtRemote(
  db: Firestore,
  uid: string,
  doubtId: string
): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'doubts', doubtId));
}

export async function savePreferencesRemote(
  db: Firestore,
  uid: string,
  prefs: UserPreferences
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'settings', 'preferences'), stripUndefined({ ...prefs }));
}

export async function syncBatchToRemote(
  db: Firestore,
  uid: string,
  payload: {
    upsertTasks?: TaskItem[];
    deleteTaskIds?: string[];
    upsertLogs?: LogEntry[];
    deleteLogIds?: string[];
    upsertChapterProgress?: ChapterStudyState[];
    upsertDoubts?: DoubtItem[];
    deleteDoubtIds?: string[];
    preferences?: UserPreferences;
  }
): Promise<void> {
  const batch = writeBatch(db);

  for (const task of payload.upsertTasks ?? []) {
    batch.set(doc(db, 'users', uid, 'tasks', task.id), stripUndefined({ ...task }));
  }
  for (const taskId of payload.deleteTaskIds ?? []) {
    batch.delete(doc(db, 'users', uid, 'tasks', taskId));
  }
  for (const entry of payload.upsertLogs ?? []) {
    batch.set(doc(db, 'users', uid, 'logs', entry.id), stripUndefined({ ...entry }));
  }
  for (const logId of payload.deleteLogIds ?? []) {
    batch.delete(doc(db, 'users', uid, 'logs', logId));
  }
  for (const progress of payload.upsertChapterProgress ?? []) {
    batch.set(
      doc(db, 'users', uid, 'chapterProgress', progress.chapterId),
      stripUndefined({ ...progress })
    );
  }
  for (const doubt of payload.upsertDoubts ?? []) {
    batch.set(doc(db, 'users', uid, 'doubts', doubt.id), stripUndefined({ ...doubt }));
  }
  for (const doubtId of payload.deleteDoubtIds ?? []) {
    batch.delete(doc(db, 'users', uid, 'doubts', doubtId));
  }
  if (payload.preferences) {
    batch.set(
      doc(db, 'users', uid, 'settings', 'preferences'),
      stripUndefined({ ...payload.preferences })
    );
  }

  await batch.commit();
}
