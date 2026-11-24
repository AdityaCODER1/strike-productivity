import React, { useMemo } from 'react';
import {
  STUDY_SUBJECTS,
  StudySubjectId,
  getChapterById,
  getChaptersForSubject,
  getSubjectMeta,
} from '../data/ncertCatalog';

interface ChapterPickerControlProps {
  subjectId: StudySubjectId | undefined;
  chapterId: string | undefined;
  includeArchived: boolean;
  onChange: (next: { subjectId: StudySubjectId | undefined; chapterId: string | undefined }) => void;
  allowEmpty?: boolean;
  compact?: boolean;
}

export const ChapterPickerControl: React.FC<ChapterPickerControlProps> = ({
  subjectId,
  chapterId,
  includeArchived,
  onChange,
  allowEmpty = true,
  compact = false,
}) => {
  const activeSubject: StudySubjectId | undefined = subjectId ?? (allowEmpty ? undefined : 'physics');

  const { class11, class12 } = useMemo(() => {
    if (!activeSubject) return { class11: [], class12: [] };
    return {
      class11: getChaptersForSubject(activeSubject, { includeArchived, classLevel: 11 }),
      class12: getChaptersForSubject(activeSubject, { includeArchived, classLevel: 12 }),
    };
  }, [activeSubject, includeArchived]);

  const handleSelectSubject = (nextSub: StudySubjectId) => {
    if (allowEmpty && activeSubject === nextSub) {
      onChange({ subjectId: undefined, chapterId: undefined });
      return;
    }
    const firstChapter = getChaptersForSubject(nextSub, { includeArchived })[0];
    onChange({
      subjectId: nextSub,
      chapterId: allowEmpty ? undefined : firstChapter?.id,
    });
  };

  return (
    <div className="stack-sm" style={{ gap: compact ? 6 : 8 }}>
      <div className="filter-strip" role="radiogroup" aria-label="NCERT Subject">
        {STUDY_SUBJECTS.map((subj) => {
          const isActive = activeSubject === subj.id;
          return (
            <button
              key={subj.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
              onClick={() => handleSelectSubject(subj.id)}
            >
              <span
                className={`cat-dot cat-swatch--${subj.colorToken}`}
                style={isActive ? { background: '#ffffff' } : undefined}
              />
              {subj.name}
            </button>
          );
        })}
      </div>

      {activeSubject && (
        <select
          className="ios-select"
          aria-label="NCERT Chapter"
          style={compact ? { padding: '9px 12px', fontSize: 14 } : undefined}
          value={chapterId ?? ''}
          onChange={(e) => {
            const val = e.target.value || undefined;
            onChange({ subjectId: activeSubject, chapterId: val });
          }}
        >
          {allowEmpty && <option value="">Auto-detect or select chapter…</option>}
          <optgroup label="Class 11 NCERT">
            {class11.map((ch) => (
              <option key={ch.id} value={ch.id}>
                Ch {ch.chapterNumber}. {ch.title}
                {ch.archived ? ' (Archived)' : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="Class 12 NCERT">
            {class12.map((ch) => (
              <option key={ch.id} value={ch.id}>
                Ch {ch.chapterNumber}. {ch.title}
                {ch.archived ? ' (Archived)' : ''}
              </option>
            ))}
          </optgroup>
        </select>
      )}
    </div>
  );
};

export const ChapterTagChip: React.FC<{
  chapterId?: string;
  subjectId?: StudySubjectId;
}> = ({ chapterId, subjectId }) => {
  const chapter = getChapterById(chapterId);
  if (!chapter && !subjectId) return null;

  const subj = getSubjectMeta(chapter?.subjectId ?? subjectId!);

  return (
    <span className={`study-chapter-chip study-chapter-chip--${subj.colorToken}`}>
      <span className={`cat-dot cat-swatch--${subj.colorToken}`} />
      <span>
        {subj.shortName}
        {chapter ? ` · Cl.${chapter.classLevel} ${chapter.title}` : ''}
      </span>
    </span>
  );
};
