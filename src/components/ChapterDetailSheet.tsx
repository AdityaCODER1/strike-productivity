import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  NcertChapter,
  getPyqYearsRange,
  getSubjectMeta,
  isLearningCategoryName,
} from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { formatDateHeading, toDateKey } from '../utils/date';

interface ChapterDetailSheetProps {
  chapter: NcertChapter | null;
  onClose: () => void;
  onOpenChapterDoubts?: (chapter: NcertChapter) => void;
  onOpenChapterMistakes?: (chapter: NcertChapter) => void;
  onOpenChapterSummary?: (chapter: NcertChapter, scope: 'mistakes' | 'doubts') => void;
}

export const ChapterDetailSheet: React.FC<ChapterDetailSheetProps> = ({
  chapter,
  onClose,
  onOpenChapterDoubts,
  onOpenChapterMistakes,
  onOpenChapterSummary,
}) => {
  const {
    logs,
    tasks,
    doubts,
    mistakes,
    chapterProgress,
    studySettings,
    preferences,
    evaluatingChapterIds,
    toggleChapterPyqYear,
    setChapterPyqYears,
    setManualChapterCoverage,
    refreshChapterCoverageWithAi,
    addManualLog,
    addTask,
    toggleTaskCompletion,
    showToast,
  } = useStrike();

  const [quickWorkTitle, setQuickWorkTitle] = useState('');
  const [quickMode, setQuickMode] = useState<'log' | 'plan'>('log');
  const [showManualSlider, setShowManualSlider] = useState(false);

  const todayKey = toDateKey();
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  const pyqYears = useMemo(
    () => getPyqYearsRange(studySettings.pyqYearStart, studySettings.pyqYearEnd),
    [studySettings.pyqYearStart, studySettings.pyqYearEnd]
  );

  const chapterLogs = useMemo(() => {
    if (!chapter) return [];
    return logs.filter(
      (l) => l.chapterId === chapter.id && isLearningCategoryName(l.category)
    );
  }, [chapter, logs]);

  const chapterOpenTasks = useMemo(() => {
    if (!chapter) return [];
    return tasks.filter((t) => !t.completed && t.chapterId === chapter.id);
  }, [chapter, tasks]);

  const chapterDoubtsCount = useMemo(() => {
    if (!chapter) return 0;
    return doubts.filter((d) => d.chapterId === chapter.id && d.status === 'open').length;
  }, [chapter, doubts]);

  const chapterMistakesCount = useMemo(() => {
    if (!chapter) return 0;
    return mistakes.filter((m) => m.chapterId === chapter.id && m.status === 'active').length;
  }, [chapter, mistakes]);

  if (!chapter) return null;

  const subjectMeta = getSubjectMeta(chapter.subjectId);
  const progress = chapterProgress[chapter.id];
  const coveragePercent = progress?.coveragePercent ?? 0;
  const completedPyqYears = progress?.completedPyqYears ?? [];
  const isEvaluating = evaluatingChapterIds.includes(chapter.id);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickWorkTitle.trim();
    if (!trimmed) return;
    if (quickMode === 'log') {
      addManualLog(trimmed, 'Learning', todayKey, {
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
      });
      showToast(`Logged work in ${chapter.title}`, 'success');
    } else {
      addTask(trimmed, 'today', 'Learning', {
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
      });
      showToast(`Added to Plan under ${chapter.title}`, 'success');
    }
    setQuickWorkTitle('');
  };

  const allPyqsSelected =
    pyqYears.length > 0 && pyqYears.every((y) => completedPyqYears.includes(y));

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-detail-title"
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
              {chapter.archived ? ' · Archived NCERT' : ''}
            </span>
            <h2 id="chapter-detail-title" className="sheet-title" style={{ marginTop: 2 }}>
              {chapter.title}
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close chapter details" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Coverage Hero Card */}
        <div className="study-coverage-box">
          <div className="row-between">
            <div>
              <div className="study-coverage-pct">{coveragePercent}%</div>
              <div className="field-hint">
                {progress?.coverageSource === 'manual'
                  ? 'Manual override'
                  : progress?.lastEvaluatedAt
                  ? 'Holistic AI estimate'
                  : 'Estimated chapter coverage'}
              </div>
            </div>
            <div className="row-gap">
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--pill"
                aria-label="Manual override percentage"
                onClick={() => setShowManualSlider((v) => !v)}
              >
                <SlidersHorizontal size={13} />
                Adjust
              </button>
              <button
                type="button"
                className="btn btn--tinted btn--sm btn--pill"
                disabled={isEvaluating || !hasGeminiKey}
                onClick={() => void refreshChapterCoverageWithAi(chapter.id)}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    Scoring…
                  </>
                ) : (
                  <>
                    <RefreshCw size={13} />
                    Refresh AI %
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="study-progress-track" style={{ height: 8 }}>
            <div
              className={`study-progress-fill study-progress-fill--${subjectMeta.colorToken}`}
              style={{ width: `${coveragePercent}%` }}
            />
          </div>

          {progress?.aiSummary ? (
            <div className="study-ai-note">
              <Sparkles size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent-blue)' }} />
              <span>{progress.aiSummary}</span>
            </div>
          ) : (
            <div className="field-hint">
              {hasGeminiKey
                ? 'Log your study work or check off PYQ years below — Gemini will estimate meaningful NCERT coverage.'
                : 'Add a Gemini API key in Settings to auto-calculate coverage %, or tap Adjust to set manually.'}
            </div>
          )}

          {showManualSlider && (
            <div className="stack-sm" style={{ paddingTop: 4 }}>
              <div className="row-between">
                <span className="field-hint">Manual Coverage Override</span>
                <span className="log-meta-note">{coveragePercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="study-range"
                aria-label="Manual chapter coverage percentage"
                value={coveragePercent}
                onChange={(e) => setManualChapterCoverage(chapter.id, Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* PYQ Year Checkoff Grid (Physics & Chemistry) */}
        {subjectMeta.hasPyqTracker && (
          <div className="stack-sm">
            <div className="row-between">
              <span className="ios-group-title">
                PYQ Years Practiced ({completedPyqYears.filter((y) => pyqYears.includes(y)).length}/
                {pyqYears.length})
              </span>
              <button
                type="button"
                className="log-meta-note"
                style={{ color: 'var(--accent-blue)' }}
                onClick={() =>
                  setChapterPyqYears(chapter.id, allPyqsSelected ? [] : pyqYears)
                }
              >
                {allPyqsSelected ? 'Clear all' : 'Mark all'}
              </button>
            </div>
            <div className="pyq-grid" role="group" aria-label={`PYQ years for ${chapter.title}`}>
              {pyqYears.map((year) => {
                const checked = completedPyqYears.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={checked}
                    className={`pyq-pill ${checked ? 'pyq-pill--checked' : ''}`}
                    onClick={() => toggleChapterPyqYear(chapter.id, year)}
                  >
                    {checked && <Check size={11} strokeWidth={3} />}
                    <span>{year}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Log / Plan Task for this Chapter */}
        <form className="stack-sm" onSubmit={handleQuickAdd}>
          <div className="row-between">
            <span className="ios-group-title">Add Study Activity</span>
            <div className="ios-segmented" style={{ padding: 2 }}>
              <button
                type="button"
                className={`ios-segmented-btn ${quickMode === 'log' ? 'ios-segmented-btn--active' : ''}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setQuickMode('log')}
              >
                Log Done
              </button>
              <button
                type="button"
                className={`ios-segmented-btn ${quickMode === 'plan' ? 'ios-segmented-btn--active' : ''}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setQuickMode('plan')}
              >
                Plan Task
              </button>
            </div>
          </div>
          <div className="row-gap">
            <input
              type="text"
              className="ios-input"
              style={{ padding: '10px 12px', fontSize: 14.5 }}
              placeholder={
                quickMode === 'log'
                  ? `e.g. Read NCERT + solved 30 MCQs of ${chapter.title}…`
                  : `e.g. Revise NCERT formulas for ${chapter.title}…`
              }
              value={quickWorkTitle}
              onChange={(e) => setQuickWorkTitle(e.target.value)}
            />
            <button
              type="submit"
              className="task-add-btn"
              style={{ width: 40, height: 40 }}
              aria-label={quickMode === 'log' ? 'Log study activity' : 'Add planned study task'}
              disabled={!quickWorkTitle.trim()}
            >
              <Plus size={18} />
            </button>
          </div>
        </form>

        {/* Open Planned Tasks for this Chapter */}
        {chapterOpenTasks.length > 0 && (
          <div className="stack-sm">
            <span className="ios-group-title">Planned Tasks ({chapterOpenTasks.length})</span>
            <div className="ios-list" style={{ background: 'var(--bg-elevated-2)' }}>
              {chapterOpenTasks.map((t) => (
                <div key={t.id} className="ios-row ios-row--flush" style={{ padding: '10px 12px' }}>
                  <button
                    type="button"
                    className="ios-checkbox"
                    aria-label={`Complete "${t.title}"`}
                    onClick={() => toggleTaskCompletion(t.id)}
                  />
                  <span style={{ fontSize: 14.5, flex: 1 }}>{t.title}</span>
                  <span className="log-meta-note">
                    {t.bucket === 'today' ? 'Today' : t.bucket === 'tomorrow' ? 'Tomorrow' : 'Later'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chapter Mistakes, Doubts & Summary Shortcuts */}
        {(onOpenChapterMistakes || onOpenChapterDoubts || onOpenChapterSummary) && (
          <div className="filter-strip" role="group" aria-label="Chapter shortcuts">
            {onOpenChapterSummary && (
              <button
                type="button"
                className="btn btn--tinted btn--sm btn--pill"
                onClick={() =>
                  onOpenChapterSummary(
                    chapter,
                    chapterMistakesCount > 0 || chapterDoubtsCount === 0 ? 'mistakes' : 'doubts'
                  )
                }
              >
                <FileText size={13} />
                Chapter Summary
              </button>
            )}
            {onOpenChapterMistakes && (
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--pill"
                onClick={() => onOpenChapterMistakes(chapter)}
              >
                <AlertTriangle size={13} />
                {chapterMistakesCount > 0
                  ? `${chapterMistakesCount} ${chapterMistakesCount === 1 ? 'Mistake' : 'Mistakes'}`
                  : 'Mistakes'}
              </button>
            )}
            {onOpenChapterDoubts && (
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--pill"
                onClick={() => onOpenChapterDoubts(chapter)}
              >
                <HelpCircle size={13} />
                {chapterDoubtsCount > 0
                  ? `${chapterDoubtsCount} ${chapterDoubtsCount === 1 ? 'Doubt' : 'Doubts'}`
                  : 'Doubts'}
              </button>
            )}
          </div>
        )}

        {/* Completed Work History */}
        <div className="stack-sm">
          <div className="row-between">
            <span className="ios-group-title">Completed Work ({chapterLogs.length})</span>
          </div>

          {chapterLogs.length > 0 ? (
            <div className="ios-list" style={{ background: 'var(--bg-elevated-2)' }}>
              {chapterLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="ios-row ios-row--flush"
                  style={{ padding: '10px 12px', alignItems: 'flex-start' }}
                >
                  <CheckCircle2
                    size={15}
                    style={{ color: 'var(--accent-green)', marginTop: 3, flexShrink: 0 }}
                  />
                  <div className="stack-sm" style={{ gap: 2, flex: 1 }}>
                    <span style={{ fontSize: 14.5, color: 'var(--text-primary)' }}>{entry.title}</span>
                    <span className="log-meta-note">{formatDateHeading(entry.dateKey, todayKey)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="field-hint" style={{ margin: 0 }}>
              No completed study logs tagged to this chapter yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
