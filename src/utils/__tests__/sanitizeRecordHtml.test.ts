/**
 * A record's text as HTML, kept to what reads as text (found 2026-10-11, before captures from any web
 * page reached the vault). IntelWeb shows a record's markdown through `marked`, which passes raw HTML
 * through, and its sanitizer returned the HTML untouched into dangerouslySetInnerHTML. The site's CSP
 * stops scripts; it does not stop a fake link, a form, an overlay, or a remote image that tells
 * whoever serves it the reader's address.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeRecordHtml } from '../sanitizeRecordHtml';
import { intelMarkdownRenderer } from '../intelligenceMarkdownRenderer';

const dom = (html: string) => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
};

describe('sanitizeRecordHtml', () => {
  it('keeps what reads as text: paragraphs, emphasis, lists, quotes, code, headings, tables', () => {
    const html = '<h2>Flood</h2><p><strong>Now</strong> and <em>then</em></p><ul><li>one</li></ul><blockquote><p>said</p></blockquote>'
      + '<pre><code class="language-txt">a &lt; b</code></pre><table><tbody><tr><th>h</th></tr><tr><td>d</td></tr></tbody></table><hr>';
    expect(sanitizeRecordHtml(html)).toBe(html);
  });

  it('removes what runs, loads or asks: scripts, images, frames, forms, styles, media', () => {
    const box = dom(sanitizeRecordHtml(
      '<p>a</p><script>alert(1)</script><img src="https://tracker.example/p.gif"><iframe src="https://x.example"></iframe>'
      + '<form action="https://x.example"><input name="pw"><button>Sign in</button></form><style>body{display:none}</style>'
      + '<video src="https://x.example/v.mp4"></video><svg><a href="https://x.example">x</a></svg><link rel="stylesheet" href="https://x.example/s.css">',
    ));
    expect(box.querySelectorAll('script, img, iframe, form, input, button, style, video, svg, link')).toHaveLength(0);
    expect(box.textContent).toBe('a');
  });

  it('strips every attribute that is not plain: handlers, styles, ids', () => {
    const box = dom(sanitizeRecordHtml('<p onclick="x()" style="position:fixed;inset:0" id="login">hello</p><div onmouseover="y()">z</div>'));
    expect(box.innerHTML).toBe('<p>hello</p><div>z</div>');
  });

  it('keeps a link only to the web, mail, or a place on the page, and never lets it reach back', () => {
    const box = dom(sanitizeRecordHtml(
      '<a href="https://gov.example/notice">notice</a><a href="javascript:alert(1)">x</a><a href="data:text/html,hi">y</a>'
      + '<a href="mailto:desk@example.org">mail</a><a href="#top">top</a>',
    ));
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://gov.example/notice', null, null, 'mailto:desk@example.org', '#top']);
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(box.textContent).toBe('noticexymailtop');
  });

  it('unwraps an element it does not know, keeping its words', () => {
    expect(sanitizeRecordHtml('<p><marquee>moving</marquee> <font color="red">red</font></p>')).toBe('<p>moving red</p>');
  });

  it('keeps the renderer\'s wikilinks and hashtags by class and data, without their inline handlers', () => {
    const box = dom(sanitizeRecordHtml('<a href="#" class="wikilink" data-entity="Port" onclick="window.handleWikilinkClick?.(\'Port\')">Port</a><span class="hashtag" data-tag="flood">#flood</span>'));
    const link = box.querySelector('a.wikilink')!;
    expect(link.getAttribute('data-entity')).toBe('Port');
    expect(link.hasAttribute('onclick')).toBe(false);
    expect(box.querySelector('span.hashtag')?.getAttribute('data-tag')).toBe('flood');
  });
});

describe('a record rendered for IntelWeb', () => {
  it('shows a captured page\'s markup as nothing that runs or loads, and its markdown as text', () => {
    const { htmlContent } = intelMarkdownRenderer.parseMarkdown('# Seen\n\nThe page said <img src="https://tracker.example/p.gif" onerror="steal()"> and **more**.');
    const box = dom(htmlContent);
    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('h1')?.textContent).toBe('Seen');
    expect(box.querySelector('strong')?.textContent).toBe('more');
  });
});
