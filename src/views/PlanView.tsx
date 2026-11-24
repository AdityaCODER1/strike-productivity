import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import { StudySubjectId } from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { TaskBucket, TaskItem } from '../types/models';
import { toDateKey } from '../utils/date';
import { CategoryBadge } from '../components/CategoryBadge';
import { ChapterPickerControl, ChapterTagChip } from '../components/ChapterPickerControl';

export const PlanView: React.FC = () => {
  const {
    tasks,
    preferences,
    studySettings,
    syncStatus,
    addTask,
    updateTask,
    toggleTaskCompletion,
    moveTaskBucket,
    deleteTask,
  } = useStrike();

  const [draftTitle, setDraftTitle] = useState('');
  const [draftBucket, setDraftBucket] = useState<TaskBucket>('today');
  const [tagAsLearning, setTagAsLearning] = useState(false);
  const [draftSubjectId, setDraftSubjectId] = useState<StudySubjectId | undefined>(undefined);
  const [draftChapterId, setDraftChapterId] = useState<string | undefined>(undefined);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showCompletedToday, setShowCompletedToday] = useState(true);

  const todayKey = toDateKey();

  const { todayOpen, laterOpen, completedToday } = useMemo(() => {
    const tOpen: TaskItem[] = [];
    const lOpen: TaskItem[] = [];
    const doneToday: TaskItem[] = [];

    for (const task of tasks) {
      if (task.completed) {
        if (task.completedDateKey === todayKey) {
          doneToday.push(task);
        }
      } else if (task.bucket === 'today') {
        tOpen.push(task);
      } else {
        lOpen.push(task);
      }
    }

    doneToday.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { todayOpen: tOpen, laterOpen: lOpen, completedToday: doneToday };
  }, [tasks, todayKey]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    addTask(
      draftTitle,
      draftBucket,
      tagAsLearning ? 'Learning' : undefined,
      tagAsLearning ? { subjectId: draftSubjectId, chapterId: draftChapterId } : undefined
    );
    setDraftTitle('');
  };

  const beginEdit = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const commitEdit = (taskId: string) => {
    if (editingTitle.trim()) {
      updateTask(taskId, { title: editingTitle.trim() });
    }
    setEditingTaskId(null);
    setEditingTitle('');
  };

  const renderTaskRow = (task: TaskItem) => {
    const isEditing = editingTaskId === task.id;

    return (
      <div key={task.id} className="ios-row">
        <button
          type="button"
          className={`ios-checkbox ${task.completed ? 'ios-checkbox--checked' : ''}`}
          aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
          aria-pressed={task.completed}
          onClick={() => toggleTaskCompletion(task.id)}
        >
          {task.completed && <Check size={14} strokeWidth={3} />}
        </button>

        <div className="task-body">
          {isEditing ? (
            <input
              type="text"
              className="ios-input"
              style={{ padding: '7px 10px', fontSize: 15 }}
              value={editingTitle}
              autoFocus
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => commitEdit(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(task.id);
                if (e.key === 'Escape') setEditingTaskId(null);
              }}
            />
          ) : (
            <button
              type="button"
              className={`task-title ${task.completed ? 'task-title--done' : ''}`}
              onClick={() => !task.completed && beginEdit(task)}
            >
              {task.title}
            </button>
          )}

          {(task.category || task.chapterId || task.subjectId) && (
            <div className="task-meta" style={{ flexWrap: 'wrap', gap: 6 }}>
              {task.category && (
                <CategoryBadge name={task.category} categories={preferences.categories} />
              )}
              {(task.chapterId || task.subjectId) && (
                <ChapterTagChip chapterId={task.chapterId} subjectId={task.subjectId} />
              )}
            </div>
          )}
        </div>

        <div className="task-actions">
          {!task.completed && (
            <button
              type="button"
              className="bucket-chip"
              title={task.bucket === 'today' ? 'Move to Later' : 'Pin to Today'}
              onClick={() => moveTaskBucket(task.id, task.bucket === 'today' ? 'later' : 'today')}
            >
              {task.bucket === 'today' ? (
                <>
                  <ArrowDownRight size={12} />
                  Later
                </>
              ) : (
                <>
                  <ArrowUpRight size={12} />
                  Today
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label={`Delete "${task.title}"`}
            onClick={() => deleteTask(task.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          <span className="page-kicker">Strike · Tasks Ahead</span>
          <h1 className="page-title">Plan</h1>
        </div>
        <div className="header-pill" aria-label={`Sync status: ${syncStatus}`}>
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
          <span>
            {todayOpen.length} Today
          </span>
        </div>
      </header>

      {/* Frictionless Quick Capture */}
      <form className="ios-card task-composer" onSubmit={handleAdd}>
        <div className="task-composer-bar">
          <input
            id="plan-task-input"
            type="text"
            className="ios-input"
            placeholder={
              tagAsLearning
                ? 'Capture a Learning study task…'
                : draftBucket === 'today'
                ? 'Capture a task for today…'
                : 'Capture something for later…'
            }
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            autoComplete="off"
          />
          <button
            id="plan-task-add-btn"
            type="submit"
            className="task-add-btn"
            aria-label="Add task"
            disabled={!draftTitle.trim()}
          >
            <Plus size={22} strokeWidth={2.4} />
          </button>
        </div>

        <div className="task-composer-footer">
          <div className="ios-segmented" role="tablist" aria-label="Target bucket">
            <button
              type="button"
              role="tab"
              aria-selected={draftBucket === 'today'}
              className={`ios-segmented-btn ${
                draftBucket === 'today' ? 'ios-segmented-btn--active' : ''
              }`}
              onClick={() => setDraftBucket('today')}
            >
              Today
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={draftBucket === 'later'}
              className={`ios-segmented-btn ${
                draftBucket === 'later' ? 'ios-segmented-btn--active' : ''
              }`}
              onClick={() => setDraftBucket('later')}
            >
              Later
            </button>
          </div>
          <button
            type="button"
            className={`filter-pill ${tagAsLearning ? 'filter-pill--active' : ''}`}
            aria-pressed={tagAsLearning}
            onClick={() => setTagAsLearning((v) => !v)}
          >
            <BookOpen size={12} />
            Learning
          </button>
        </div>

        {tagAsLearning && (
          <ChapterPickerControl
            subjectId={draftSubjectId}
            chapterId={draftChapterId}
            includeArchived={studySettings.showArchivedNcert}
            compact
            onChange={({ subjectId: nextSub, chapterId: nextChap }) => {
              setDraftSubjectId(nextSub);
              setDraftChapterId(nextChap);
            }}
          />
        )}
      </form>

      {/* Today Bucket */}
      <section className="ios-group" aria-labelledby="today-bucket-heading">
        <div className="ios-group-header">
          <h2 id="today-bucket-heading" className="ios-group-title row-gap">
            <Sun size={13} />
            Today
          </h2>
          <span className="ios-group-count">{todayOpen.length}</span>
        </div>

        <div className="ios-list">
          {todayOpen.length > 0 ? (
            todayOpen.map(renderTaskRow)
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Sun size={20} />
              </div>
              <p className="empty-state-title">Clear runway for today</p>
              <p className="empty-state-subtitle">
                Add a focus item above or promote something from Later.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Later Bucket */}
      <section className="ios-group" aria-labelledby="later-bucket-heading">
        <div className="ios-group-header">
          <h2 id="later-bucket-heading" className="ios-group-title row-gap">
            <Clock size={13} />
            Later
          </h2>
          <span className="ios-group-count">{laterOpen.length}</span>
        </div>

        <div className="ios-list">
          {laterOpen.length > 0 ? (
            laterOpen.map(renderTaskRow)
          ) : (
            <div className="empty-state" style={{ padding: '20px 16px' }}>
              <p className="empty-state-subtitle">
                Backlog is empty. Unfinished brain-dump items can land here in 1 tap.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Collapsible Completed Today */}
      {completedToday.length > 0 && (
        <section className="ios-group" aria-label="Completed today">
          <button
            type="button"
            className="disclosure-trigger"
            aria-expanded={showCompletedToday}
            onClick={() => setShowCompletedToday((prev) => !prev)}
          >
            <span className="disclosure-left">
              {showCompletedToday ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              Completed Today
            </span>
            <span className="ios-group-count">{completedToday.length}</span>
          </button>

          {showCompletedToday && (
            <div className="ios-list">{completedToday.map(renderTaskRow)}</div>
          )}
        </section>
      )}
    </>
  );
};
