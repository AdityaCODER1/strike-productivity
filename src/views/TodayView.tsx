import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useStrike } from '../state/StrikeContext';
import { LogEntry } from '../types/models';
import { formatFullDateSubtitle, formatTimeShort, toDateKey } from '../utils/date';
import { CategoryBadge } from '../components/CategoryBadge';
import { LogEditSheet } from '../components/LogEditSheet';

interface TodayViewProps {
  onOpenSettings: () => void;
}

export const TodayView: React.FC<TodayViewProps> = ({ onOpenSettings }) => {
  const {
    logs,
    preferences,
    pendingSuggestions,
    isProcessingDump,
    processBrainDump,
    addManualLog,
    showToast,
  } = useStrike();

  const [dumpText, setDumpText] = useState('');
  const [dumpError, setDumpError] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<'ai' | 'manual'>('ai');
  const [manualTitle, setManualTitle] = useState('');
  const [manualCategory, setManualCategory] = useState(
    () => preferences.categories[0]?.name ?? 'Personal'
  );
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  const todayKey = toDateKey();
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  const todayLogs = useMemo(
    () => logs.filter((entry) => entry.dateKey === todayKey),
    [logs, todayKey]
  );

  const handleBrainDumpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dumpText.trim() || isProcessingDump) return;
    setDumpError(null);

    try {
      await processBrainDump(dumpText, todayKey);
      setDumpText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process brain dump.';
      setDumpError(msg);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    const resolvedCat = preferences.categories.some((c) => c.name === manualCategory)
      ? manualCategory
      : preferences.categories[0]?.name ?? 'Personal';
    addManualLog(manualTitle, resolvedCat, todayKey);
    setManualTitle('');
    showToast('Activity logged', 'success');
  };

  const pendingCount =
    (pendingSuggestions?.unfinishedTasks.length ?? 0) +
    (pendingSuggestions?.matchedTasks.length ?? 0);

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          <span className="page-kicker">{formatFullDateSubtitle(todayKey)}</span>
          <h1 className="page-title">Today</h1>
        </div>
        <div className="header-pill">
          <span>
            {todayLogs.length} {todayLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </header>

      {/* Brain Dump / Manual Composer Card */}
      <section className="ios-card" aria-label="Daily activity input">
        <div className="row-between">
          <div className="ios-segmented" role="tablist" aria-label="Input mode">
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'ai'}
              className={`ios-segmented-btn ${
                composerMode === 'ai' ? 'ios-segmented-btn--active' : ''
              }`}
              onClick={() => {
                setComposerMode('ai');
                setDumpError(null);
              }}
            >
              Brain Dump
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'manual'}
              className={`ios-segmented-btn ${
                composerMode === 'manual' ? 'ios-segmented-btn--active' : ''
              }`}
              onClick={() => setComposerMode('manual')}
            >
              Quick Entry
            </button>
          </div>
          {composerMode === 'ai' && (
            <span className="log-meta-note" title="Active Gemini model">
              {preferences.geminiModel}
            </span>
          )}
        </div>

        {composerMode === 'ai' ? (
          <form className="stack-md" onSubmit={handleBrainDumpSubmit}>
            <textarea
              id="brain-dump-textarea"
              className="ios-textarea"
              placeholder="Dump what you got done today in plain text… e.g. Shipped the navbar fix, went for a 5k run, called mom, still need to pay electric bill tomorrow."
              value={dumpText}
              onChange={(e) => setDumpText(e.target.value)}
              disabled={isProcessingDump}
            />

            {!hasGeminiKey && (
              <div className="ios-banner ios-banner--info">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div className="stack-sm" style={{ gap: 6 }}>
                  <span>
                    Add your Gemini API key in Settings to auto-split and categorize brain dumps.
                  </span>
                  <div>
                    <button
                      type="button"
                      className="btn btn--tinted btn--sm btn--pill"
                      onClick={onOpenSettings}
                    >
                      Open Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {dumpError && (
              <div className="ios-banner ios-banner--error" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{dumpError}</span>
              </div>
            )}

            <button
              id="brain-dump-submit"
              type="submit"
              className="btn btn--primary btn--full"
              disabled={!dumpText.trim() || isProcessingDump || !hasGeminiKey}
            >
              {isProcessingDump ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Categorizing with Gemini…
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Log with Gemini
                </>
              )}
            </button>
          </form>
        ) : (
          <form className="stack-md" onSubmit={handleManualSubmit}>
            <input
              id="manual-log-input"
              type="text"
              className="ios-input"
              placeholder="What did you finish?"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              autoComplete="off"
            />

            <div className="filter-strip" aria-label="Select category">
              {preferences.categories.map((cat) => {
                const active = cat.name === manualCategory;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => setManualCategory(cat.name)}
                  >
                    <span
                      className={`cat-dot cat-swatch--${cat.colorToken}`}
                      style={active ? { background: '#ffffff' } : undefined}
                    />
                    {cat.name}
                  </button>
                );
              })}
            </div>

            <button
              id="manual-log-submit"
              type="submit"
              className="btn btn--primary btn--full"
              disabled={!manualTitle.trim()}
            >
              <Plus size={18} />
              Add to Today’s Log
            </button>
          </form>
        )}
      </section>

      {pendingCount > 0 && (
        <div className="ios-banner ios-banner--info">
          <Sparkles size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {pendingCount} follow-up {pendingCount === 1 ? 'item is' : 'items are'} waiting in the
            review sheet.
          </span>
        </div>
      )}

      {/* Today's Activity Log */}
      <section className="ios-group" aria-labelledby="today-log-heading">
        <div className="ios-group-header">
          <h2 id="today-log-heading" className="ios-group-title">
            Completed Today
          </h2>
          <span className="ios-group-count">Tap any item to edit</span>
        </div>

        <div className="ios-list">
          {todayLogs.length > 0 ? (
            todayLogs.map((entry) => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                className="log-entry-row"
                onClick={() => setEditingEntry(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditingEntry(entry);
                  }
                }}
              >
                <div className="log-entry-main">
                  <div className="log-entry-title">{entry.title}</div>
                  <div className="log-entry-meta">
                    <CategoryBadge name={entry.category} categories={preferences.categories} />
                    <span className="log-meta-note">{formatTimeShort(entry.createdAt)}</span>
                    {entry.source === 'task_checkoff' && (
                      <span className="log-meta-note row-gap" style={{ gap: 4 }}>
                        <CheckCircle2 size={12} />
                        From Plan
                      </span>
                    )}
                    {entry.source === 'brain_dump' && (
                      <span className="log-meta-note row-gap" style={{ gap: 4 }}>
                        <Sparkles size={12} />
                        Gemini
                      </span>
                    )}
                  </div>
                </div>
                <span className="icon-btn" aria-hidden="true">
                  <PenLine size={15} />
                </span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Sparkles size={20} />
              </div>
              <p className="empty-state-title">Nothing logged yet today</p>
              <p className="empty-state-subtitle">
                Drop a messy recap above or check off a task in Plan to build your daily log.
              </p>
            </div>
          )}
        </div>
      </section>

      <LogEditSheet entry={editingEntry} onClose={() => setEditingEntry(null)} />
    </>
  );
};
