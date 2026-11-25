import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
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
import {
  DoubtItem,
  MISTAKE_TYPES,
  MISTAKE_TYPE_META,
  MistakeItem,
  MistakeType,
} from '../types/models';
import { ChapterSummaryScope } from '../services/gemini';
import { useStrike } from '../state/StrikeContext';
import { ChapterDetailSheet } from '../components/ChapterDetailSheet';
import { ChapterPickerControl } from '../components/ChapterPickerControl';
import { ChapterSummarySheet } from '../components/ChapterSummarySheet';
import { DoubtComposerSheet } from '../components/DoubtComposerSheet';
import { DoubtDetailSheet } from '../components/DoubtDetailSheet';
import {
  MistakeComposerPrefill,
  MistakeComposerSheet,
} from '../components/MistakeComposerSheet';
import { MistakeDetailSheet } from '../components/MistakeDetailSheet';

type StudySubTab = 'chapters' | 'pyqs' | 'doubts' | 'mistakes';
type ItemsViewMode = 'list' | 'chapters';

export const StudyView: React.FC = () => {
  const {
    logs,
    tasks,
    chapterProgress,
    doubts,
    mistakes,
    studySettings,
    evaluatingChapterIds,
    updateStudySettings,
    toggleChapterPyqYear,
    setChapterPyqYears,
    assignItemChapter,
    toggleDoubtStatus,
    toggleMistakeStatus,
    incrementMistakeRepeat,
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

  // Doubts filters & view mode
  const [doubtViewMode, setDoubtViewMode] = useState<ItemsViewMode>('list');
  const [doubtStatusFilter, setDoubtStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [doubtSubjectFilter, setDoubtSubjectFilter] = useState<'all' | StudySubjectId>('all');
  const [doubtChapterFilter, setDoubtChapterFilter] = useState<string | null>(null);
  const [doubtSearch, setDoubtSearch] = useState('');

  // Mistakes filters & view mode
  const [mistakeViewMode, setMistakeViewMode] = useState<ItemsViewMode>('list');
  const [mistakeStatusFilter, setMistakeStatusFilter] = useState<'active' | 'fixed' | 'all'>(
    'active'
  );
  const [mistakeSubjectFilter, setMistakeSubjectFilter] = useState<'all' | StudySubjectId>('all');
  const [mistakeTypeFilter, setMistakeTypeFilter] = useState<'all' | MistakeType>('all');
  const [mistakeChapterFilter, setMistakeChapterFilter] = useState<string | null>(null);
  const [mistakeSearch, setMistakeSearch] = useState('');

  // Sheets
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [showDoubtComposer, setShowDoubtComposer] = useState(false);
  const [composerDefaultChapter, setComposerDefaultChapter] = useState<{
    subjectId: StudySubjectId;
    chapterId?: string;
  }>({ subjectId: 'physics' });
  const [activeDoubtId, setActiveDoubtId] = useState<string | null>(null);

  const [showMistakeComposer, setShowMistakeComposer] = useState(false);
  const [mistakeComposerDefault, setMistakeComposerDefault] = useState<{
    subjectId: StudySubjectId;
    chapterId?: string;
  }>({ subjectId: 'physics' });
  const [mistakeComposerPrefill, setMistakeComposerPrefill] =
    useState<MistakeComposerPrefill | null>(null);
  const [activeMistakeId, setActiveMistakeId] = useState<string | null>(null);

  const [summaryTarget, setSummaryTarget] = useState<{
    chapterId: string;
    scope: ChapterSummaryScope;
  } | null>(null);

  const activeChapter = useMemo(
    () => getChapterById(activeChapterId) ?? null,
    [activeChapterId]
  );

  const activeDoubt = useMemo(
    () => doubts.find((d) => d.id === activeDoubtId) ?? null,
    [doubts, activeDoubtId]
  );

  const activeMistake = useMemo(
    () => mistakes.find((m) => m.id === activeMistakeId) ?? null,
    [mistakes, activeMistakeId]
  );

  const summaryChapter = useMemo(
    () => (summaryTarget ? getChapterById(summaryTarget.chapterId) ?? null : null),
    [summaryTarget]
  );

  const pyqYears = useMemo(
    () => getPyqYearsRange(studySettings.pyqYearStart, studySettings.pyqYearEnd),
    [studySettings.pyqYearStart, studySettings.pyqYearEnd]
  );

  // Per-chapter completed learning log counts, open doubt counts & active mistake counts
  const { logsByChapter, openDoubtsByChapter, activeMistakesByChapter, untaggedLearningItems } =
    useMemo(() => {
      const logCounts = new Map<string, number>();
      const doubtCounts = new Map<string, number>();
      const mistakeCounts = new Map<string, number>();
      const untagged: Array<{
        targetType: 'task' | 'log';
        id: string;
        title: string;
        meta: string;
      }> = [];

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
            meta: `Plan · ${
              task.bucket === 'today' ? 'Today' : task.bucket === 'tomorrow' ? 'Tomorrow' : 'Later'
            }`,
          });
        }
      }

      for (const d of doubts) {
        if (d.status === 'open' && d.chapterId) {
          doubtCounts.set(d.chapterId, (doubtCounts.get(d.chapterId) ?? 0) + 1);
        }
      }

      for (const m of mistakes) {
        if (m.status === 'active' && m.chapterId) {
          mistakeCounts.set(m.chapterId, (mistakeCounts.get(m.chapterId) ?? 0) + 1);
        }
      }

      return {
        logsByChapter: logCounts,
        openDoubtsByChapter: doubtCounts,
        activeMistakesByChapter: mistakeCounts,
        untaggedLearningItems: untagged,
      };
    }, [logs, tasks, doubts, mistakes]);

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

  // Filtered & chapter-grouped Doubts + Chapter Summary Cards
  const { openDoubtTotal, groupedDoubts, doubtChapterCards } = useMemo(() => {
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
      { key: string; subjectId: StudySubjectId; chapter?: NcertChapter; items: DoubtItem[] }
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

    // Chapter overview cards (use subject & search filter, include both open & resolved counts)
    const chapterMap = new Map<
      string,
      {
        chapter: NcertChapter;
        openCount: number;
        resolvedCount: number;
        takeawayCount: number;
        total: number;
      }
    >();
    for (const d of doubts) {
      if (doubtSubjectFilter !== 'all' && d.subjectId !== doubtSubjectFilter) continue;
      if (doubtChapterFilter && d.chapterId !== doubtChapterFilter) continue;
      const chap = getChapterById(d.chapterId);
      if (!chap) continue;
      if (q) {
        const hay = `${d.title} ${d.questionText} ${d.resolutionNote} ${chap.title}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const curr = chapterMap.get(chap.id) ?? {
        chapter: chap,
        openCount: 0,
        resolvedCount: 0,
        takeawayCount: 0,
        total: 0,
      };
      curr.total += 1;
      if (d.status === 'open') curr.openCount += 1;
      else curr.resolvedCount += 1;
      if (d.resolutionNote.trim()) curr.takeawayCount += 1;
      chapterMap.set(chap.id, curr);
    }

    const cards = Array.from(chapterMap.values()).sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      return b.total - a.total;
    });

    return {
      openDoubtTotal: openCount,
      groupedDoubts: Array.from(groups.values()),
      doubtChapterCards: cards,
    };
  }, [doubts, doubtStatusFilter, doubtSubjectFilter, doubtChapterFilter, doubtSearch]);

  // Filtered & chapter-grouped Mistakes + Chapter Summary Cards
  const { activeMistakeTotal, groupedMistakes, mistakeChapterCards } = useMemo(() => {
    const activeCount = mistakes.filter((m) => m.status === 'active').length;
    const q = mistakeSearch.trim().toLowerCase();

    const filtered = mistakes.filter((m) => {
      if (mistakeStatusFilter !== 'all' && m.status !== mistakeStatusFilter) return false;
      if (mistakeSubjectFilter !== 'all' && m.subjectId !== mistakeSubjectFilter) return false;
      if (mistakeTypeFilter !== 'all' && m.mistakeType !== mistakeTypeFilter) return false;
      if (mistakeChapterFilter && m.chapterId !== mistakeChapterFilter) return false;
      if (q) {
        const ch = getChapterById(m.chapterId);
        const hay = `${m.title} ${m.mistakeText} ${m.correctionNote} ${m.sourceLabel ?? ''} ${
          ch?.title ?? ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const groups = new Map<
      string,
      { key: string; subjectId: StudySubjectId; chapter?: NcertChapter; items: MistakeItem[] }
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

    // Per-chapter overview cards for Mistakes
    const chapterMap = new Map<
      string,
      {
        chapter: NcertChapter;
        activeCount: number;
        fixedCount: number;
        totalHits: number;
        typeCounts: Partial<Record<MistakeType, number>>;
        total: number;
      }
    >();
    for (const m of mistakes) {
      if (mistakeSubjectFilter !== 'all' && m.subjectId !== mistakeSubjectFilter) continue;
      if (mistakeTypeFilter !== 'all' && m.mistakeType !== mistakeTypeFilter) continue;
      if (mistakeChapterFilter && m.chapterId !== mistakeChapterFilter) continue;
      const chap = getChapterById(m.chapterId);
      if (!chap) continue;
      if (q) {
        const hay = `${m.title} ${m.mistakeText} ${m.correctionNote} ${m.sourceLabel ?? ''} ${
          chap.title
        }`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const curr = chapterMap.get(chap.id) ?? {
        chapter: chap,
        activeCount: 0,
        fixedCount: 0,
        totalHits: 0,
        typeCounts: {},
        total: 0,
      };
      curr.total += 1;
      if (m.status === 'active') curr.activeCount += 1;
      else curr.fixedCount += 1;
      curr.totalHits += m.repeatCount;
      curr.typeCounts[m.mistakeType] = (curr.typeCounts[m.mistakeType] ?? 0) + 1;
      chapterMap.set(chap.id, curr);
    }

    const cards = Array.from(chapterMap.values()).sort((a, b) => {
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
      if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
      return b.total - a.total;
    });

    return {
      activeMistakeTotal: activeCount,
      groupedMistakes: Array.from(groups.values()),
      mistakeChapterCards: cards,
    };
  }, [
    mistakes,
    mistakeStatusFilter,
    mistakeSubjectFilter,
    mistakeTypeFilter,
    mistakeChapterFilter,
    mistakeSearch,
  ]);

  const handleOpenChapterDoubts = (chapter: NcertChapter) => {
    setActiveChapterId(null);
    setSubTab('doubts');
    setDoubtViewMode('list');
    setDoubtSubjectFilter(chapter.subjectId);
    setDoubtChapterFilter(chapter.id);
    setDoubtStatusFilter('all');
  };

  const handleOpenChapterMistakes = (chapter: NcertChapter) => {
    setActiveChapterId(null);
    setSubTab('mistakes');
    setMistakeViewMode('list');
    setMistakeSubjectFilter(chapter.subjectId);
    setMistakeChapterFilter(chapter.id);
    setMistakeStatusFilter('all');
  };

  const handleOpenChapterSummary = (chapter: NcertChapter, scope: ChapterSummaryScope) => {
    setActiveChapterId(null);
    setSummaryTarget({ chapterId: chapter.id, scope });
  };

  const handleConvertDoubtToMistake = (doubt: DoubtItem) => {
    setActiveDoubtId(null);
    setMistakeComposerDefault({
      subjectId: doubt.subjectId,
      chapterId: doubt.chapterId,
    });
    setMistakeComposerPrefill({
      subjectId: doubt.subjectId,
      chapterId: doubt.chapterId,
      title: doubt.title,
      mistakeText: doubt.questionText,
      correctionNote: doubt.resolutionNote,
      mistakeType: 'conceptual',
      sourceLabel: doubt.pyqYear ? `PYQ ${doubt.pyqYear}` : undefined,
      linkedDoubtId: doubt.id,
      source: 'from_doubt',
    });
    setShowMistakeComposer(true);
  };

  const renderChapterRow = (chapter: NcertChapter) => {
    const subj = getSubjectMeta(chapter.subjectId);
    const prog = chapterProgress[chapter.id];
    const pct = prog?.coveragePercent ?? 0;
    const logCount = logsByChapter.get(chapter.id) ?? 0;
    const pyqCount = (prog?.completedPyqYears ?? []).filter((y) => pyqYears.includes(y)).length;
    const chapDoubtCount = openDoubtsByChapter.get(chapter.id) ?? 0;
    const chapMistakeCount = activeMistakesByChapter.get(chapter.id) ?? 0;
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
          {chapMistakeCount > 0 && (
            <span style={{ color: 'var(--accent-amber)' }}>
              {chapMistakeCount} {chapMistakeCount === 1 ? 'mistake' : 'mistakes'}
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

      {/* Primary Sub-Navigation: Chapters | PYQs | Doubts | Mistakes */}
      <div
        className="ios-segmented ios-segmented--compact"
        role="tablist"
        aria-label="Study sections"
      >
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
        <button
          id="study-subtab-mistakes"
          type="button"
          role="tab"
          aria-selected={subTab === 'mistakes'}
          className={`ios-segmented-btn ${subTab === 'mistakes' ? 'ios-segmented-btn--active' : ''}`}
          onClick={() => setSubTab('mistakes')}
        >
          Mistakes{activeMistakeTotal > 0 ? ` (${activeMistakeTotal})` : ''}
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
            {/* View Mode Toggle: List vs By Chapter Summary */}
            <div className="row-between" style={{ gap: 8 }}>
              <div className="ios-segmented" style={{ flex: 1 }} role="tablist" aria-label="Doubts view mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={doubtViewMode === 'list'}
                  className={`ios-segmented-btn ${
                    doubtViewMode === 'list' ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setDoubtViewMode('list')}
                >
                  List
                </button>
                <button
                  id="doubts-view-by-chapter"
                  type="button"
                  role="tab"
                  aria-selected={doubtViewMode === 'chapters'}
                  className={`ios-segmented-btn ${
                    doubtViewMode === 'chapters' ? 'ios-segmented-btn--active' : ''
                  }`}
                  onClick={() => setDoubtViewMode('chapters')}
                >
                  By Chapter
                </button>
              </div>
            </div>

            {doubtViewMode === 'list' && (
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
            )}

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

          {doubtViewMode === 'chapters' ? (
            doubtChapterCards.length > 0 ? (
              <div className="stack-md">
                {doubtChapterCards.map((card) => {
                  const subj = getSubjectMeta(card.chapter.subjectId);
                  const cachedSummary = chapterProgress[card.chapter.id]?.doubtsSummaryAi;
                  return (
                    <button
                      key={card.chapter.id}
                      type="button"
                      className="chapter-summary-card"
                      onClick={() =>
                        setSummaryTarget({ chapterId: card.chapter.id, scope: 'doubts' })
                      }
                    >
                      <div className="row-between" style={{ width: '100%', alignItems: 'flex-start' }}>
                        <div className="stack-sm" style={{ gap: 2, textAlign: 'left', minWidth: 0 }}>
                          <span className="log-meta-note row-gap" style={{ gap: 5 }}>
                            <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                            {subj.name} · Class {card.chapter.classLevel} · Ch{' '}
                            {card.chapter.chapterNumber}
                          </span>
                          <span style={{ fontSize: 15.5, fontWeight: 620, color: 'var(--text-primary)' }}>
                            {card.chapter.title}
                          </span>
                        </div>
                        <span className="chapter-summary-link-pill">
                          <FileText size={12} />
                          Summary
                        </span>
                      </div>

                      <div className="chapter-row-meta">
                        <span style={{ color: 'var(--accent-coral)' }}>
                          {card.openCount} open
                        </span>
                        <span style={{ color: 'var(--accent-green)' }}>
                          {card.resolvedCount} resolved
                        </span>
                        <span>
                          {card.takeawayCount} {card.takeawayCount === 1 ? 'takeaway' : 'takeaways'}
                        </span>
                      </div>

                      {cachedSummary && (
                        <div className="study-ai-note" style={{ textAlign: 'left' }}>
                          <Sparkles
                            size={12}
                            style={{ flexShrink: 0, marginTop: 3, color: 'var(--accent-blue)' }}
                          />
                          <span className="doubt-preview-text" style={{ marginTop: 0 }}>
                            {cachedSummary}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ios-card">
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <HelpCircle size={20} />
                  </div>
                  <p className="empty-state-title">
                    {doubts.length === 0 ? 'No doubts saved yet' : 'No matching chapters'}
                  </p>
                  <p className="empty-state-subtitle">
                    {doubts.length === 0
                      ? 'Snap a PYQ question photo above or mention a doubt in Today’s Brain Dump.'
                      : 'Try clearing your subject or search filter.'}
                  </p>
                </div>
              </div>
            )
          ) : groupedDoubts.length > 0 ? (
            groupedDoubts.map((group) => {
              const subj = getSubjectMeta(group.subjectId);
              return (
                <section key={group.key} className="ios-group">
                  <div className="ios-group-header">
                    <h2 className="ios-group-title row-gap" style={{ gap: 6, minWidth: 0 }}>
                      <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {subj.shortName}
                        {group.chapter
                          ? ` Cl.${group.chapter.classLevel} · ${group.chapter.title}`
                          : ' · General'}
                      </span>
                    </h2>
                    <div className="row-gap" style={{ gap: 8, flexShrink: 0 }}>
                      {group.chapter && (
                        <button
                          type="button"
                          className="chapter-summary-link-pill"
                          aria-label={`Summary for ${group.chapter.title} doubts`}
                          onClick={() =>
                            setSummaryTarget({ chapterId: group.chapter!.id, scope: 'doubts' })
                          }
                        >
                          <FileText size={11} />
                          Summary
                        </button>
                      )}
                      <span className="ios-group-count">{group.items.length}</span>
                    </div>
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

      {/* ========================== MISTAKES SUB-VIEW ========================== */}
      {subTab === 'mistakes' && (
        <>
          <button
            id="study-new-mistake-btn"
            type="button"
            className="btn btn--primary btn--full"
            onClick={() => {
              setMistakeComposerPrefill(null);
              setMistakeComposerDefault({
                subjectId: mistakeSubjectFilter === 'all' ? selectedSubject : mistakeSubjectFilter,
                chapterId: mistakeChapterFilter ?? undefined,
              });
              setShowMistakeComposer(true);
            }}
          >
            <Plus size={17} />
            Log Mistake / Quick Fill with Gemini
          </button>

          <div className="stack-sm">
            {/* View Mode Toggle: List vs By Chapter Summary */}
            <div className="ios-segmented" role="tablist" aria-label="Mistakes view mode">
              <button
                type="button"
                role="tab"
                aria-selected={mistakeViewMode === 'list'}
                className={`ios-segmented-btn ${
                  mistakeViewMode === 'list' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setMistakeViewMode('list')}
              >
                List
              </button>
              <button
                id="mistakes-view-by-chapter"
                type="button"
                role="tab"
                aria-selected={mistakeViewMode === 'chapters'}
                className={`ios-segmented-btn ${
                  mistakeViewMode === 'chapters' ? 'ios-segmented-btn--active' : ''
                }`}
                onClick={() => setMistakeViewMode('chapters')}
              >
                By Chapter
              </button>
            </div>

            {mistakeViewMode === 'list' && (
              <div className="ios-segmented" role="tablist" aria-label="Filter mistakes by status">
                {(['active', 'fixed', 'all'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="tab"
                    aria-selected={mistakeStatusFilter === status}
                    className={`ios-segmented-btn ${
                      mistakeStatusFilter === status ? 'ios-segmented-btn--active' : ''
                    }`}
                    onClick={() => setMistakeStatusFilter(status)}
                  >
                    {status === 'active' ? 'Active' : status === 'fixed' ? 'Fixed' : 'All'}
                  </button>
                ))}
              </div>
            )}

            {/* Subject filter */}
            <div className="filter-strip" aria-label="Filter mistakes by subject">
              <button
                type="button"
                className={`filter-pill ${
                  mistakeSubjectFilter === 'all' ? 'filter-pill--active' : ''
                }`}
                onClick={() => {
                  setMistakeSubjectFilter('all');
                  setMistakeChapterFilter(null);
                }}
              >
                All Subjects
              </button>
              {STUDY_SUBJECTS.map((subj) => {
                const active = mistakeSubjectFilter === subj.id;
                return (
                  <button
                    key={subj.id}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => {
                      setMistakeSubjectFilter(subj.id);
                      setMistakeChapterFilter(null);
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

            {/* Mistake Type filter */}
            <div className="filter-strip" aria-label="Filter mistakes by type">
              <button
                type="button"
                className={`filter-pill ${mistakeTypeFilter === 'all' ? 'filter-pill--active' : ''}`}
                onClick={() => setMistakeTypeFilter('all')}
              >
                All Types
              </button>
              {MISTAKE_TYPES.map((typeKey) => {
                const meta = MISTAKE_TYPE_META[typeKey];
                const active = mistakeTypeFilter === typeKey;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                    onClick={() => setMistakeTypeFilter(typeKey)}
                  >
                    <span
                      className={`cat-dot cat-swatch--${meta.colorToken}`}
                      style={active ? { background: '#ffffff' } : undefined}
                    />
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>

            {mistakeChapterFilter && (
              <div className="ios-banner ios-banner--info" style={{ alignItems: 'center' }}>
                <Layers size={14} />
                <span style={{ flex: 1 }}>
                  Filtered to chapter: <strong>{getChapterById(mistakeChapterFilter)?.title}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm btn--pill"
                  onClick={() => setMistakeChapterFilter(null)}
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
                placeholder="Search mistakes, rules, mocks, or chapters…"
                value={mistakeSearch}
                onChange={(e) => setMistakeSearch(e.target.value)}
              />
            </div>
          </div>

          {mistakeViewMode === 'chapters' ? (
            mistakeChapterCards.length > 0 ? (
              <div className="stack-md">
                {mistakeChapterCards.map((card) => {
                  const subj = getSubjectMeta(card.chapter.subjectId);
                  const cachedSummary = chapterProgress[card.chapter.id]?.mistakesSummaryAi;
                  const topTypes = MISTAKE_TYPES.map((t) => ({
                    type: t,
                    count: card.typeCounts[t] ?? 0,
                  }))
                    .filter((entry) => entry.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);

                  return (
                    <button
                      key={card.chapter.id}
                      type="button"
                      className="chapter-summary-card"
                      onClick={() =>
                        setSummaryTarget({ chapterId: card.chapter.id, scope: 'mistakes' })
                      }
                    >
                      <div className="row-between" style={{ width: '100%', alignItems: 'flex-start' }}>
                        <div className="stack-sm" style={{ gap: 2, textAlign: 'left', minWidth: 0 }}>
                          <span className="log-meta-note row-gap" style={{ gap: 5 }}>
                            <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                            {subj.name} · Class {card.chapter.classLevel} · Ch{' '}
                            {card.chapter.chapterNumber}
                          </span>
                          <span style={{ fontSize: 15.5, fontWeight: 620, color: 'var(--text-primary)' }}>
                            {card.chapter.title}
                          </span>
                        </div>
                        <span className="chapter-summary-link-pill">
                          <FileText size={12} />
                          Summary
                        </span>
                      </div>

                      <div className="chapter-row-meta">
                        <span style={{ color: 'var(--accent-coral)' }}>
                          {card.activeCount} active
                        </span>
                        <span style={{ color: 'var(--accent-green)' }}>
                          {card.fixedCount} fixed
                        </span>
                        <span style={{ color: 'var(--accent-amber)' }}>
                          {card.totalHits}× total hits
                        </span>
                      </div>

                      {topTypes.length > 0 && (
                        <div className="summary-chip-row">
                          {topTypes.map(({ type, count }) => {
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

                      {cachedSummary && (
                        <div className="study-ai-note" style={{ textAlign: 'left' }}>
                          <Sparkles
                            size={12}
                            style={{ flexShrink: 0, marginTop: 3, color: 'var(--accent-blue)' }}
                          />
                          <span className="doubt-preview-text" style={{ marginTop: 0 }}>
                            {cachedSummary}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ios-card">
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <AlertTriangle size={20} />
                  </div>
                  <p className="empty-state-title">
                    {mistakes.length === 0 ? 'No mistakes logged yet' : 'No matching chapters'}
                  </p>
                  <p className="empty-state-subtitle">
                    {mistakes.length === 0
                      ? 'Log a mistake above or dump test errors in Today’s Brain Dump.'
                      : 'Try clearing your subject, type, or search filter.'}
                  </p>
                </div>
              </div>
            )
          ) : groupedMistakes.length > 0 ? (
            groupedMistakes.map((group) => {
              const subj = getSubjectMeta(group.subjectId);
              return (
                <section key={group.key} className="ios-group">
                  <div className="ios-group-header">
                    <h2 className="ios-group-title row-gap" style={{ gap: 6, minWidth: 0 }}>
                      <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {subj.shortName}
                        {group.chapter
                          ? ` Cl.${group.chapter.classLevel} · ${group.chapter.title}`
                          : ' · General'}
                      </span>
                    </h2>
                    <div className="row-gap" style={{ gap: 8, flexShrink: 0 }}>
                      {group.chapter && (
                        <button
                          type="button"
                          className="chapter-summary-link-pill"
                          aria-label={`Summary for ${group.chapter.title} mistakes`}
                          onClick={() =>
                            setSummaryTarget({ chapterId: group.chapter!.id, scope: 'mistakes' })
                          }
                        >
                          <FileText size={11} />
                          Summary
                        </button>
                      )}
                      <span className="ios-group-count">{group.items.length}</span>
                    </div>
                  </div>

                  <div className="ios-list">
                    {group.items.map((item) => {
                      const typeMeta = MISTAKE_TYPE_META[item.mistakeType];
                      return (
                        <div
                          key={item.id}
                          className="ios-row ios-row--flush"
                          style={{ alignItems: 'flex-start' }}
                        >
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ marginTop: 1 }}
                            aria-label={
                              item.status === 'fixed'
                                ? `Reopen "${item.title}"`
                                : `Mark "${item.title}" fixed`
                            }
                            onClick={() => toggleMistakeStatus(item.id)}
                          >
                            {item.status === 'fixed' ? (
                              <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />
                            ) : (
                              <Circle size={18} style={{ color: 'var(--text-tertiary)' }} />
                            )}
                          </button>

                          <button
                            type="button"
                            style={{ flex: 1, textAlign: 'left', minWidth: 0 }}
                            onClick={() => setActiveMistakeId(item.id)}
                          >
                            <div
                              className={`log-entry-title ${
                                item.status === 'fixed' ? 'task-title--done' : ''
                              }`}
                            >
                              {item.title}
                            </div>
                            {item.correctionNote ? (
                              <div className="cheat-sheet-rule" style={{ marginTop: 3 }}>
                                Rule: {item.correctionNote}
                              </div>
                            ) : (
                              item.mistakeText &&
                              item.mistakeText !== item.title && (
                                <div className="doubt-preview-text">{item.mistakeText}</div>
                              )
                            )}
                            <div className="log-entry-meta" style={{ marginTop: 6 }}>
                              <span className="mistake-type-chip">
                                <span className={`cat-dot cat-swatch--${typeMeta.colorToken}`} />
                                {typeMeta.shortLabel}
                              </span>
                              {item.sourceLabel && (
                                <span className="bucket-chip">{item.sourceLabel}</span>
                              )}
                              {item.source === 'brain_dump' && (
                                <span className="log-meta-note row-gap" style={{ gap: 3 }}>
                                  <Sparkles size={11} />
                                  Dump
                                </span>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            className={`repeat-chip-btn ${
                              item.repeatCount > 1 ? 'repeat-chip-btn--hot' : ''
                            }`}
                            aria-label={`Log repeat for "${item.title}" (${item.repeatCount} times)`}
                            title="Tap if you made this mistake again"
                            onClick={() => incrementMistakeRepeat(item.id)}
                          >
                            <RotateCcw size={11} />
                            <span>{item.repeatCount > 1 ? `${item.repeatCount}×` : '+1'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="ios-card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <AlertTriangle size={20} />
                </div>
                <p className="empty-state-title">
                  {mistakes.length === 0 ? 'No mistakes logged yet' : 'No matching mistakes'}
                </p>
                <p className="empty-state-subtitle">
                  {mistakes.length === 0
                    ? 'Tap above to log a mistake, paste test errors with Gemini, or dump them in Today’s Brain Dump.'
                    : 'Try switching status between Active/Fixed or clearing filters.'}
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
        onOpenChapterMistakes={handleOpenChapterMistakes}
        onOpenChapterSummary={handleOpenChapterSummary}
      />

      <DoubtComposerSheet
        open={showDoubtComposer}
        defaultSubjectId={composerDefaultChapter.subjectId}
        defaultChapterId={composerDefaultChapter.chapterId}
        onClose={() => setShowDoubtComposer(false)}
      />

      <DoubtDetailSheet
        doubt={activeDoubt}
        onClose={() => setActiveDoubtId(null)}
        onConvertToMistake={handleConvertDoubtToMistake}
      />

      <MistakeComposerSheet
        open={showMistakeComposer}
        defaultSubjectId={mistakeComposerDefault.subjectId}
        defaultChapterId={mistakeComposerDefault.chapterId}
        prefill={mistakeComposerPrefill}
        onClose={() => {
          setShowMistakeComposer(false);
          setMistakeComposerPrefill(null);
        }}
      />

      <MistakeDetailSheet mistake={activeMistake} onClose={() => setActiveMistakeId(null)} />

      <ChapterSummarySheet
        chapter={summaryChapter}
        initialScope={summaryTarget?.scope ?? 'mistakes'}
        onClose={() => setSummaryTarget(null)}
        onSelectMistake={(m) => {
          setSummaryTarget(null);
          setActiveMistakeId(m.id);
        }}
        onSelectDoubt={(d) => {
          setSummaryTarget(null);
          setActiveDoubtId(d.id);
        }}
        onAddMistake={(chap) => {
          setSummaryTarget(null);
          setMistakeComposerPrefill(null);
          setMistakeComposerDefault({ subjectId: chap.subjectId, chapterId: chap.id });
          setShowMistakeComposer(true);
        }}
        onAddDoubt={(chap) => {
          setSummaryTarget(null);
          setComposerDefaultChapter({ subjectId: chap.subjectId, chapterId: chap.id });
          setShowDoubtComposer(true);
        }}
      />
    </>
  );
};
