import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DoubtItem } from '../types/models';
import { getChapterById, getSubjectMeta } from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { ChapterPickerControl } from './ChapterPickerControl';

interface DoubtDetailSheetProps {
  doubt: DoubtItem | null;
  onClose: () => void;
}

export const DoubtDetailSheet: React.FC<DoubtDetailSheetProps> = ({ doubt, onClose }) => {
  const {
    preferences,
    studySettings,
    updateDoubt,
    toggleDoubtStatus,
    deleteDoubt,
    explainDoubt,
    showToast,
  } = useStrike();

  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [subjectId, setSubjectId] = useState(doubt?.subjectId ?? 'physics');
  const [chapterId, setChapterId] = useState(doubt?.chapterId ?? '');
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [showChapterEdit, setShowChapterEdit] = useState(false);

  useEffect(() => {
    if (!doubt) return;
    setTitle(doubt.title);
    setQuestionText(doubt.questionText);
    setResolutionNote(doubt.resolutionNote);
    setSubjectId(doubt.subjectId);
    setChapterId(doubt.chapterId);
    setExplainError(null);
    setShowChapterEdit(false);
  }, [doubt]);

  if (!doubt) return null;

  const chap = getChapterById(chapterId || doubt.chapterId);
  const subjectMeta = getSubjectMeta(chap?.subjectId ?? subjectId);
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateDoubt(doubt.id, {
      title: title.trim() || doubt.title,
      questionText: questionText.trim() || doubt.questionText,
      resolutionNote,
      subjectId,
      chapterId,
    });
    showToast('Doubt updated', 'success');
    onClose();
  };

  const handleExplain = async () => {
    setIsExplaining(true);
    setExplainError(null);
    try {
      // Save any pending edits to questionText first so Gemini sees latest text
      if (questionText.trim() !== doubt.questionText || title.trim() !== doubt.title) {
        updateDoubt(doubt.id, {
          title: title.trim() || doubt.title,
          questionText: questionText.trim() || doubt.questionText,
        });
      }
      await explainDoubt(doubt.id);
      showToast('Gemini explanation ready', 'success');
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Could not explain doubt.');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleDelete = () => {
    deleteDoubt(doubt.id);
    showToast('Doubt deleted', 'info');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doubt-detail-title"
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
              {doubt.pyqYear ? ` · PYQ ${doubt.pyqYear}` : ''}
            </span>
            <h2 id="doubt-detail-title" className="sheet-title" style={{ marginTop: 2 }}>
              Review Doubt
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Status Toggle & Chapter Edit trigger */}
        <div className="row-between">
          <button
            type="button"
            className={`btn btn--sm btn--pill ${
              doubt.status === 'resolved' ? 'btn--tinted' : 'btn--secondary'
            }`}
            onClick={() => toggleDoubtStatus(doubt.id)}
          >
            {doubt.status === 'resolved' ? (
              <>
                <CheckCircle2 size={14} />
                Resolved
              </>
            ) : (
              <>
                <Circle size={14} />
                Mark Resolved
              </>
            )}
          </button>

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

        {/* Saved Compressed Image (if present) */}
        {doubt.imageDataUrl && (
          <div className="stack-sm">
            <div className="doubt-image-preview-wrap">
              <img
                src={doubt.imageDataUrl}
                alt={`PYQ diagram for ${doubt.title}`}
                className="doubt-image-preview"
                style={{ maxHeight: 280 }}
              />
            </div>
            <div className="row-between">
              <span className="field-hint">Compressed diagram image saved</span>
              <button
                type="button"
                className="log-meta-note"
                style={{ color: 'var(--accent-coral)' }}
                onClick={() => {
                  updateDoubt(doubt.id, { imageDataUrl: null });
                  showToast('Removed image to save space', 'info');
                }}
              >
                Remove photo
              </button>
            </div>
          </div>
        )}

        <label className="field-label">
          Title
          <input
            type="text"
            className="ios-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field-label">
          Question / Doubt
          <textarea
            className="ios-textarea"
            style={{ minHeight: 88 }}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </label>

        <label className="field-label">
          My Takeaway / Solution Note
          <textarea
            id="doubt-resolution-note"
            className="ios-textarea"
            style={{ minHeight: 74 }}
            placeholder="Write the key concept, trick, or mistake to avoid next time…"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
        </label>

        {/* On-Demand Gemini Explanation */}
        <div className="stack-sm">
          <button
            type="button"
            className="btn btn--tinted btn--full"
            disabled={isExplaining || !hasGeminiKey}
            onClick={handleExplain}
          >
            {isExplaining ? (
              <>
                <Loader2 size={16} className="spin" />
                Asking Gemini to explain…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {doubt.aiExplanation ? 'Regenerate Gemini Explanation' : 'Ask Gemini to Explain'}
              </>
            )}
          </button>

          {!hasGeminiKey && (
            <span className="field-hint">
              Add your Gemini API key in Settings to unlock step-by-step explanations.
            </span>
          )}

          {explainError && (
            <div className="ios-banner ios-banner--error">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{explainError}</span>
            </div>
          )}

          {doubt.aiExplanation && (
            <div className="doubt-ai-explanation">
              <div className="ios-group-title row-gap" style={{ fontSize: 11.5 }}>
                <Sparkles size={12} />
                Gemini Explanation
              </div>
              <div className="doubt-ai-explanation-body">{doubt.aiExplanation}</div>
            </div>
          )}
        </div>

        <div className="row-gap" style={{ paddingTop: 4 }}>
          <button type="submit" className="btn btn--primary btn--full">
            Save Notes
          </button>
          <button
            type="button"
            className="btn btn--danger-soft"
            aria-label="Delete doubt"
            onClick={handleDelete}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};
