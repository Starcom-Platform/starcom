/**
 * The words a capture holds, recovered from the item it became, for reading or translating (D-ML, chat and
 * captures): a selection's text exactly as captured, marks and all; a page's own title; nothing for a link
 * or an image, whose words are Starcom's.
 */
import { describe, expect, it } from 'vitest';
import type { Capture } from '../protocol';
import { capturedWords, captureToItem } from '../captureItems';

const page = { url: 'https://zeitung.example.de/2026/10/hochwasser', title: 'Hochwasser erreicht die Altstadt' };
const item = (c: Capture) => ({ ...captureToItem(c), id: 'x' });

describe('capturedWords', () => {
  it("gives back a selection's text exactly as captured, through the markdown it was quoted in", () => {
    const text = 'Der Pegel stieg um 3,5 m (Stand: 06:00).\n\nDie Brücke ist gesperrt — siehe *Karte* #2!';
    expect(capturedWords(item({ kind: 'selection', text, page, at: '2026-10-12T06:00:00.000Z' } as Capture))).toBe(text);
  });

  it("gives a page's own title, for a page and for evidence", () => {
    expect(capturedWords(item({ kind: 'page', page, at: '2026-10-12T06:00:00.000Z' } as Capture))).toBe(page.title);
    expect(capturedWords(item({ kind: 'evidence', page, at: '2026-10-12T06:00:00.000Z' } as Capture))).toBe(page.title);
  });

  it('gives nothing for a link or an image: their titles are Starcom\'s words', () => {
    expect(capturedWords(item({ kind: 'link', link: 'https://example.org/a', page, at: '2026-10-12T06:00:00.000Z' } as Capture))).toBeNull();
    expect(capturedWords(item({ kind: 'image', image: 'https://example.org/a.png', page, at: '2026-10-12T06:00:00.000Z' } as Capture))).toBeNull();
  });
});
