/**
 * The time bar between a phone and a desktop (Mecha Jono's note of 7 Nov 2026, 2fbdcd6d-d7bd): at 864x1080 its header
 * wrapped, the bar grew past its 52 px box and down under the bottom bar, its slider out of sight and reach, and "24 h"
 * broke onto two lines. Its box is held by its bottom and grows upward; its header wraps whole groups; no range word
 * breaks. Read from the styles (the browser check is .local/scripts/timebar-widths.mjs).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rule = (file: string, selector: string) => {
  const css = readFileSync(resolve(__dirname, file), 'utf8');
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('the time bar where its header wraps', () => {
  it('grows upward from the bottom, never down under the bottom bar', () => {
    const bar = rule('../../../../layouts/CyberCommandHUDLayout/CyberCommandHUDLayout.module.css', '.timeScrubberBar');
    expect(bar).toMatch(/bottom:\s*0/);
    expect(bar).toMatch(/min-height:\s*var\(--chrome-bottom\)/);
    expect(bar).not.toMatch(/(^|[^-])height:\s*var\(--chrome-bottom\)/);
  });

  it('wraps whole groups, and breaks no range word', () => {
    expect(rule('../TimeScrubber.module.css', '.header')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('../TimeScrubber.module.css', '.preset')).toMatch(/white-space:\s*nowrap/);
  });
});
