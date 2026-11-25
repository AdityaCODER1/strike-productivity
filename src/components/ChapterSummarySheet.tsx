import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { NcertChapter, getSubjectMeta } from '../data/ncertCatalog';
import {
  DoubtItem,
  MISTAKE_TYPES,
  MISTAKE_TYPE_META,
  MistakeItem,
  MistakeType,
} from '../types/models';
import { ChapterSummaryScope } from '../services/gemini';
import { useStrike } from '../state/StrikeContext';

interface ChapterSummarySheetProps {
  chapter: NcertChapter | null;
  initialScope: ChapterSummaryScope;
  onClose: () => void;
  onSelectMistake?: (mistake: MistakeItem) => void;
  onSelectDoubt?: (doubt: DoubtItem) => void;
  onAddMistake?: (chapter: NcertChapter) => void;
  onAddDoubt?: (chapter: NcertChapter) => void;
}

export const ChapterSummarySheet: React.FC<ChapterSummarySheetProps> = ({
  chapter,
  initialScope,
  onClose,
  onSelectMistake,
  onSelectDoubt,
  onAddMistake,
  onAddDoubt,
}) => {
  const {
    mistakes,
    doubts,
    chapterProgress,
    preferences,
    summarizingChapterKeys,
    generateChapterSummary,
    showToast,
  } = useStrike();

  const [scope, setScope] = useState<ChapterSummaryScope>(initialScope);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!chapter) return;
    setScope(initialScope);
    setSummaryError(null);
  }, [chapter, initialScope]);

  const chapterMistakes = useMemo(() => {
    if (!chapter) return [];
    return mistakes.filter((m) => m.chapterId === chapter.id);
  }, [chapter, mistakes]);

  const chapterDoubts = useMemo(() => {
    if (!chapter) return [];
    return doubts.filter((d) => d.chapterId === chapter.id);
  }, [chapter, doubts]);

  const mistakeStats = useMemo(() => {
    let active = 0;
    let fixed = 0;
    let totalOccurrences = 0;
    const byType = new Map<MistakeType, number>();

    for (const m of chapterMistakes) {
      if (m.status === 'active') active += 1;
      else fixed += 1;
      totalOccurrences += m.repeatCount;
      byType.set(m.mistakeType, (byType.get(m.mistakeType) ?? 0) + 1);
    }

    const hotspots = chapterMistakes.filter((m) => m.repeatCount > 1);
    const typeBreakdown = MISTAKE_TYPES.map((t) => ({
      type: t,
      count: byType.get(t) ?? 0,
    })).filter((entry) => entry.count > 0);

    return { active, fixed, totalOccurrences, hotspots, typeBreakdown };
  }, [chapterMistakes]);

  const doubtStats = useMemo(() => {
    let open = 0;
    let resolved = 0;
    let withTakeaway = 0;
    let withPyq = 0;

    for (const d of chapterDoubts) {
      if (d.status === 'open') open += 1;
      else resolved += 1;
      if (d.resolutionNote.trim()) withTakeaway += 1;
      if (d.pyqYear) withPyq += 1;
    }

    return { open, resolved, withTakeaway, withPyq };
  }, [chapterDoubts]);

  if (!chapter) return null;

  const subjectMeta = getSubjectMeta(chapter.subjectId);
  const prog = chapterProgress[chapter.id];
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  const activeItemsCount =
    scope === 'mistakes' ? chapterMistakes.length : chapterDoubts.length;
  const cachedSummary =
    scope === 'mistakes' ? prog?.mistakesSummaryAi : prog?.doubtsSummaryAi;
  const cachedCount =
    scope === 'mistakes' ? prog?.mistakesSummaryCount : prog?.doubtsSummaryCount;
  const isStale =
    Boolean(cachedSummary) &&
    cachedCount !== undefined &&
    cachedCount !== activeItemsCount;
  const isGenerating = summarizingChapterKeys.includes(`${chapter.id}:${scope}`);

  const handleGenerateSummary = async () => {
    setSummaryError(null);
    try {
      await generateChapterSummary(chapter.id, scope);
      showToast(
        scope === 'mistakes'
          ? 'Chapter mistake revision summary ready'
          : 'Chapter doubts revision summary ready',
        'success'
      );
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : 'Could not generate chapter revision summary.'
      );
    }
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-summary-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div style={{ minWidth: 0 }}>
            <span className="page-kicker" style={{ fontSize: 11 }}>
              {subjectMeta.name} · Class {chapter.classLevel} · Ch {chapter.chapterNumber}
            </span>
            <h2 id="chapter-summary-title" className="sheet-title" style={{ marginTop: 2 }}>
              {chapter.title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close chapter summary"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scope Switch: Mistakes | Doubts */}
        <div className="ios-segmented" role="tablist" aria-label="Chapter summary scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'mistakes'}
            className={`ios-segmented-btn ${
              scope === 'mistakes' ? 'ios-segmented-btn--active' : ''
            }`}
            onClick={() => {
              setScope('mistakes');
              setSummaryError(null);
            }}
          >
            Mistakes ({chapterMistakes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'doubts'}
            className={`ios-segmented-btn ${
              scope === 'doubts' ? 'ios-segmented-btn--active' : ''
            }`}
            onClick={() => {
              setScope('doubts');
              setSummaryError(null);
            }}
          >
            Doubts ({chapterDoubts.length})
          </button>
        </div>

        {/* Structured Breakdown Stats */}
        {scope === 'mistakes' ? (
          <div className="summary-stat-card">
            <div className="summary-stat-grid">
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-coral)' }}>
                  {mistakeStats.active}
                </span>
                <span className="summary-stat-lbl">Active</span>
              </div>
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-green)' }}>
                  {mistakeStats.fixed}
                </span>
                <span className="summary-stat-lbl">Fixed</span>
              </div>
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-amber)' }}>
                  {mistakeStats.totalOccurrences}×
                </span>
                <span className="summary-stat-lbl">Total Hits</span>
              </div>
            </div>

            {mistakeStats.typeBreakdown.length > 0 && (
              <div className="summary-chip-row">
                {mistakeStats.typeBreakdown.map(({ type, count }) => {
                  const meta = MISTAKE_TYPE_META[type];
                  return (
                    <span key={type} className="mistake-type-chip">
                      <span className={`cat-dot cat-swatch--${meta.colorToken}`} />
                      {count} {meta.shortLabel}
                    </span>
                  );
                })}
              </div>
            )}

            {mistakeStats.hotspots.length > 0 && (
              <div className="summary-hotspot-note">
                <RotateCcw size={13} style={{ color: 'var(--accent-coral)', flexShrink: 0 }} />
                <span>
                  Repeated hotspot:{' '}
                  <strong>{mistakeStats.hotspots[0].title}</strong> (
                  {mistakeStats.hotspots[0].repeatCount}×)
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="summary-stat-card">
            <div className="summary-stat-grid">
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-coral)' }}>
                  {doubtStats.open}
                </span>
                <span className="summary-stat-lbl">Open</span>
              </div>
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-green)' }}>
                  {doubtStats.resolved}
                </span>
                <span className="summary-stat-lbl">Resolved</span>
              </div>
              <div className="summary-stat-cell">
                <span className="summary-stat-val" style={{ color: 'var(--accent-blue)' }}>
                  {doubtStats.withTakeaway}
                </span>
                <span className="summary-stat-lbl">Takeaways</span>
              </div>
            </div>
            {doubtStats.withPyq > 0 && (
              <div className="field-hint">
                Includes {doubtStats.withPyq} tagged PYQ{' '}
                {doubtStats.withPyq === 1 ? 'doubt' : 'doubts'} in this chapter.
              </div>
            )}
          </div>
        )}

        {/* On-Demand Gemini Chapter Revision Summary */}
        <div className="doubt-ai-explanation">
          <div className="row-between">
            <span className="ios-group-title row-gap" style={{ fontSize: 11.5 }}>
              <Sparkles size={12} style={{ color: 'var(--accent-blue)' }} />
              Gemini Revision Summary
            </span>
            <button
              type="button"
              id="chapter-summary-generate-btn"
              className="btn btn--tinted btn--sm btn--pill"
              disabled={isGenerating || !hasGeminiKey || activeItemsCount === 0}
              onClick={() => void handleGenerateSummary()}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={13} className="spin" />
                  Summarizing…
                </>
              ) : (
                <>
                  <RefreshCw size={13} />
                  {cachedSummary ? 'Regenerate' : 'Generate Summary'}
                </>
              )}
            </button>
          </div>

          {isStale && (
            <div className="field-hint" style={{ color: 'var(--accent-amber)' }}>
              New items logged since this summary was generated — tap Regenerate to refresh.
            </div>
          )}

          {!hasGeminiKey && (
            <div className="field-hint">
              Add your Gemini API key in Settings to synthesize recurring weak spots and rules for
              this chapter.
            </div>
          )}

          {summaryError && (
            <div className="ios-banner ios-banner--error" role="alert">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{summaryError}</span>
            </div>
          )}

          {cachedSummary ? (
            <div className="doubt-ai-explanation-body">{cachedSummary}</div>
          ) : (
            <div className="field-hint">
              {activeItemsCount === 0
                ? scope === 'mistakes'
                  ? 'Log mistakes in this chapter to unlock an AI pattern & revision summary.'
                  : 'Save doubts in this chapter to unlock an AI doubts synthesis.'
                : `Synthesize all ${activeItemsCount} ${scope} in ${chapter.title} into a crisp pre-exam cheat sheet.`}
            </div>
          )}
        </div>

        {/* Scannable Pre-Exam Takeaways / Cheat Sheet */}
        <div className="stack-sm">
          <div className="row-between">
            <span className="ios-group-title">
              {scope === 'mistakes'
                ? `Rules & Mistakes (${chapterMistakes.length})`
                : `Doubts & Takeaways (${chapterDoubts.length})`}
            </span>
            {scope === 'mistakes' && onAddMistake && (
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--pill"
                onClick={() => onAddMistake(chapter)}
              >
                <Plus size={13} />
                Add Mistake
              </button>
            )}
            {scope === 'doubts' && onAddDoubt && (
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--pill"
                onClick={() => onAddDoubt(chapter)}
              >
                <Plus size={13} />
                Add Doubt
              </button>
            )}
          </div>

          {scope === 'mistakes' ? (
            chapterMistakes.length > 0 ? (
              <div className="ios-list" style={{ background: 'var(--bg-elevated-2)' }}>
                {chapterMistakes.map((m) => {
                  const meta = MISTAKE_TYPE_META[m.mistakeType];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="ios-row ios-row--flush ios-row-interactive"
                      style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start' }}
                      onClick={() => onSelectMistake?.(m)}
                    >
                      {m.status === 'fixed' ? (
                        <CheckCircle2
                          size={16}
                          style={{ color: 'var(--accent-green)', marginTop: 2, flexShrink: 0 }}
                        />
                      ) : (
                        <AlertTriangle
                          size={16}
                          style={{ color: 'var(--accent-coral)', marginTop: 2, flexShrink: 0 }}
                        />
                      )}
                      <div className="stack-sm" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                        <div className="row-between" style={{ gap: 8 }}>
                          <span
                            className={`log-entry-title ${
                              m.status === 'fixed' ? 'task-title--done' : ''
                            }`}
                            style={{ fontSize: 14.5 }}
                          >
                            {m.title}
                          </span>
                          {m.repeatCount > 1 && (
                            <span className="repeat-badge-inline">{m.repeatCount}×</span>
                          )}
                        </div>
                        {m.correctionNote ? (
                          <div className="cheat-sheet-rule">Rule: {m.correctionNote}</div>
                        ) : (
                          m.mistakeText !== m.title && (
                            <div className="doubt-preview-text">{m.mistakeText}</div>
                          )
                        )}
                        <div className="log-entry-meta">
                          <span className="mistake-type-chip">
                            <span className={`cat-dot cat-swatch--${meta.colorToken}`} />
                            {meta.shortLabel}
                          </span>
                          {m.sourceLabel && (
                            <span className="bucket-chip">{m.sourceLabel}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px 12px' }}>
                <div className="empty-state-icon">
                  <AlertTriangle size={18} />
                </div>
                <p className="empty-state-title">No mistakes in this chapter yet</p>
                <p className="empty-state-subtitle">
                  Log errors from tests or Brain Dump to build your revision sheet here.
                </p>
              </div>
            )
          ) : chapterDoubts.length > 0 ? (
            <div className="ios-list" style={{ background: 'var(--bg-elevated-2)' }}>
              {chapterDoubts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="ios-row ios-row--flush ios-row-interactive"
                  style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start' }}
                  onClick={() => onSelectDoubt?.(d)}
                >
                  {d.status === 'resolved' ? (
                    <CheckCircle2
                      size={16}
                      style={{ color: 'var(--accent-green)', marginTop: 2, flexShrink: 0 }}
                    />
                  ) : (
                    <Circle
                      size={16}
                      style={{ color: 'var(--accent-coral)', marginTop: 2, flexShrink: 0 }}
                    />
                  )}
                  <div className="stack-sm" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <span
                      className={`log-entry-title ${
                        d.status === 'resolved' ? 'task-title--done' : ''
                      }`}
                      style={{ fontSize: 14.5 }}
                    >
                      {d.title}
                    </span>
                    {d.resolutionNote ? (
                      <div className="cheat-sheet-rule">Takeaway: {d.resolutionNote}</div>
                    ) : (
                      d.questionText &&
                      d.questionText !== d.title && (
                        <div className="doubt-preview-text">{d.questionText}</div>
                      )
                    )}
                    <div className="log-entry-meta">
                      {d.pyqYear && <span className="bucket-chip">PYQ {d.pyqYear}</span>}
                      {d.aiExplanation && (
                        <span className="log-meta-note row-gap" style={{ gap: 4 }}>
                          <Sparkles size={11} />
                          Explained
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 12px' }}>
              <div className="empty-state-icon">
                <HelpCircle size={18} />
              </div>
              <p className="empty-state-title">No doubts in this chapter yet</p>
              <p className="empty-state-subtitle">
                Add a doubt or snap a PYQ photo to summarize them here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
