import React, { useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  NcertChapter,
  NcertClassLevel,
  STUDY_SUBJECTS,
  StudySubjectId,
  getChapterById,
  getChaptersForSubject,
  getPyqYearsRange,
  getSubjectMeta,
  isLearningCategoryName,
} from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { ChapterDetailSheet } from '../components/ChapterDetailSheet';
import { ChapterPickerControl } from '../components/ChapterPickerControl';
import { DoubtComposerSheet } from '../components/DoubtComposerSheet';
import { DoubtDetailSheet } from '../components/DoubtDetailSheet';

type StudySubTab = 'chapters' | 'pyqs' | 'doubts';

export const StudyView: React.FC = () => {
  const {
    logs,
    tasks,
    chapterProgress,
    doubts,
    studySettings,
    evaluatingChapterIds,
    updateStudySettings,
    toggleChapterPyqYear,
    setChapterPyqYears,
    assignItemChapter,
    toggleDoubtStatus,
    showToast,
  } = useStrike();

  const [subTab, setSubTab] = useState<StudySubTab>('chapters');
  const [selectedSubject, setSelectedSubject] = useState<StudySubjectId>('physics');
  const [pyqSubject, setPyqSubject] = useState<'physics' | 'chemistry'>('physics');
  const [classFilter, setClassFilter] = useState<'all' | NcertClassLevel>('all');
  const [chapterQuery, setChapterQuery] = useState('');
  const [showUntagged, setShowUntagged] = useState(false);
  const [editingUntaggedId, setEditingUntaggedId] = useState<string | null>(null);
  const [untaggedDraft, setUntaggedDraft] = useState<{
    subjectId?: StudySubjectId;
    chapterId?: string;
  }>({});

  // PYQ range customization UI
  const [showPyqRangeEditor, setShowPyqRangeEditor] = useState(false);

  // Doubts filters
  const [doubtStatusFilter, setDoubtStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [doubtSubjectFilter, setDoubtSubjectFilter] = useState<'all' | StudySubjectId>('all');
  const [doubtChapterFilter, setDoubtChapterFilter] = useState<string | null>(null);
  const [doubtSearch, setDoubtSearch] = useState('');

  // Sheets
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [showDoubtComposer, setShowDoubtComposer] = useState(false);
  const [composerDefaultChapter, setComposerDefaultChapter] = useState<{
    subjectId: StudySubjectId;
    chapterId?: string;
  }>({ subjectId: 'physics' });
  const [activeDoubtId, setActiveDoubtId] = useState<string | null>(null);

  const activeChapter = useMemo(
    () => getChapterById(activeChapterId) ?? null,
    [activeChapterId]
  );

  const activeDoubt = useMemo(
    () => doubts.find((d) => d.id === activeDoubtId) ?? null,
    [doubts, activeDoubtId]
  );

  const pyqYears = useMemo(
    () => getPyqYearsRange(studySettings.pyqYearStart, studySettings.pyqYearEnd),
    [studySettings.pyqYearStart, studySettings.pyqYearEnd]
  );

  // Per-chapter completed learning log counts & open doubt counts
  const { logsByChapter, openDoubtsByChapter, untaggedLearningItems } = useMemo(() => {
    const logCounts = new Map<string, number>();
    const doubtCounts = new Map<string, number>();
    const untagged: Array<{ targetType: 'task' | 'log'; id: string; title: string; meta: string }> =
      [];

    for (const entry of logs) {
      if (!isLearningCategoryName(entry.category)) continue;
      if (entry.chapterId) {
        logCounts.set(entry.chapterId, (logCounts.get(entry.chapterId) ?? 0) + 1);
      } else {
        untagged.push({
          targetType: 'log',
          id: entry.id,
          title: entry.title,
          meta: `Log · ${entry.dateKey}`,
        });
      }
    }

    for (const task of tasks) {
      if (task.completed || !isLearningCategoryName(task.category)) continue;
      if (!task.chapterId) {
        untagged.push({
          targetType: 'task',
          id: task.id,
          title: task.title,
          meta: `Plan · ${task.bucket === 'today' ? 'Today' : 'Later'}`,
        });
      }
    }

    for (const d of doubts) {
      if (d.status === 'open' && d.chapterId) {
        doubtCounts.set(d.chapterId, (doubtCounts.get(d.chapterId) ?? 0) + 1);
      }
    }

    return {
      logsByChapter: logCounts,
      openDoubtsByChapter: doubtCounts,
      untaggedLearningItems: untagged,
    };
  }, [logs, tasks, doubts]);

  // Subject overview metrics
  const subjectStats = useMemo(() => {
    return STUDY_SUBJECTS.map((subj) => {
      const chapters = getChaptersForSubject(subj.id, {
        includeArchived: studySettings.showArchivedNcert,
      });
      const total = chapters.length;
      let sumPct = 0;
      let started = 0;
      for (const ch of chapters) {
        const pct = chapterProgress[ch.id]?.coveragePercent ?? 0;
        sumPct += pct;
        if (pct > 0 || (logsByChapter.get(ch.id) ?? 0) > 0) started += 1;
      }
      const avgPercent = total > 0 ? Math.round(sumPct / total) : 0;
      return { subj, total, started, avgPercent };
    });
  }, [chapterProgress, logsByChapter, studySettings.showArchivedNcert]);

  // Filtered chapters for Chapters sub-tab
  const visibleChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    return getChaptersForSubject(selectedSubject, {
      includeArchived: studySettings.showArchivedNcert,
      classLevel: classFilter,
    }).filter((ch) => !q || ch.title.toLowerCase().includes(q));
  }, [selectedSubject, studySettings.showArchivedNcert, classFilter, chapterQuery]);

  const groupedChapters = useMemo(() => {
    const c11 = visibleChapters.filter((ch) => ch.classLevel === 11);
    const c12 = visibleChapters.filter((ch) => ch.classLevel === 12);
    return { c11, c12 };
  }, [visibleChapters]);

  // Filtered chapters for PYQs sub-tab
  const visiblePyqChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    return getChaptersForSubject(pyqSubject, {
      includeArchived: studySettings.showArchivedNcert,
      classLevel: classFilter,
    }).filter((ch) => !q || ch.title.toLowerCase().includes(q));
  }, [pyqSubject, studySettings.showArchivedNcert, classFilter, chapterQuery]);

  const pyqSubjectTotals = useMemo(() => {
    const allSubjChapters = getChaptersForSubject(pyqSubject, {
      includeArchived: studySettings.showArchivedNcert,
    });
    const yearSet = new Set(pyqYears);
    let done = 0;
    for (const ch of allSubjChapters) {
      const yrs = chapterProgress[ch.id]?.completedPyqYears ?? [];
      done += yrs.filter((y) => yearSet.has(y)).length;
    }
    const total = allSubjChapters.length * pyqYears.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [pyqSubject, studySettings.showArchivedNcert, pyqYears, chapterProgress]);

  // Filtered & chapter-grouped Doubts
  const { openDoubtTotal, groupedDoubts } = useMemo(() => {
    const openCount = doubts.filter((d) => d.status === 'open').length;
    const q = doubtSearch.trim().toLowerCase();

    const filtered = doubts.filter((d) => {
      if (doubtStatusFilter !== 'all' && d.status !== doubtStatusFilter) return false;
      if (doubtSubjectFilter !== 'all' && d.subjectId !== doubtSubjectFilter) return false;
      if (doubtChapterFilter && d.chapterId !== doubtChapterFilter) return false;
      if (q) {
        const ch = getChapterById(d.chapterId);
        const hay = `${d.title} ${d.questionText} ${d.resolutionNote} ${ch?.title ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const groups = new Map<
      string,
      { key: string; subjectId: StudySubjectId; chapter?: NcertChapter; items: typeof filtered }
    >();
    for (const item of filtered) {
      const chap = getChapterById(item.chapterId);
      const key = chap ? chap.id : `unassigned-${item.subjectId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, {
          key,
          subjectId: chap?.subjectId ?? item.subjectId,
          chapter: chap,
          items: [item],
        });
      }
    }

    return { openDoubtTotal: openCount, groupedDoubts: Array.from(groups.values()) };
  }, [doubts, doubtStatusFilter, doubtSubjectFilter, doubtChapterFilter, doubtSearch]);

  const handleOpenChapterDoubts = (chapter: NcertChapter) => {
    setActiveChapterId(null);
    setSubTab('doubts');
    setDoubtSubjectFilter(chapter.subjectId);
    setDoubtChapterFilter(chapter.id);
    setDoubtStatusFilter('all');
  };

  const renderChapterRow = (chapter: NcertChapter) => {
    const subj = getSubjectMeta(chapter.subjectId);
    const prog = chapterProgress[chapter.id];
    const pct = prog?.coveragePercent ?? 0;
    const logCount = logsByChapter.get(chapter.id) ?? 0;
    const pyqCount = (prog?.completedPyqYears ?? []).filter((y) => pyqYears.includes(y)).length;
    const chapDoubtCount = openDoubtsByChapter.get(chapter.id) ?? 0;
    const isScoring = evaluatingChapterIds.includes(chapter.id);

    return (
      <div
        key={chapter.id}
        role="button"
        tabIndex={0}
        className="chapter-row"
        onClick={() => setActiveChapterId(chapter.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveChapterId(chapter.id);
          }
        }}
      >
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="chapter-row-title-wrap">
            <span className="chapter-num-badge">Ch {chapter.chapterNumber}</span>
            <span className="chapter-row-title">
              {chapter.title}
              {chapter.archived && <span className="archived-tag">Archived</span>}
            </span>
          </div>
          <span className="chapter-pct-pill">
            {isScoring ? <Loader2 size={11} className="spin" /> : null}
            {pct}%
          </span>
        </div>

        <div className="study-progress-track">
          <div
            className={`study-progress-fill study-progress-fill--${subj.colorToken}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="chapter-row-meta">
          <span>
            {logCount} {logCount === 1 ? 'log' : 'logs'}
          </span>
          {subj.hasPyqTracker && (
            <span>
              PYQs {pyqCount}/{pyqYears.length}
            </span>
          )}
          {chapDoubtCount > 0 && (
            <span style={{ color: 'var(--accent-coral)' }}>
              {chapDoubtCount} {chapDoubtCount === 1 ? 'doubt' : 'doubts'}
            </span>
          )}
          {prog?.aiSummary && (
            <span className="chapter-summary-preview" title={prog.aiSummary}>
              · {prog.aiSummary}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          <span className="page-kicker">NCERT Class 11 &amp; 12 · PCB</span>
          <h1 className="page-title">Study</h1>
        </div>
        <button
          type="button"
          className={`header-pill ${studySettings.showArchivedNcert ? 'header-pill--action' : ''}`}
          aria-pressed={studySettings.showArchivedNcert}
          title="Toggle older pre-rationalized NCERT chapters"
          onClick={() =>
            updateStudySettings({ showArchivedNcert: !studySettings.showArchivedNcert })
          }
        >
          <Archive size={13} />
          <span>{studySettings.showArchivedNcert ? 'Archived On' : 'Archived'}</span>
        </button>
      </header>

      {/* Primary Sub-Navigation: Chapters | PYQs | Doubts */}
      <div className="ios-segmented" role="tablist" aria-label="Study sections">
        <button
          id="study-subtab-chapters"
          type="button"
          role="tab"
          aria-selected={subTab === 'chapters'}
          className={`ios-segmented-btn ${subTab === 'chapters' ? 'ios-segmented-btn--active' : ''}`}
          onClick={() => setSubTab('chapters')}
        >
          Chapters
        </button>
        <button
          id="study-subtab-pyqs"
          type="button"
          role="tab"
          aria-selected={subTab === 'pyqs'}
          className={`ios-segmented-btn ${subTab === 'pyqs' ? 'ios-segmented-btn--active' : ''}`}
          onClick={() => setSubTab('pyqs')}
        >
          PYQs
        </button>
        <button
          id="study-subtab-doubts"
          type="button"
          role="tab"
          aria-selected={subTab === 'doubts'}
          className={`ios-segmented-btn ${subTab === 'doubts' ? 'ios-segmented-btn--active' : ''}`}
          onClick={() => setSubTab('doubts')}
        >
          Doubts{openDoubtTotal > 0 ? ` (${openDoubtTotal})` : ''}
        </button>
      </div>

      {/* ========================== CHAPTERS SUB-VIEW ========================== */}
      {subTab === 'chapters' && (
        <>
          {/* Subject Overview Cards */}
          <div className="subject-card-grid" role="tablist" aria-label="Select PCB subject">
            {subjectStats.map(({ subj, total, started, avgPercent }) => {
              const active = selectedSubject === subj.id;
              return (
                <button
                  key={subj.id}
                  id={`subject-card-${subj.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`subject-card ${active ? 'subject-card--active' : ''}`}
                  onClick={() => setSelectedSubject(subj.id)}
                >
                  <div className="row-between" style={{ width: '100%' }}>
                    <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                    <span className="subject-card-pct">{avgPercent}%</span>
                  </div>
                  <div className="subject-card-name">{subj.name}</div>
                  <div className="study-progress-track" style={{ width: '100%' }}>
                    <div
                      className={`study-progress-fill study-progress-fill--${subj.colorToken}`}
                      style={{ width: `${avgPercent}%` }}
                    />
                  </div>
                  <div className="subject-card-sub">
                    {started}/{total} ch
                  </div>
                </button>
              );
            })}
          </div>

          {/* Untagged Learning Inbox */}
          {untaggedLearningItems.length > 0 && (
            <section className="ios-group" aria-label="Untagged learning items">
              <button
                type="button"
                className="disclosure-trigger"
                aria-expanded={showUntagged}
                onClick={() => setShowUntagged((v) => !v)}
              >
                <span className="disclosure-left">
                  {showUntagged ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <Tag size={13} />
                  Needs Chapter Tag ({untaggedLearningItems.length})
                </span>
                <span className="ios-group-count">Tap to assign</span>
              </button>

              {showUntagged && (
                <div className="ios-list">
                  {untaggedLearningItems.map((item) => {
                    const isEditing = editingUntaggedId === `${item.targetType}-${item.id}`;
                    return (
                      <div
                        key={`${item.targetType}-${item.id}`}
                        className="ios-row ios-row--flush"
                        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                      >
                        <div className="row-between">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 550 }}>{item.title}</div>
                            <div className="log-meta-note">{item.meta}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn--tinted btn--sm btn--pill"
                            onClick={() => {
                              const key = `${item.targetType}-${item.id}`;
                              if (isEditing) {
                                setEditingUntaggedId(null);
                              } else {
                                setEditingUntaggedId(key);
                                setUntaggedDraft({ subjectId: selectedSubject });
                              }
                            }}
                          >
                            {isEditing ? 'Cancel' : 'Tag'}
                          </button>
                        </div>

                        {isEditing && (
                          <div className="stack-sm">
                            <ChapterPickerControl
                              subjectId={untaggedDraft.subjectId}
                              chapterId={untaggedDraft.chapterId}
                              includeArchived={studySettings.showArchivedNcert}
                              compact
                              onChange={setUntaggedDraft}
                            />
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={!untaggedDraft.chapterId}
                              onClick={() => {
                                assignItemChapter(
                                  item.targetType,
                                  item.id,
                                  untaggedDraft.subjectId,
                                  untaggedDraft.chapterId
                                );
                                setEditingUntaggedId(null);
                                showToast('Assigned to NCERT chapter', 'success');
                              }}
                            >
                              Save Chapter Tag
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Class Filter + Search */}
          <div className="stack-sm">
            <div className="row-gap">
              <div className="ios-segmented" style={{ flex: 1 }}>
                {(['all', 11, 12] as const).map((lvl) => (
                  <button
                    key={String(lvl)}
                    type="button"
                    className={`ios-segmented-btn ${
                      classFilter === lvl ? 'ios-segmented-btn--active' : ''
                    }`}
                    onClick={() => setClassFilter(lvl)}
                  >
                    {lvl === 'all' ? 'All Classes' : `Class ${lvl}`}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={15}
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
                type="search"
                className="ios-input"
                style={{ paddingLeft: 36, paddingTop: 10, paddingBottom: 10, fontSize: 14.5 }}
                placeholder={`Filter ${getSubjectMeta(selectedSubject).name} chapters…`}
                value={chapterQuery}
                onChange={(e) => setChapterQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Class 11 & Class 12 Chapter Groups */}
          {groupedChapters.c11.length > 0 && (
            <section className="ios-group" aria-label="Class 11 chapters">
              <div className="ios-group-header">
                <h2 className="ios-group-title">
                  {getSubjectMeta(selectedSubject).name} · Class 11
                </h2>
                <span className="ios-group-count">{groupedChapters.c11.length} chapters</span>
              </div>
              <div className="ios-list">{groupedChapters.c11.map(renderChapterRow)}</div>
            </section>
          )}

          {groupedChapters.c12.length > 0 && (
            <section className="ios-group" aria-label="Class 12 chapters">
              <div className="ios-group-header">
                <h2 className="ios-group-title">
                  {getSubjectMeta(selectedSubject).name} · Class 12
                </h2>
                <span className="ios-group-count">{groupedChapters.c12.length} chapters</span>
              </div>
              <div className="ios-list">{groupedChapters.c12.map(renderChapterRow)}</div>
            </section>
          )}

          {visibleChapters.length === 0 && (
            <div className="ios-card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <BookOpen size={20} />
                </div>
                <p className="empty-state-title">No chapters match “{chapterQuery}”</p>
                <p className="empty-state-subtitle">
                  Try clearing your search or enabling Archived NCERT chapters above.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================== PYQs SUB-VIEW (PHYSICS & CHEMISTRY) ========================== */}
      {subTab === 'pyqs' && (
        <>
          <section className="ios-card">
            <div className="row-between">
              <div className="ios-segmented" role="tablist" aria-label="PYQ Subject">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pyqSubject === 'physics'}
                  className={`ios-segmented-btn ${
                    pyqSubject === 'physics' ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setPyqSubject('physics')}
                >
                  Physics
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pyqSubject === 'chemistry'}
                  className={`ios-segmented-btn ${
                    pyqSubject === 'chemistry' ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setPyqSubject('chemistry')}
                >
                  Chemistry
                </button>
              </div>

              <button
                type="button"
                className="log-meta-note"
                style={{ color: 'var(--accent-blue)' }}
                onClick={() => setShowPyqRangeEditor((v) => !v)}
              >
                {studySettings.pyqYearStart}–{studySettings.pyqYearEnd}
              </button>
            </div>

            {showPyqRangeEditor && (
              <div className="row-gap" style={{ paddingTop: 2 }}>
                <label className="field-label" style={{ flex: 1 }}>
                  From Year
                  <input
                    type="number"
                    min={1988}
                    max={2035}
                    className="ios-input"
                    style={{ padding: '8px 10px', fontSize: 14 }}
                    value={studySettings.pyqYearStart}
                    onChange={(e) =>
                      updateStudySettings({ pyqYearStart: Number(e.target.value) || 2013 })
                    }
                  />
                </label>
                <label className="field-label" style={{ flex: 1 }}>
                  To Year
                  <input
                    type="number"
                    min={1988}
                    max={2035}
                    className="ios-input"
                    style={{ padding: '8px 10px', fontSize: 14 }}
                    value={studySettings.pyqYearEnd}
                    onChange={(e) =>
                      updateStudySettings({ pyqYearEnd: Number(e.target.value) || 2026 })
                    }
                  />
                </label>
              </div>
            )}

            <div className="stack-sm" style={{ gap: 6 }}>
              <div className="row-between">
                <span className="field-hint">
                  {getSubjectMeta(pyqSubject).name} PYQ Matrix ({pyqSubjectTotals.done}/
                  {pyqSubjectTotals.total} chapter-years)
                </span>
                <span className="chapter-pct-pill">{pyqSubjectTotals.pct}%</span>
              </div>
              <div className="study-progress-track" style={{ height: 7 }}>
                <div
                  className={`study-progress-fill study-progress-fill--${
                    getSubjectMeta(pyqSubject).colorToken
                  }`}
                  style={{ width: `${pyqSubjectTotals.pct}%` }}
                />
              </div>
            </div>
          </section>

          <div className="stack-sm">
            <div className="ios-segmented">
              {(['all', 11, 12] as const).map((lvl) => (
                <button
                  key={String(lvl)}
                  type="button"
                  className={`ios-segmented-btn ${
                    classFilter === lvl ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setClassFilter(lvl)}
                >
                  {lvl === 'all' ? 'All Classes' : `Class ${lvl}`}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={15}
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
                type="search"
                className="ios-input"
                style={{ paddingLeft: 36, paddingTop: 10, paddingBottom: 10, fontSize: 14.5 }}
                placeholder={`Filter ${getSubjectMeta(pyqSubject).name} chapters…`}
                value={chapterQuery}
                onChange={(e) => setChapterQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="stack-md">
            {visiblePyqChapters.map((ch) => {
              const prog = chapterProgress[ch.id];
              const checkedYears = prog?.completedPyqYears ?? [];
              const checkedInRange = checkedYears.filter((y) => pyqYears.includes(y));
              const allDone =
                pyqYears.length > 0 && checkedInRange.length === pyqYears.length;
              const isScoring = evaluatingChapterIds.includes(ch.id);

              return (
                <section key={ch.id} className="ios-card" style={{ gap: 10 }}>
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      style={{ textAlign: 'left', flex: 1 }}
                      onClick={() => setActiveChapterId(ch.id)}
                    >
                      <div className="log-meta-note">
                        Class {ch.classLevel} · Ch {ch.chapterNumber}
                        {ch.archived ? ' · Archived' : ''} · Coverage {prog?.coveragePercent ?? 0}%
                        {isScoring ? ' (updating…)' : ''}
                      </div>
                      <div style={{ fontSize: 15.5, fontWeight: 620, marginTop: 2 }}>
                        {ch.title}
                      </div>
                    </button>

                    <div className="row-gap" style={{ gap: 6 }}>
                      <span className="ios-group-count">
                        {checkedInRange.length}/{pyqYears.length}
                      </span>
                      <button
                        type="button"
                        className="bucket-chip"
                        onClick={() => setChapterPyqYears(ch.id, allDone ? [] : pyqYears)}
                      >
                        {allDone ? 'Clear' : 'All'}
                      </button>
                    </div>
                  </div>

                  <div className="pyq-grid" role="group" aria-label={`PYQ years for ${ch.title}`}>
                    {pyqYears.map((year) => {
                      const isDone = checkedYears.includes(year);
                      return (
                        <button
                          key={year}
                          type="button"
                          aria-pressed={isDone}
                          className={`pyq-pill ${isDone ? 'pyq-pill--checked' : ''}`}
                          onClick={() => toggleChapterPyqYear(ch.id, year)}
                        >
                          {isDone && <Check size={11} strokeWidth={3} />}
                          <span>{year}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ========================== DOUBTS SUB-VIEW ========================== */}
      {subTab === 'doubts' && (
        <>
          <button
            id="study-new-doubt-btn"
            type="button"
            className="btn btn--primary btn--full"
            onClick={() => {
              setComposerDefaultChapter({
                subjectId: doubtSubjectFilter === 'all' ? selectedSubject : doubtSubjectFilter,
                chapterId: doubtChapterFilter ?? undefined,
              });
              setShowDoubtComposer(true);
            }}
          >
            <Camera size={17} />
            New Doubt / Snap PYQ Photo
          </button>

          <div className="stack-sm">
            <div className="ios-segmented" role="tablist" aria-label="Filter doubts by status">
              {(['open', 'resolved', 'all'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={doubtStatusFilter === status}
                  className={`ios-segmented-btn ${
                    doubtStatusFilter === status ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setDoubtStatusFilter(status)}
                >
                  {status === 'open' ? 'Open' : status === 'resolved' ? 'Resolved' : 'All'}
                </button>
              ))}
            </div>

            <div className="filter-strip" aria-label="Filter doubts by subject">
              <button
                type="button"
                className={`filter-pill ${doubtSubjectFilter === 'all' ? 'filter-pill--active' : ''}`}
                onClick={() => {
                  setDoubtSubjectFilter('all');
                  setDoubtChapterFilter(null);
                }}
              >
                All Subjects
              </button>
              {STUDY_SUBJECTS.map((subj) => {
                const active = doubtSubjectFilter === subj.id;
                return (
                  <button
                    key={subj.id}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => {
                      setDoubtSubjectFilter(subj.id);
                      setDoubtChapterFilter(null);
                    }}
                  >
                    <span
                      className={`cat-dot cat-swatch--${subj.colorToken}`}
                      style={active ? { background: '#ffffff' } : undefined}
                    />
                    {subj.name}
                  </button>
                );
              })}
            </div>

            {doubtChapterFilter && (
              <div className="ios-banner ios-banner--info" style={{ alignItems: 'center' }}>
                <Layers size={14} />
                <span style={{ flex: 1 }}>
                  Filtered to chapter: <strong>{getChapterById(doubtChapterFilter)?.title}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm btn--pill"
                  onClick={() => setDoubtChapterFilter(null)}
                >
                  Clear
                </button>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <Search
                size={15}
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
                type="search"
                className="ios-input"
                style={{ paddingLeft: 36, paddingTop: 10, paddingBottom: 10, fontSize: 14.5 }}
                placeholder="Search doubts, formulas, or chapters…"
                value={doubtSearch}
                onChange={(e) => setDoubtSearch(e.target.value)}
              />
            </div>
          </div>

          {groupedDoubts.length > 0 ? (
            groupedDoubts.map((group) => {
              const subj = getSubjectMeta(group.subjectId);
              return (
                <section key={group.key} className="ios-group">
                  <div className="ios-group-header">
                    <h2 className="ios-group-title row-gap" style={{ gap: 6 }}>
                      <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                      {subj.shortName}
                      {group.chapter
                        ? ` Cl.${group.chapter.classLevel} · ${group.chapter.title}`
                        : ' · General'}
                    </h2>
                    <span className="ios-group-count">{group.items.length}</span>
                  </div>

                  <div className="ios-list">
                    {group.items.map((item) => (
                      <div key={item.id} className="ios-row ios-row--flush" style={{ alignItems: 'flex-start' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ marginTop: 1 }}
                          aria-label={
                            item.status === 'resolved'
                              ? `Reopen "${item.title}"`
                              : `Mark "${item.title}" resolved`
                          }
                          onClick={() => toggleDoubtStatus(item.id)}
                        >
                          {item.status === 'resolved' ? (
                            <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />
                          ) : (
                            <Circle size={18} style={{ color: 'var(--text-tertiary)' }} />
                          )}
                        </button>

                        <button
                          type="button"
                          style={{ flex: 1, textAlign: 'left', minWidth: 0 }}
                          onClick={() => setActiveDoubtId(item.id)}
                        >
                          <div
                            className={`log-entry-title ${
                              item.status === 'resolved' ? 'task-title--done' : ''
                            }`}
                          >
                            {item.title}
                          </div>
                          {item.questionText && item.questionText !== item.title && (
                            <div className="doubt-preview-text">{item.questionText}</div>
                          )}
                          <div className="log-entry-meta" style={{ marginTop: 6 }}>
                            {item.pyqYear && (
                              <span className="bucket-chip">PYQ {item.pyqYear}</span>
                            )}
                            {item.imageDataUrl && (
                              <span className="log-meta-note row-gap" style={{ gap: 4 }}>
                                <ImageIcon size={12} />
                                Photo
                              </span>
                            )}
                            {item.aiExplanation && (
                              <span className="log-meta-note row-gap" style={{ gap: 4 }}>
                                <Sparkles size={12} />
                                Explained
                              </span>
                            )}
                            {item.resolutionNote && (
                              <span className="log-meta-note">Has takeaway</span>
                            )}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="ios-card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <HelpCircle size={20} />
                </div>
                <p className="empty-state-title">
                  {doubts.length === 0 ? 'No doubts saved yet' : 'No matching doubts'}
                </p>
                <p className="empty-state-subtitle">
                  {doubts.length === 0
                    ? 'Snap a PYQ question photo above or mention a doubt in Today’s Brain Dump.'
                    : 'Try switching status between Open/Resolved or clearing filters.'}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Sheets */}
      <ChapterDetailSheet
        chapter={activeChapter}
        onClose={() => setActiveChapterId(null)}
        onOpenChapterDoubts={handleOpenChapterDoubts}
      />

      <DoubtComposerSheet
        open={showDoubtComposer}
        defaultSubjectId={composerDefaultChapter.subjectId}
        defaultChapterId={composerDefaultChapter.chapterId}
        onClose={() => setShowDoubtComposer(false)}
      />

      <DoubtDetailSheet doubt={activeDoubt} onClose={() => setActiveDoubtId(null)} />
    </>
  );
};
