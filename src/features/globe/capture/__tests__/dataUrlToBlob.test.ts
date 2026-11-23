// @vitest-environment node
/**
 * Turning a composed share card into a Blob without fetching its data: URL, which an
 * enforced Content-Security-Policy refuses (connect-src has no data:).
 */
import { describe, it, expect } from 'vitest';
import { dataUrlToBlob } from '../dataUrlToBlob';

describe('dataUrlToBlob', () => {
  it('gives back the same bytes, typed from the data URL', async () => {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const dataUrl = `data:image/png;base64,${Buffer.from(pngSignature).toString('base64')}`;

    const blob = dataUrlToBlob(dataUrl);

    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(pngSignature);
  });

  it('keeps parameters out of the type', async () => {
    const blob = dataUrlToBlob(`data:image/jpeg;name=card.jpg;base64,${Buffer.from([1, 2, 3]).toString('base64')}`);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
  });

  it('refuses a data URL that is not base64, and anything that is not a data URL', () => {
    expect(() => dataUrlToBlob('data:text/plain,hello')).toThrow();
    expect(() => dataUrlToBlob('https://example.com/card.png')).toThrow();
  });
});
