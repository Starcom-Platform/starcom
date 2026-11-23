/**
 * Text set as HTML stays text: the globe's own tooltips (react-globe.gl's labels)
 * are written as HTML, and a label quotes what others wrote.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  it('turns every character HTML gives a meaning into its entity, and leaves the rest', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml("Tom & Jerry's war")).toBe('Tom &amp; Jerry&#39;s war');
    expect(escapeHtml('Russia–Ukraine, 22 killed')).toBe('Russia–Ukraine, 22 killed');
  });

  it('escapes an ampersand once, before the entities it writes', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
