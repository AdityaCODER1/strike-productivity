import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { StudySubjectId, getChaptersForSubject } from '../data/ncertCatalog';
import { useStrike } from '../state/StrikeContext';
import { extractDoubtFromImageWithGemini } from '../services/gemini';
import { formatBytesCompact, prepareImageForVisionAndStorage } from '../utils/imageCompression';
import { ChapterPickerControl } from './ChapterPickerControl';

interface DoubtComposerSheetProps {
  open: boolean;
  defaultSubjectId?: StudySubjectId;
  defaultChapterId?: string;
  onClose: () => void;
}

export const DoubtComposerSheet: React.FC<DoubtComposerSheetProps> = ({
  open,
  defaultSubjectId = 'physics',
  defaultChapterId,
  onClose,
}) => {
  const { preferences, studySettings, addDoubt, showToast } = useStrike();

  const [subjectId, setSubjectId] = useState<StudySubjectId>(defaultSubjectId);
  const [chapterId, setChapterId] = useState<string>(() => {
    if (defaultChapterId) return defaultChapterId;
    return (
      getChaptersForSubject(defaultSubjectId, {
        includeArchived: studySettings.showArchivedNcert,
      })[0]?.id ?? ''
    );
  });
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [pyqYearText, setPyqYearText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  // Image capture & OCR state
  const [compressedDataUrl, setCompressedDataUrl] = useState<string | null>(null);
  const [compressedBytes, setCompressedBytes] = useState<number>(0);
  const [keepImage, setKeepImage] = useState(false);
  const [diagramDetected, setDiagramDetected] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [usedPhotoOcr, setUsedPhotoOcr] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasGeminiKey = Boolean(preferences.geminiApiKey.trim());

  useEffect(() => {
    if (!open) return;
    setSubjectId(defaultSubjectId);
    const fallbackChap =
      defaultChapterId ||
      getChaptersForSubject(defaultSubjectId, {
        includeArchived: studySettings.showArchivedNcert,
      })[0]?.id ||
      '';
    setChapterId(fallbackChap);
    setTitle('');
    setQuestionText('');
    setPyqYearText('');
    setResolutionNote('');
    setCompressedDataUrl(null);
    setCompressedBytes(0);
    setKeepImage(false);
    setDiagramDetected(false);
    setOcrError(null);
    setUsedPhotoOcr(false);
  }, [open, defaultSubjectId, defaultChapterId, studySettings.showArchivedNcert]);

  if (!open) return null;

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setOcrError(null);
    setIsExtracting(true);
    try {
      const prepared = await prepareImageForVisionAndStorage(file);
      setCompressedDataUrl(prepared.compressedDataUrl);
      setCompressedBytes(prepared.compressedBytes);

      if (!hasGeminiKey) {
        // Without Gemini key, keep the compressed image automatically so user can save it right away
        setKeepImage(true);
        setOcrError('No Gemini API key set — keeping compressed photo directly. Add a key in Settings for auto text OCR.');
        return;
      }

      const extracted = await extractDoubtFromImageWithGemini({
        apiKey: preferences.geminiApiKey,
        model: preferences.geminiModel,
        imageBase64: prepared.visionBase64,
        imageMimeType: prepared.visionMimeType,
        includeArchivedNcert: studySettings.showArchivedNcert,
      });

      setTitle(extracted.title);
      setQuestionText(extracted.questionText);
      setSubjectId(extracted.subjectId);
      setChapterId(extracted.chapterId);
      setPyqYearText(extracted.pyqYear ? String(extracted.pyqYear) : '');
      setDiagramDetected(extracted.hasVisualDiagram);
      setKeepImage(extracted.hasVisualDiagram);
      setUsedPhotoOcr(true);
      showToast(
        extracted.hasVisualDiagram
          ? 'Extracted text + diagram detected (compressed image kept)'
          : 'Converted PYQ photo to text to save space',
        'success'
      );
    } catch (err) {
      setKeepImage(true);
      setOcrError(
        err instanceof Error
          ? `${err.message} You can still save the compressed image directly.`
          : 'Could not extract text from photo.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanQuestion = questionText.trim();
    if (!cleanTitle && !cleanQuestion && !compressedDataUrl) return;

    const parsedYear = pyqYearText.trim() ? Number(pyqYearText.trim()) : null;
    const validYear =
      parsedYear && Number.isFinite(parsedYear) && parsedYear >= 1988 && parsedYear <= 2035
        ? Math.floor(parsedYear)
        : null;

    addDoubt({
      subjectId,
      chapterId,
      title: cleanTitle || cleanQuestion.slice(0, 72) || 'PYQ Doubt Image',
      questionText: cleanQuestion || cleanTitle || 'Saved PYQ question photo',
      imageDataUrl: keepImage && compressedDataUrl ? compressedDataUrl : null,
      pyqYear: validYear,
      resolutionNote,
      source: usedPhotoOcr ? 'photo_ocr' : 'manual',
    });

    showToast('Doubt saved for later review', 'success');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doubt-composer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="sheet-panel" onSubmit={handleSubmit}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <h2 id="doubt-composer-title" className="sheet-title">
            Save Doubt / PYQ
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* PYQ Photo Upload / Gemini Vision OCR */}
        <div className="doubt-photo-zone">
          <input
            ref={fileInputRef}
            id="doubt-photo-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelected}
          />
          <button
            type="button"
            className="btn btn--tinted btn--full"
            disabled={isExtracting}
            onClick={() => fileInputRef.current?.click()}
          >
            {isExtracting ? (
              <>
                <Loader2 size={17} className="spin" />
                Reading PYQ image with Gemini Vision…
              </>
            ) : (
              <>
                <Camera size={17} />
                {compressedDataUrl ? 'Replace PYQ Picture' : 'Snap or Upload PYQ Picture'}
              </>
            )}
          </button>
          <span className="field-hint">
            Converts picture to clean text &amp; auto-detects NCERT chapter by default to save space.
          </span>

          {compressedDataUrl && (
            <div className="stack-sm" style={{ paddingTop: 4 }}>
              <label className="doubt-toggle-row">
                <input
                  id="doubt-keep-image-toggle"
                  type="checkbox"
                  checked={keepImage}
                  onChange={(e) => setKeepImage(e.target.checked)}
                />
                <span style={{ flex: 1 }}>
                  <strong>Keep compressed image</strong> ({formatBytesCompact(compressedBytes)})
                  {diagramDetected && (
                    <span className="doubt-diagram-hint"> · Diagram detected</span>
                  )}
                </span>
              </label>

              {keepImage && (
                <div className="doubt-image-preview-wrap">
                  <img
                    src={compressedDataUrl}
                    alt="Compressed PYQ preview"
                    className="doubt-image-preview"
                  />
                </div>
              )}
              {!keepImage && (
                <span className="field-hint row-gap" style={{ gap: 5 }}>
                  <ImageIcon size={12} />
                  Image will be discarded on save — only extracted text is stored.
                </span>
              )}
            </div>
          )}
        </div>

        {ocrError && (
          <div className="ios-banner ios-banner--info">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{ocrError}</span>
          </div>
        )}

        {/* Subject & Chapter Picker */}
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

        <label className="field-label">
          Short Title
          <input
            id="doubt-title-input"
            type="text"
            className="ios-input"
            placeholder="e.g. Wheatstone bridge unbalanced current doubt"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field-label">
          Question / Doubt Text
          <textarea
            id="doubt-question-textarea"
            className="ios-textarea"
            style={{ minHeight: 96 }}
            placeholder="Type your doubt or let Gemini transcribe your PYQ photo…"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </label>

        <div className="row-gap" style={{ alignItems: 'flex-end' }}>
          <label className="field-label" style={{ width: 132 }}>
            PYQ Year (opt.)
            <input
              id="doubt-pyq-year-input"
              type="number"
              min={1988}
              max={2035}
              className="ios-input"
              placeholder="e.g. 2022"
              value={pyqYearText}
              onChange={(e) => setPyqYearText(e.target.value)}
            />
          </label>
          <label className="field-label" style={{ flex: 1 }}>
            Initial Note / Hint (opt.)
            <input
              type="text"
              className="ios-input"
              placeholder="Where did you get stuck?"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
          </label>
        </div>

        <button
          id="doubt-save-submit"
          type="submit"
          className="btn btn--primary btn--full"
          disabled={
            isExtracting || (!title.trim() && !questionText.trim() && !(keepImage && compressedDataUrl))
          }
        >
          {usedPhotoOcr ? <Sparkles size={17} /> : <Plus size={17} />}
          Save Doubt
        </button>
      </form>
    </div>
  );
};
