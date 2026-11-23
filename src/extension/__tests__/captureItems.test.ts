/**
 * A capture as Starcom keeps it (decision D-EX, E2, W5): an intel item that says what was captured,
 * from where and when, graded as an unassessed page and never verified, with no distribution chosen,
 * so it goes nowhere until someone decides. The page's words are kept as themselves: nothing captured
 * renders as markup or formatting.
 */
import { describe, expect, it } from 'vitest';
import type { Capture } from '../protocol';
import { CAPTURE_CATEGORY, CAPTURE_TAG, captureToItem, reportDraftFrom, unfiledCaptures } from '../captureItems';
import { intelMarkdownRenderer } from '../../utils/intelligenceMarkdownRenderer';
import type { IntelItemUI } from '../../types/intel/IntelItemUI';

const AT = '2026-10-11T21:05:00.000Z';
const page = { url: 'https://news.example.org/2026/10/flood?id=7', title: 'Floodwater reaches the old town' };
const capture = (over: Partial<Capture>): Capture => ({ id: 'c1', kind: 'page', at: AT, page, ...over });
const rendered = (markdown: string) => {
  const box = document.createElement('div');
  box.innerHTML = intelMarkdownRenderer.parseMarkdown(markdown).htmlContent;
  return box;
};

describe('captureToItem', () => {
  it('keeps a selection quoted as itself, with where and when it was captured, in UTC', () => {
    const item = captureToItem(capture({ kind: 'selection', text: 'The river rose 3 m overnight.\nRoads closed.' }));
    expect(item).toMatchObject({
      title: 'The river rose 3 m overnight. Roads closed.',
      type: 'CAPTURE', source: 'news.example.org', reliability: 'F', verified: false,
      tags: [CAPTURE_TAG, 'selection'], categories: [CAPTURE_CATEGORY], collectedAt: AT,
    });
    expect(item.visibility).toBeUndefined();
    expect(item.sensitivity).toBeUndefined();
    const box = rendered(item.content);
    // Line by line, as the renderer breaks them.
    expect(box.querySelector('blockquote')?.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim()).toBe('The river rose 3 m overnight.\nRoads closed.');
    expect(box.textContent).toContain('11 Oct 2026 21:05Z');
    expect(box.querySelector('a')?.getAttribute('href')).toBe(page.url);
    expect(box.querySelector('a')?.textContent).toBe(page.title);
  });

  it('shows a page\'s markup and markdown as the words they are', () => {
    const item = captureToItem(capture({ kind: 'selection', text: '# Not a heading <img src="https://tracker.example/p.gif"> **not bold** [x](javascript:alert(1)) www.example.com desk@example.org' }));
    const box = rendered(item.content);
    expect(box.querySelector('h1, img, strong')).toBeNull();
    expect(box.querySelectorAll('a')).toHaveLength(1);
    expect(box.querySelector('blockquote')?.textContent).toContain('# Not a heading <img src="https://tracker.example/p.gif"> **not bold** [x](javascript:alert(1)) www.example.com desk@example.org');
  });

  it('names a link, an image and a page by what they are, and says when a selection was cut', () => {
    expect(captureToItem(capture({ kind: 'link', link: 'https://gov.example/notices/42' }))).toMatchObject({ title: 'Link: gov.example/notices/42', tags: [CAPTURE_TAG, 'link'] });
    expect(captureToItem(capture({ kind: 'image', image: 'https://cdn.example.org/bridge.jpg' }))).toMatchObject({ title: 'Image from Floodwater reaches the old town' });
    expect(captureToItem(capture({ kind: 'page' })).title).toBe('Floodwater reaches the old town');
    expect(captureToItem(capture({ kind: 'page', page: { url: 'https://news.example.org/a/b' } })).title).toBe('news.example.org/a/b');
    expect(captureToItem(capture({ kind: 'selection', text: 'x'.repeat(200), cut: true })).content).toContain('longer than Uplink keeps whole');
    expect(captureToItem(capture({ kind: 'selection', text: 'y'.repeat(200) })).title).toHaveLength(80);
  });
});

describe('the captures to file', () => {
  const item = (id: string, tags = [CAPTURE_TAG], categories = [CAPTURE_CATEGORY]) => ({ id, tags, categories }) as unknown as IntelItemUI;

  it('are the captures no case holds, as evidence or against it, and no report cites', () => {
    const items = [item('a'), item('b'), item('c'), item('e'), item('d', ['other'], ['other'])];
    const holders = [{ relatedEntities: ['a'], contradictedBy: ['b'] }, { sourceIntelIds: ['e'] }];
    expect(unfiledCaptures(items, holders).map((i) => i.id)).toEqual(['c']);
  });
});

describe('a report drafted from a capture', () => {
  it('cites the capture and quotes it, and decides nothing about who may read it', () => {
    const draft = reportDraftFrom({ id: 'intelitem-1', title: 'The river rose', content: '> The river rose' } as IntelItemUI);
    expect(draft).toEqual({ title: 'The river rose', content: '> The river rose', category: 'GENERAL', tags: [CAPTURE_TAG], sourceIntelIds: ['intelitem-1'], status: 'DRAFT' });
  });
});
