import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { LogEntry } from '../types/models';
import { StudySubjectId, isStudyTaggedCategory } from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { ChapterPickerControl } from './ChapterPickerControl';

interface LogEditSheetProps {
  entry: LogEntry | null;
  onClose: () => void;
}

export const LogEditSheet: React.FC<LogEditSheetProps> = ({ entry, onClose }) => {
  const { preferences, studySettings, updateLog, deleteLog, showToast } = useStrike();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [subjectId, setSubjectId] = useState<StudySubjectId | undefined>(undefined);
  const [chapterId, setChapterId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setCategory(entry.category);
      setDateKey(entry.dateKey);
      setSubjectId(entry.subjectId);
      setChapterId(entry.chapterId);
    }
  }, [entry]);

  if (!entry) return null;

  const isStudyCategory = isStudyTaggedCategory(category);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    updateLog(entry.id, {
      title: title.trim(),
      category,
      dateKey,
      subjectId: isStudyCategory ? subjectId : undefined,
      chapterId: isStudyCategory ? chapterId : undefined,
    });
    showToast('Activity updated', 'success');
    onClose();
  };

  const handleDelete = () => {
    deleteLog(entry.id);
    showToast('Activity removed', 'info');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-edit-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="sheet-panel" onSubmit={handleSave}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <h2 id="log-edit-sheet-title" className="sheet-title">
            Edit Activity
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label className="field-label">
          Activity
          <textarea
            className="ios-textarea"
            style={{ minHeight: 84 }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <div className="field-label">
          Category
          <div className="filter-strip" style={{ paddingTop: 4 }}>
            {preferences.categories.map((cat) => {
              const active = cat.name === category;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                  onClick={() => setCategory(cat.name)}
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

        {isStudyCategory && (
          <div className="field-label">
            Subject &amp; NCERT Chapter
            <ChapterPickerControl
              subjectId={subjectId}
              chapterId={chapterId}
              includeArchived={studySettings.showArchivedNcert}
              compact
              onChange={({ subjectId: nextSub, chapterId: nextChap }) => {
                setSubjectId(nextSub);
                setChapterId(nextChap);
              }}
            />
          </div>
        )}

        <label className="field-label">
          Date
          <input
            type="date"
            className="ios-input"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
          />
        </label>

        <div className="row-gap" style={{ paddingTop: 4 }}>
          <button type="submit" className="btn btn--primary btn--full">
            Save Changes
          </button>
          <button
            type="button"
            className="btn btn--danger-soft"
            aria-label="Delete activity"
            onClick={handleDelete}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};
