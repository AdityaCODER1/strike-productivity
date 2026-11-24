import { describe, expect, it, vi } from 'vitest';
import { estimateDataUrlBytes, formatBytesCompact, splitDataUrl } from '../imageCompression';

describe('imageCompression utilities', () => {
  it('splits data URLs into mimeType and base64 payload', () => {
    const res = splitDataUrl('data:image/webp;base64,UklGRh4AAABXRUJQ');
    expect(res).toEqual({
      mimeType: 'image/webp',
      base64: 'UklGRh4AAABXRUJQ',
    });
  });

  it('estimates decoded byte length from base64 data URLs', () => {
    // "hello" in base64 is "aGVsbG8=" (5 bytes)
    expect(estimateDataUrlBytes('data:image/jpeg;base64,aGVsbG8=')).toBe(5);
    expect(formatBytesCompact(512)).toBe('512 B');
    expect(formatBytesCompact(81920)).toBe('80 KB');
  });

  it('falls back to image/jpeg when canvas.toDataURL("image/webp") returns PNG', async () => {
    const { prepareImageForVisionAndStorage } = await import('../imageCompression');

    // Mock Image to immediately fire onload with dimensions
    const OriginalImage = globalThis.Image;
    class MockImage {
      naturalWidth = 1000;
      naturalHeight = 800;
      width = 1000;
      height = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal('Image', MockImage);

    // Mock canvas returning PNG when WebP is requested, and JPEG when JPEG is requested
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toDataURL: (mime: string) => {
            if (mime === 'image/webp') {
              return 'data:image/png;base64,iVBORw0KGgo=';
            }
            return 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
          },
        } as unknown as HTMLCanvasElement;
      }
      return origCreateElement(tagName);
    });

    try {
      const fakeFile = new File(['abc'], 'pyq.png', { type: 'image/png' });
      const prepared = await prepareImageForVisionAndStorage(fakeFile);
      expect(prepared.compressedMimeType).toBe('image/jpeg');
      expect(prepared.compressedDataUrl.startsWith('data:image/jpeg')).toBe(true);
      expect(prepared.visionMimeType).toBe('image/jpeg');
    } finally {
      vi.stubGlobal('Image', OriginalImage);
      vi.restoreAllMocks();
    }
  });
});
