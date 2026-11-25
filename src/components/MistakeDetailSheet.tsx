import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  MISTAKE_TYPES,
  MISTAKE_TYPE_META,
  MistakeItem,
  MistakeType,
} from '../types/models';
import { getChapterById, getSubjectMeta } from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { ChapterPickerControl } from './ChapterPickerControl';

interface MistakeDetailSheetProps {
  mistake: MistakeItem | null;
  onClose: () => void;
}

export const MistakeDetailSheet: React.FC<MistakeDetailSheetProps> = ({ mistake, onClose }) => {
  const {
    studySettings,
    updateMistake,
    toggleMistakeStatus,
    incrementMistakeRepeat,
    deleteMistake,
    showToast,
  } = useStrike();

  const [title, setTitle] = useState('');
  const [mistakeText, setMistakeText] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [mistakeType, setMistakeType] = useState<MistakeType>('conceptual');
  const [sourceLabel, setSourceLabel] = useState('');
  const [subjectId, setSubjectId] = useState(mistake?.subjectId ?? 'physics');
  const [chapterId, setChapterId] = useState(mistake?.chapterId ?? '');
  const [showChapterEdit, setShowChapterEdit] = useState(false);

  useEffect(() => {
    if (!mistake) return;
    setTitle(mistake.title);
    setMistakeText(mistake.mistakeText);
    setCorrectionNote(mistake.correctionNote);
    setMistakeType(mistake.mistakeType);
    setSourceLabel(mistake.sourceLabel ?? '');
    setSubjectId(mistake.subjectId);
    setChapterId(mistake.chapterId);
    setShowChapterEdit(false);
  }, [mistake]);

  if (!mistake) return null;

  const chap = getChapterById(chapterId || mistake.chapterId);
  const subjectMeta = getSubjectMeta(chap?.subjectId ?? subjectId);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMistake(mistake.id, {
      title: title.trim() || mistake.title,
      mistakeText: mistakeText.trim() || mistake.mistakeText,
      correctionNote,
      mistakeType,
      sourceLabel,
      subjectId,
      chapterId,
    });
    showToast('Mistake updated', 'success');
    onClose();
  };

  const handleDelete = () => {
    deleteMistake(mistake.id);
    showToast('Mistake deleted', 'info');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mistake-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="sheet-panel" onSubmit={handleSave}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div style={{ minWidth: 0 }}>
            <span className="page-kicker" style={{ fontSize: 11 }}>
              {subjectMeta.name}
              {chap ? ` · Cl.${chap.classLevel} ${chap.title}` : ''}
              {mistake.sourceLabel ? ` · ${mistake.sourceLabel}` : ''}
            </span>
            <h2 id="mistake-detail-title" className="sheet-title" style={{ marginTop: 2 }}>
              Review Mistake
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Status, Repeat +1, & Move Chapter */}
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="row-gap" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn btn--sm btn--pill ${
                mistake.status === 'fixed' ? 'btn--tinted' : 'btn--secondary'
              }`}
              onClick={() => toggleMistakeStatus(mistake.id)}
            >
              {mistake.status === 'fixed' ? (
                <>
                  <CheckCircle2 size={14} />
                  Fixed
                </>
              ) : (
                <>
                  <Circle size={14} />
                  Mark Fixed
                </>
              )}
            </button>

            <button
              type="button"
              className={`repeat-chip-btn ${mistake.repeatCount > 1 ? 'repeat-chip-btn--hot' : ''}`}
              aria-label={`Log repeat for ${mistake.title}`}
              onClick={() => incrementMistakeRepeat(mistake.id)}
            >
              <RotateCcw size={12} />
              <span>
                +1 Happened Again ({mistake.repeatCount}×)
              </span>
            </button>
          </div>

          <button
            type="button"
            className="log-meta-note"
            style={{ color: 'var(--accent-blue)' }}
            onClick={() => setShowChapterEdit((v) => !v)}
          >
            {showChapterEdit ? 'Done moving' : 'Change Chapter'}
          </button>
        </div>

        {showChapterEdit && (
          <ChapterPickerControl
            subjectId={subjectId}
            chapterId={chapterId}
            includeArchived={studySettings.showArchivedNcert}
            allowEmpty={false}
            compact
            onChange={({ subjectId: nextSub, chapterId: nextChap }) => {
              if (nextSub) setSubjectId(nextSub);
              if (nextChap) setChapterId(nextChap);
            }}
          />
        )}

        {/* Mistake Type */}
        <div className="field-label">
          Mistake Type
          <div className="filter-strip" role="radiogroup" aria-label="Mistake type">
            {MISTAKE_TYPES.map((typeKey) => {
              const meta = MISTAKE_TYPE_META[typeKey];
              const active = mistakeType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                  onClick={() => setMistakeType(typeKey)}
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
        </div>

        <label className="field-label">
          Short Title
          <input
            type="text"
            className="ios-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field-label">
          What Went Wrong
          <textarea
            className="ios-textarea"
            style={{ minHeight: 82 }}
            value={mistakeText}
            onChange={(e) => setMistakeText(e.target.value)}
          />
        </label>

        <label className="field-label">
          Correct Rule / Takeaway
          <textarea
            id="mistake-detail-correction"
            className="ios-textarea"
            style={{ minHeight: 74 }}
            placeholder="Write the exact rule, formula, or NCERT fact to remember…"
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
          />
        </label>

        <label className="field-label">
          Test / Source (optional)
          <input
            type="text"
            className="ios-input"
            placeholder="e.g. Mock Test #4, PYQ 2022"
            value={sourceLabel}
            onChange={(e) => setSourceLabel(e.target.value)}
          />
        </label>

        <div className="row-gap" style={{ paddingTop: 4 }}>
          <button type="submit" className="btn btn--primary btn--full">
            Save Changes
          </button>
          <button
            type="button"
            className="btn btn--danger-soft"
            aria-label="Delete mistake"
            onClick={handleDelete}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};
