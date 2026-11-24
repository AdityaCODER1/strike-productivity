import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStrike } from '../state/StrikeContext';
import {
  CategoryColorToken,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_PRESETS,
} from '../types/models';
import {
  FIRESTORE_SECURITY_RULES_SNIPPET,
  parseFirebaseConfigInput,
} from '../services/firebase';
import { testGeminiConnection } from '../services/gemini';
import {
  parseImportJson,
  serializeToJson,
  serializeToMarkdown,
  triggerFileDownload,
} from '../services/exporter';
import { toDateKey } from '../utils/date';

const COLOR_TOKENS: CategoryColorToken[] = [
  'blue',
  'green',
  'amber',
  'teal',
  'coral',
  'cyan',
  'slate',
];

const PRESET_IDS = new Set<string>(GEMINI_MODEL_PRESETS.map((p) => p.id));

export const SettingsView: React.FC = () => {
  const {
    tasks,
    logs,
    preferences,
    updatePreferences,
    addCategory,
    updateCategory,
    deleteCategory,
    importBackupPayload,
    firebaseConfigured,
    firebaseConfigSource,
    user,
    syncStatus,
    syncError,
    configureFirebase,
    disconnectFirebaseConfig,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
    showToast,
  } = useStrike();

  // Gemini controls
  const [apiKeyDraft, setApiKeyDraft] = useState(preferences.geminiApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const isPresetModel = PRESET_IDS.has(preferences.geminiModel);
  const [modelSelectValue, setModelSelectValue] = useState<string>(
    isPresetModel ? preferences.geminiModel : 'custom'
  );
  const [customModelDraft, setCustomModelDraft] = useState<string>(
    isPresetModel ? '' : preferences.geminiModel
  );
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Firebase config & auth controls
  const [fbConfigInput, setFbConfigInput] = useState('');
  const [showFbSetup, setShowFbSetup] = useState(!firebaseConfigured);
  const [showRules, setShowRules] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Category editor
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<CategoryColorToken>('blue');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep API key draft synchronized if cloud prefs hydrate
  React.useEffect(() => {
    setApiKeyDraft(preferences.geminiApiKey);
  }, [preferences.geminiApiKey]);

  React.useEffect(() => {
    if (PRESET_IDS.has(preferences.geminiModel)) {
      setModelSelectValue(preferences.geminiModel);
    } else {
      setModelSelectValue('custom');
      setCustomModelDraft(preferences.geminiModel);
    }
  }, [preferences.geminiModel]);

  const syncLabel = useMemo(() => {
    switch (syncStatus) {
      case 'synced':
        return 'Cloud Synced';
      case 'syncing':
        return 'Syncing…';
      case 'offline':
        return 'Offline (Cached)';
      case 'signed-out':
        return 'Sign In to Sync';
      case 'error':
        return 'Sync Error';
      default:
        return 'Local-Only Mode';
    }
  }, [syncStatus]);

  const handleSaveGemini = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedModel =
      modelSelectValue === 'custom'
        ? customModelDraft.trim() || DEFAULT_GEMINI_MODEL
        : modelSelectValue;

    updatePreferences({
      geminiApiKey: apiKeyDraft.trim(),
      geminiModel: resolvedModel,
    });
    setGeminiTestResult(null);
    showToast(
      user ? 'Gemini settings saved & synced to your account' : 'Gemini settings saved locally',
      'success'
    );
  };

  const handleTestGemini = async () => {
    const resolvedModel =
      modelSelectValue === 'custom'
        ? customModelDraft.trim() || DEFAULT_GEMINI_MODEL
        : modelSelectValue;

    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const msg = await testGeminiConnection(apiKeyDraft, resolvedModel);
      setGeminiTestResult({ ok: true, message: msg });
    } catch (err) {
      setGeminiTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleSaveFirebaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const parsed = parseFirebaseConfigInput(fbConfigInput);
      await configureFirebase(parsed);
      setFbConfigInput('');
      setShowFbSetup(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid Firebase configuration.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (authMode === 'signin') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_SECURITY_RULES_SNIPPET);
      showToast('Copied Firestore security rules', 'success');
    } catch {
      showToast('Select and copy the rules snippet manually', 'info');
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    addCategory(newCategoryName, newCategoryColor);
    setNewCategoryName('');
  };

  const handleExportMarkdown = () => {
    const md = serializeToMarkdown(tasks, logs);
    triggerFileDownload(`strike-export-${toDateKey()}.md`, md, 'text/markdown;charset=utf-8');
    showToast('Exported Markdown journal', 'success');
  };

  const handleExportJson = () => {
    const json = serializeToJson(tasks, logs, preferences.categories);
    triggerFileDownload(`strike-backup-${toDateKey()}.json`, json, 'application/json');
    showToast('Exported JSON backup', 'success');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseImportJson(text);
      importBackupPayload(payload);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not import JSON file', 'error');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          <span className="page-kicker">Strike v1 · Preferences</span>
          <h1 className="page-title">Settings</h1>
        </div>
        <div className="header-pill">
          <span
            className={`status-dot ${
              syncStatus === 'synced'
                ? 'status-dot--synced'
                : syncStatus === 'syncing'
                ? 'status-dot--syncing'
                : syncStatus === 'offline'
                ? 'status-dot--offline'
                : syncStatus === 'error'
                ? 'status-dot--error'
                : ''
            }`}
          />
          <span>{syncLabel}</span>
        </div>
      </header>

      {/* 1. Gemini AI Settings */}
      <section className="ios-card" aria-labelledby="settings-gemini-heading">
        <div className="row-between">
          <h2 id="settings-gemini-heading" className="ios-group-title row-gap">
            <Sparkles size={14} />
            Gemini API
          </h2>
          <span className="log-meta-note">{user ? 'Synced in private doc' : 'Local storage'}</span>
        </div>

        <form className="stack-md" onSubmit={handleSaveGemini}>
          <div className="field-label">
            <label htmlFor="settings-gemini-key">API Key</label>
            <div className="row-gap">
              <input
                id="settings-gemini-key"
                type={showApiKey ? 'text' : 'password'}
                className="ios-input"
                placeholder="AIza…"
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn--secondary"
                style={{ minWidth: 44, padding: '0 12px' }}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowApiKey((v) => !v)}
              >
                {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <span className="field-hint">
              Stored in your UID-locked Firestore profile when signed in so Gemini works on every
              device automatically.
            </span>
          </div>

          <label className="field-label">
            Model
            <select
              id="settings-gemini-model"
              className="ios-select"
              value={modelSelectValue}
              onChange={(e) => {
                const val = e.target.value;
                setModelSelectValue(val);
                if (val !== 'custom') {
                  updatePreferences({ geminiModel: val });
                }
              }}
            >
              {GEMINI_MODEL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom Model…</option>
            </select>
          </label>

          {modelSelectValue === 'custom' && (
            <label className="field-label">
              Custom Model ID
              <input
                id="settings-gemini-custom-model"
                type="text"
                className="ios-input"
                placeholder="e.g. gemini-4-hydrogen"
                value={customModelDraft}
                onChange={(e) => setCustomModelDraft(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}

          {geminiTestResult && (
            <div
              className={`ios-banner ${
                geminiTestResult.ok ? 'ios-banner--success' : 'ios-banner--error'
              }`}
            >
              <span>{geminiTestResult.message}</span>
            </div>
          )}

          <div className="row-gap">
            <button id="settings-save-gemini" type="submit" className="btn btn--primary btn--full">
              <Check size={17} />
              Save Gemini Settings
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!apiKeyDraft.trim() || isTestingGemini}
              onClick={handleTestGemini}
            >
              {isTestingGemini ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
              Test
            </button>
          </div>
        </form>
      </section>

      {/* 2. Firebase Cloud Sync & Login */}
      <section className="ios-card" aria-labelledby="settings-cloud-heading">
        <div className="row-between">
          <h2 id="settings-cloud-heading" className="ios-group-title row-gap">
            {firebaseConfigured ? <Cloud size={14} /> : <CloudOff size={14} />}
            Cloud Sync (Firebase)
          </h2>
          {firebaseConfigured && firebaseConfigSource === 'local' && (
            <button
              type="button"
              className="log-meta-note"
              style={{ color: 'var(--accent-blue)' }}
              onClick={() => setShowFbSetup((v) => !v)}
            >
              {showFbSetup ? 'Hide Config' : 'Edit Config'}
            </button>
          )}
        </div>

        {syncError && <div className="ios-banner ios-banner--error">{syncError}</div>}
        {authError && <div className="ios-banner ios-banner--error">{authError}</div>}

        {firebaseConfigured && user ? (
          <div className="stack-md">
            <div className="ios-banner ios-banner--success">
              <ShieldCheck size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Signed in as {user.email || user.displayName || 'User'}</strong>
                <div className="field-hint" style={{ color: 'inherit', opacity: 0.85 }}>
                  Tasks, daily logs, categories, and Gemini API key sync automatically across
                  devices with offline Firestore cache.
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--secondary btn--full" onClick={logout}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        ) : firebaseConfigured ? (
          <div className="stack-md">
            <div className="ios-segmented">
              <button
                type="button"
                className={`ios-segmented-btn ${
                  authMode === 'signin' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setAuthMode('signin')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`ios-segmented-btn ${
                  authMode === 'signup' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setAuthMode('signup')}
              >
                Create Account
              </button>
            </div>

            <form className="stack-sm" onSubmit={handleEmailAuth}>
              <input
                type="email"
                className="ios-input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="ios-input"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="submit"
                className="btn btn--primary btn--full"
                disabled={authBusy}
              >
                {authBusy ? (
                  <Loader2 size={17} className="spin" />
                ) : authMode === 'signin' ? (
                  'Sign In with Email'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>

            <button
              type="button"
              className="btn btn--secondary btn--full"
              disabled={authBusy}
              onClick={handleGoogleAuth}
            >
              Continue with Google
            </button>
          </div>
        ) : (
          <p className="field-hint" style={{ margin: 0 }}>
            Strike works offline right now on this device. Paste your Firebase Web App config below
            (or add <code>VITE_FIREBASE_*</code> GitHub Actions variables) to log in and sync your
            progress &amp; Gemini key anywhere.
          </p>
        )}

        {showFbSetup && firebaseConfigSource !== 'env' && (
          <form className="stack-sm" onSubmit={handleSaveFirebaseConfig}>
            <label className="field-label">
              Paste Firebase Web Config (JSON or JS snippet)
              <textarea
                className="ios-textarea"
                style={{ minHeight: 92, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                placeholder={`{\n  "apiKey": "...",\n  "authDomain": "your-app.firebaseapp.com",\n  "projectId": "your-app",\n  "appId": "1:...:web:..."\n}`}
                value={fbConfigInput}
                onChange={(e) => setFbConfigInput(e.target.value)}
              />
            </label>
            <div className="row-gap">
              <button
                type="submit"
                className="btn btn--tinted btn--full"
                disabled={!fbConfigInput.trim()}
              >
                Connect Firebase
              </button>
              {firebaseConfigured && (
                <button
                  type="button"
                  className="btn btn--danger-soft"
                  onClick={disconnectFirebaseConfig}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        )}

        <div className="stack-sm">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setShowRules((v) => !v)}
          >
            <ShieldCheck size={14} />
            {showRules ? 'Hide Firestore Security Rules' : 'View Required Firestore Security Rules'}
          </button>

          {showRules && (
            <div className="stack-sm">
              <pre className="code-block">{FIRESTORE_SECURITY_RULES_SNIPPET}</pre>
              <button type="button" className="btn btn--tinted btn--sm" onClick={handleCopyRules}>
                <Copy size={14} />
                Copy Rules
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Categories */}
      <section className="ios-card" aria-labelledby="settings-categories-heading">
        <div className="row-between">
          <h2 id="settings-categories-heading" className="ios-group-title">
            Activity Categories
          </h2>
          <span className="log-meta-note">Passed to Gemini schema</span>
        </div>

        <div className="ios-list" style={{ background: 'var(--bg-elevated-2)' }}>
          {preferences.categories.map((cat) => (
            <div key={cat.id} className="ios-row ios-row--flush">
              <span className={`cat-dot cat-swatch--${cat.colorToken}`} style={{ width: 10, height: 10 }} />
              <input
                type="text"
                className="ios-input"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 6px',
                  fontSize: 15,
                }}
                value={cat.name}
                aria-label={`Category ${cat.name}`}
                onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
              />
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Remove ${cat.name}`}
                disabled={preferences.categories.length <= 1}
                onClick={() => deleteCategory(cat.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <form className="stack-sm" onSubmit={handleAddCategory}>
          <div className="row-gap">
            <input
              type="text"
              className="ios-input"
              placeholder="New category name…"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button
              type="submit"
              className="task-add-btn"
              aria-label="Add category"
              disabled={!newCategoryName.trim()}
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="swatch-row" role="radiogroup" aria-label="Category color">
            {COLOR_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                className={`swatch-btn cat-swatch--${token} ${
                  newCategoryColor === token ? 'swatch-btn--active' : ''
                }`}
                aria-label={`Color ${token}`}
                aria-checked={newCategoryColor === token}
                role="radio"
                onClick={() => setNewCategoryColor(token)}
              />
            ))}
          </div>
        </form>
      </section>

      {/* 4. Own Your Data (Markdown & JSON Export + Import) */}
      <section className="ios-card" aria-labelledby="settings-export-heading">
        <div className="row-between">
          <h2 id="settings-export-heading" className="ios-group-title row-gap">
            <Download size={14} />
            Own Your Data
          </h2>
          <span className="log-meta-note">
            {tasks.length} tasks · {logs.length} logs
          </span>
        </div>

        <div className="row-gap">
          <button
            id="export-markdown-btn"
            type="button"
            className="btn btn--secondary btn--full"
            onClick={handleExportMarkdown}
          >
            <FileText size={16} />
            Export Markdown
          </button>
          <button
            id="export-json-btn"
            type="button"
            className="btn btn--secondary btn--full"
            onClick={handleExportJson}
          >
            <FileJson size={16} />
            Export JSON
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <button
          type="button"
          className="btn btn--tinted btn--full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} />
          Import JSON Backup
        </button>
      </section>
    </>
  );
};
