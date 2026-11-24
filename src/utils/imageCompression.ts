export interface PreparedPyqImage {
  /** Base64 payload (without data URL prefix) optimized for Gemini Vision OCR */
  visionBase64: string;
  visionMimeType: string;
  /** Compact data URL (target <= 80 KB) for optional local/Firestore diagram retention */
  compressedDataUrl: string;
  compressedBytes: number;
  compressedMimeType: string;
}

const TARGET_STORAGE_BYTES = 80 * 1024; // 80 KB

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { mimeType: 'image/jpeg', base64: dataUrl };
  }
  return { mimeType: match[1], base64: match[2] };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Selected file could not be decoded as an image.'));
    img.src = src;
  });
}

function encodeCanvasPreferWebp(
  canvas: HTMLCanvasElement,
  quality: number
): { dataUrl: string; mimeType: string } {
  try {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) {
      return { dataUrl: webp, mimeType: 'image/webp' };
    }
  } catch {
    // Fall through to JPEG
  }

  const jpeg = canvas.toDataURL('image/jpeg', quality);
  if (jpeg.startsWith('data:image/jpeg')) {
    return { dataUrl: jpeg, mimeType: 'image/jpeg' };
  }

  return { dataUrl: jpeg, mimeType: 'image/png' };
}

function renderResizedCanvas(
  img: HTMLImageElement,
  maxDimension: number
): HTMLCanvasElement {
  const naturalW = img.naturalWidth || img.width || 1;
  const naturalH = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // White backdrop ensures transparent screenshots don't turn black when encoded as JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  }
  return canvas;
}

/**
 * Prepares a user-uploaded PYQ photo for:
 * 1) High-legibility Gemini Vision OCR (max 1280px), and
 * 2) Optional compact storage (WebP with automatic JPEG fallback, targeting <= 80 KB).
 */
export async function prepareImageForVisionAndStorage(file: File): Promise<PreparedPyqImage> {
  const rawDataUrl = await readFileAsDataUrl(file);

  // Fallback gracefully in non-canvas environments (e.g., jsdom tests)
  let img: HTMLImageElement | null = null;
  try {
    img = await loadImageElement(rawDataUrl);
  } catch {
    img = null;
  }

  if (!img) {
    const { mimeType, base64 } = splitDataUrl(rawDataUrl);
    return {
      visionBase64: base64,
      visionMimeType: mimeType,
      compressedDataUrl: rawDataUrl,
      compressedBytes: estimateDataUrlBytes(rawDataUrl),
      compressedMimeType: mimeType,
    };
  }

  try {
    // 1. Vision payload: preserve legibility of subscripts, equations & chemical diagrams
    const visionCanvas = renderResizedCanvas(img, 1280);
    const visionEncoded = encodeCanvasPreferWebp(visionCanvas, 0.85);
    const visionSplit = splitDataUrl(visionEncoded.dataUrl);

    // 2. Compact storage payload: iteratively shrink quality & dimensions to fit <= 80 KB
    const dimensionSteps = [1000, 800, 640, 480];
    const qualitySteps = [0.76, 0.64, 0.52, 0.42];

    let bestEncoded = encodeCanvasPreferWebp(renderResizedCanvas(img, dimensionSteps[0]), qualitySteps[0]);
    let bestBytes = estimateDataUrlBytes(bestEncoded.dataUrl);

    outer: for (const maxDim of dimensionSteps) {
      const storageCanvas = renderResizedCanvas(img, maxDim);
      for (const quality of qualitySteps) {
        const candidate = encodeCanvasPreferWebp(storageCanvas, quality);
        const bytes = estimateDataUrlBytes(candidate.dataUrl);
        if (bytes < bestBytes) {
          bestEncoded = candidate;
          bestBytes = bytes;
        }
        if (bytes <= TARGET_STORAGE_BYTES) {
          bestEncoded = candidate;
          bestBytes = bytes;
          break outer;
        }
      }
    }

    return {
      visionBase64: visionSplit.base64,
      visionMimeType: visionSplit.mimeType,
      compressedDataUrl: bestEncoded.dataUrl,
      compressedBytes: bestBytes,
      compressedMimeType: bestEncoded.mimeType,
    };
  } catch {
    const { mimeType, base64 } = splitDataUrl(rawDataUrl);
    return {
      visionBase64: base64,
      visionMimeType: mimeType,
      compressedDataUrl: rawDataUrl,
      compressedBytes: estimateDataUrlBytes(rawDataUrl),
      compressedMimeType: mimeType,
    };
  }
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
