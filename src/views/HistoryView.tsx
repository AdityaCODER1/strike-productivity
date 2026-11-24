import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  Loader2,
  PenLine,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useStrike } from '../state/StrikeContext';
import { LogEntry } from '../types/models';
import { formatDateHeading, formatTimeShort, toDateKey } from '../utils/date';
import { CategoryBadge } from '../components/CategoryBadge';
import { LogEditSheet } from '../components/LogEditSheet';

export const HistoryView: React.FC = () => {
  const {
    logs,
    preferences,
    isProcessingDump,
    processBrainDump,
    addManualLog,
    showToast,
  } = useStrike();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  // Past-date backfill sheet
  const [showBackfill, setShowBackfill] = useState(false);
  const [backfillDate, setBackfillDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateKey(yesterday);
  });
  const [backfillMode, setBackfillMode] = useState<'ai' | 'manual'>('ai');
  const [backfillText, setBackfillText] = useState('');
  const [backfillCategory, setBackfillCategory] = useState(
    () => preferences.categories[0]?.name ?? 'Personal'
  );
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const todayKey = toDateKey();
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  const groupedDays = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = logs.filter((entry) => {
      if (selectedCategory !== 'ALL' && entry.category !== selectedCategory) return false;
      if (
        query &&
        !entry.title.toLowerCase().includes(query) &&
        !entry.category.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });

    const map = new Map<string, LogEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.dateKey) ?? [];
      list.push(entry);
      map.set(entry.dateKey, list);
    }

    return Array.from(map.entries()).sort(([dayA], [dayB]) => dayB.localeCompare(dayA));
  }, [logs, selectedCategory, searchQuery]);

  const handleBackfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backfillText.trim()) return;
    setBackfillError(null);

    if (backfillMode === 'manual') {
      addManualLog(backfillText, backfillCategory, backfillDate);
      setBackfillText('');
      setShowBackfill(false);
      showToast(`Logged activity for ${formatDateHeading(backfillDate, todayKey)}`, 'success');
      return;
    }

    try {
      await processBrainDump(backfillText, backfillDate);
      setBackfillText('');
      setShowBackfill(false);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Could not categorize dump.');
    }
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          <span className="page-kicker">Activity Archive</span>
          <h1 className="page-title">History</h1>
        </div>
        <button
          id="history-backfill-btn"
          type="button"
          className="header-pill header-pill--action"
          onClick={() => setShowBackfill(true)}
        >
          <CalendarPlus size={14} />
          <span>Log Past Day</span>
        </button>
      </header>

      {/* Search & Category Filter */}
      <div className="stack-sm">
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 13,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            id="history-search-input"
            type="search"
            className="ios-input"
            style={{ paddingLeft: 38 }}
            placeholder="Search past activities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-strip" role="tablist" aria-label="Filter history by category">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'ALL'}
            className={`filter-pill ${selectedCategory === 'ALL' ? 'filter-pill--active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            All ({logs.length})
          </button>
          {preferences.categories.map((cat) => {
            const active = selectedCategory === cat.name;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                onClick={() => setSelectedCategory(cat.name)}
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
      </div>

      {/* Multi-day feed */}
      {groupedDays.length > 0 ? (
        groupedDays.map(([dateKey, entries]) => (
          <section key={dateKey} className="ios-group" aria-label={`Log for ${dateKey}`}>
            <div className="ios-group-header">
              <h2 className="ios-group-title">{formatDateHeading(dateKey, todayKey)}</h2>
              <span className="ios-group-count">
                {entries.length} {entries.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="ios-list">
              {entries.map((entry) => (
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
                    </div>
                  </div>
                  <span className="icon-btn" aria-hidden="true">
                    <PenLine size={15} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="ios-card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <CalendarDays size={20} />
            </div>
            <p className="empty-state-title">
              {logs.length === 0 ? 'Your timeline starts today' : 'No matching entries'}
            </p>
            <p className="empty-state-subtitle">
              {logs.length === 0
                ? 'Log your day in Today or backfill an earlier day above.'
                : 'Try clearing your search or switching category filter.'}
            </p>
          </div>
        </div>
      )}

      {/* Past-Date Backfill Sheet */}
      {showBackfill && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="backfill-sheet-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBackfill(false);
          }}
        >
          <form className="sheet-panel" onSubmit={handleBackfillSubmit}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2 id="backfill-sheet-title" className="sheet-title">
                Log Past Day
              </h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setShowBackfill(false)}
              >
                <X size={20} />
              </button>
            </div>

            <label className="field-label">
              Date
              <input
                type="date"
                className="ios-input"
                max={todayKey}
                value={backfillDate}
                onChange={(e) => setBackfillDate(e.target.value)}
                required
              />
            </label>

            <div className="ios-segmented">
              <button
                type="button"
                className={`ios-segmented-btn ${
                  backfillMode === 'ai' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setBackfillMode('ai')}
              >
                Gemini Brain Dump
              </button>
              <button
                type="button"
                className={`ios-segmented-btn ${
                  backfillMode === 'manual' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setBackfillMode('manual')}
              >
                Quick Entry
              </button>
            </div>

            {backfillMode === 'ai' ? (
              <textarea
                className="ios-textarea"
                placeholder="Write what you got done on that day…"
                value={backfillText}
                onChange={(e) => setBackfillText(e.target.value)}
                disabled={isProcessingDump}
                required
              />
            ) : (
              <>
                <input
                  type="text"
                  className="ios-input"
                  placeholder="Completed activity…"
                  value={backfillText}
                  onChange={(e) => setBackfillText(e.target.value)}
                  required
                />
                <div className="filter-strip">
                  {preferences.categories.map((cat) => {
                    const active = cat.name === backfillCategory;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                        onClick={() => setBackfillCategory(cat.name)}
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
              </>
            )}

            {backfillError && (
              <div className="ios-banner ios-banner--error">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{backfillError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={
                !backfillText.trim() ||
                isProcessingDump ||
                (backfillMode === 'ai' && !hasGeminiKey)
              }
            >
              {isProcessingDump ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Categorizing…
                </>
              ) : backfillMode === 'ai' ? (
                <>
                  <Sparkles size={18} />
                  Categorize &amp; Save
                </>
              ) : (
                <>
                  <Plus size={18} />
                  Save Entry
                </>
              )}
            </button>
          </form>
        </div>
      )}

      <LogEditSheet entry={editingEntry} onClose={() => setEditingEntry(null)} />
    </>
  );
};
