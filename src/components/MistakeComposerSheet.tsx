import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import {
  StudySubjectId,
  getChapterById,
  getChaptersForSubject,
  getSubjectMeta,
} from '../data/ncertCatalog';
import {
  MISTAKE_TYPES,
  MISTAKE_TYPE_META,
  MistakeSource,
  MistakeType,
} from '../types/models';
import {
  ParsedBrainDumpMistake,
  extractMistakesFromTextWithGemini,
} from '../services/gemini';
import { useStrike } from '../state/StrikeContext';
import { ChapterPickerControl } from './ChapterPickerControl';

export interface MistakeComposerPrefill {
  subjectId?: StudySubjectId;
  chapterId?: string;
  title?: string;
  mistakeText?: string;
  correctionNote?: string;
  mistakeType?: MistakeType;
  sourceLabel?: string;
  linkedDoubtId?: string;
  source?: MistakeSource;
}

interface MistakeComposerSheetProps {
  open: boolean;
  defaultSubjectId?: StudySubjectId;
  defaultChapterId?: string;
  prefill?: MistakeComposerPrefill | null;
  onClose: () => void;
}

export const MistakeComposerSheet: React.FC<MistakeComposerSheetProps> = ({
  open,
  defaultSubjectId = 'physics',
  defaultChapterId,
  prefill,
  onClose,
}) => {
  const { preferences, studySettings, addMistake, addMistakesBatch, showToast } = useStrike();

  const [subjectId, setSubjectId] = useState<StudySubjectId>(defaultSubjectId);
  const [chapterId, setChapterId] = useState<string>('');
  const [mistakeType, setMistakeType] = useState<MistakeType>('conceptual');
  const [title, setTitle] = useState('');
  const [mistakeText, setMistakeText] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [linkedDoubtId, setLinkedDoubtId] = useState<string | undefined>(undefined);
  const [entrySource, setEntrySource] = useState<MistakeSource>('manual');

  // Optional Quick Fill with Gemini panel
  const [showQuickAi, setShowQuickAi] = useState(false);
  const [quickAiText, setQuickAiText] = useState('');
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [batchPreview, setBatchPreview] = useState<ParsedBrainDumpMistake[]>([]);

  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  useEffect(() => {
    if (!open) return;

    const initSubject = prefill?.subjectId ?? defaultSubjectId;
    const initChapter =
      prefill?.chapterId ||
      defaultChapterId ||
      getChaptersForSubject(initSubject, {
        includeArchived: studySettings.showArchivedNcert,
      })[0]?.id ||
      '';

    setSubjectId(initSubject);
    setChapterId(initChapter);
    setMistakeType(prefill?.mistakeType ?? 'conceptual');
    setTitle(prefill?.title ?? '');
    setMistakeText(prefill?.mistakeText ?? '');
    setCorrectionNote(prefill?.correctionNote ?? '');
    setSourceLabel(prefill?.sourceLabel ?? '');
    setLinkedDoubtId(prefill?.linkedDoubtId);
    setEntrySource(prefill?.source ?? 'manual');

    setShowQuickAi(false);
    setQuickAiText('');
    setIsParsingAi(false);
    setAiError(null);
    setBatchPreview([]);
  }, [open, defaultSubjectId, defaultChapterId, prefill, studySettings.showArchivedNcert]);

  if (!open) return null;

  const applyExtractedToForm = (item: ParsedBrainDumpMistake) => {
    setSubjectId(item.subjectId);
    setChapterId(item.chapterId);
    setMistakeType(item.mistakeType);
    setTitle(item.title);
    setMistakeText(item.mistakeText);
    setCorrectionNote(item.correctionNote);
    setSourceLabel(item.sourceLabel ?? '');
    setEntrySource('gemini_quick');
    setBatchPreview([]);
  };

  const handleQuickFillWithGemini = async () => {
    if (!quickAiText.trim() || isParsingAi) return;
    setAiError(null);
    setBatchPreview([]);
    setIsParsingAi(true);
    try {
      const extracted = await extractMistakesFromTextWithGemini({
        apiKey: preferences.geminiApiKey,
        model: preferences.geminiModel,
        rawText: quickAiText,
        defaultSubjectId: subjectId,
        defaultChapterId: chapterId,
        includeArchivedNcert: studySettings.showArchivedNcert,
      });

      if (extracted.length === 0) {
        setAiError('Gemini could not detect a distinct mistake in that note. Try adding a bit more detail.');
        return;
      }

      if (extracted.length === 1) {
        applyExtractedToForm(extracted[0]);
        setShowQuickAi(false);
        showToast('Filled mistake details with Gemini — review & save', 'success');
      } else {
        setBatchPreview(extracted);
        showToast(`Detected ${extracted.length} mistakes — save all or pick one to edit`, 'success');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to parse mistakes with Gemini.');
    } finally {
      setIsParsingAi(false);
    }
  };

  const handleSaveBatch = () => {
    if (batchPreview.length === 0) return;
    const saved = addMistakesBatch(
      batchPreview.map((m) => ({
        subjectId: m.subjectId,
        chapterId: m.chapterId,
        title: m.title,
        mistakeText: m.mistakeText,
        correctionNote: m.correctionNote,
        mistakeType: m.mistakeType,
        sourceLabel: m.sourceLabel,
        source: 'gemini_quick',
      }))
    );
    showToast(`Saved ${saved.length} mistakes to Mistake Log`, 'success');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanMistake = mistakeText.trim();
    if (!cleanTitle && !cleanMistake) return;

    addMistake({
      subjectId,
      chapterId,
      title: cleanTitle || cleanMistake.slice(0, 80),
      mistakeText: cleanMistake || cleanTitle,
      correctionNote: correctionNote.trim(),
      mistakeType,
      sourceLabel: sourceLabel.trim() || undefined,
      linkedDoubtId,
      source: entrySource,
    });

    showToast('Mistake saved to Mistake Log', 'success');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mistake-composer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="sheet-panel" onSubmit={handleSubmit}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2 id="mistake-composer-title" className="sheet-title">
              {prefill?.linkedDoubtId ? 'Log Doubt as Mistake' : 'Log Mistake'}
            </h2>
            {prefill?.linkedDoubtId && (
              <p className="field-hint" style={{ margin: '2px 0 0' }}>
                Pre-filled from your saved doubt — pick a mistake type and save.
              </p>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Optional Quick Fill with Gemini */}
        {!prefill?.linkedDoubtId && (
          <div className="mistake-ai-zone">
            <button
              type="button"
              className="disclosure-trigger"
              style={{ padding: '4px 2px' }}
              aria-expanded={showQuickAi}
              onClick={() => setShowQuickAi((v) => !v)}
            >
              <span className="disclosure-left" style={{ color: 'var(--accent-blue)' }}>
                {showQuickAi ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <Sparkles size={14} />
                Quick Fill with Gemini
              </span>
              <span className="log-meta-note">1 or multiple mistakes</span>
            </button>

            {showQuickAi && (
              <div className="stack-sm" style={{ paddingTop: 4 }}>
                <textarea
                  id="mistake-quick-ai-input"
                  className="ios-textarea"
                  style={{ minHeight: 82, fontSize: 14.5 }}
                  placeholder="Paste messy error notes… e.g. Mock #5: forgot i=3 for K₂SO₄ in osmotic pressure, and misread 'not true' in Plant Kingdom bryophytes."
                  value={quickAiText}
                  onChange={(e) => setQuickAiText(e.target.value)}
                  disabled={isParsingAi}
                />

                {!hasGeminiKey && (
                  <span className="field-hint">
                    Add your Gemini API key in Settings to auto-extract chapter, mistake type, and rules.
                  </span>
                )}

                {aiError && (
                  <div className="ios-banner ios-banner--error" role="alert">
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{aiError}</span>
                  </div>
                )}

                <button
                  id="mistake-quick-ai-btn"
                  type="button"
                  className="btn btn--tinted btn--full btn--sm"
                  disabled={!quickAiText.trim() || isParsingAi || !hasGeminiKey}
                  onClick={() => void handleQuickFillWithGemini()}
                >
                  {isParsingAi ? (
                    <>
                      <Loader2 size={15} className="spin" />
                      Extracting with Gemini…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Extract with Gemini
                    </>
                  )}
                </button>

                {batchPreview.length > 1 && (
                  <div className="stack-sm" style={{ paddingTop: 4 }}>
                    <span className="ios-group-title" style={{ fontSize: 11.5 }}>
                      Detected {batchPreview.length} Mistakes
                    </span>
                    <div className="ios-list" style={{ background: 'var(--bg-elevated-1)' }}>
                      {batchPreview.map((item, idx) => {
                        const chap = getChapterById(item.chapterId);
                        const subj = getSubjectMeta(item.subjectId);
                        const meta = MISTAKE_TYPE_META[item.mistakeType];
                        return (
                          <div
                            key={`${item.chapterId}-${idx}`}
                            className="ios-row ios-row--flush"
                            style={{ alignItems: 'flex-start', padding: '10px 12px' }}
                          >
                            <div className="stack-sm" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                              <div className="log-meta-note">
                                {subj.shortName}
                                {chap ? ` Cl.${chap.classLevel} · ${chap.title}` : ''} ·{' '}
                                {meta.shortLabel}
                                {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
                              </div>
                              {item.correctionNote && (
                                <div className="field-hint" style={{ color: 'var(--accent-green)' }}>
                                  Rule: {item.correctionNote}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm btn--pill"
                              onClick={() => applyExtractedToForm(item)}
                            >
                              Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary btn--full btn--sm"
                      onClick={handleSaveBatch}
                    >
                      <CheckCheck size={15} />
                      Save All {batchPreview.length} Mistakes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subject & NCERT Chapter */}
        <div className="field-label">
          Subject &amp; NCERT Chapter
          <ChapterPickerControl
            subjectId={subjectId}
            chapterId={chapterId}
            includeArchived={studySettings.showArchivedNcert}
            allowEmpty={false}
            onChange={({ subjectId: nextSub, chapterId: nextChap }) => {
              if (nextSub) setSubjectId(nextSub);
              if (nextChap) setChapterId(nextChap);
            }}
          />
        </div>

        {/* Mistake Type Pills */}
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
            id="mistake-title-input"
            type="text"
            className="ios-input"
            placeholder="e.g. Forgot Van't Hoff factor for K₂SO₄"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field-label">
          What Went Wrong
          <textarea
            id="mistake-text-textarea"
            className="ios-textarea"
            style={{ minHeight: 82 }}
            placeholder="Describe the exact slip, wrong assumption, or question trap…"
            value={mistakeText}
            onChange={(e) => setMistakeText(e.target.value)}
          />
        </label>

        <label className="field-label">
          Correct Rule / Takeaway
          <textarea
            id="mistake-correction-textarea"
            className="ios-textarea"
            style={{ minHeight: 74 }}
            placeholder="Exact formula, NCERT fact, or rule to remember next time…"
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
          />
        </label>

        <label className="field-label">
          Test / Source (optional)
          <input
            id="mistake-source-input"
            type="text"
            className="ios-input"
            placeholder="e.g. Mock Test #4, PYQ 2022, NCERT Back Ex"
            value={sourceLabel}
            onChange={(e) => setSourceLabel(e.target.value)}
          />
        </label>

        <button
          id="mistake-save-submit"
          type="submit"
          className="btn btn--primary btn--full"
          disabled={isParsingAi || (!title.trim() && !mistakeText.trim())}
        >
          {entrySource === 'gemini_quick' ? <Sparkles size={17} /> : <Plus size={17} />}
          Save Mistake
        </button>
      </form>
    </div>
  );
};
