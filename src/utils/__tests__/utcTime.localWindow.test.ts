/**
 * A window in the viewer's own time zone, for a hover title (decision D-E,
 * settled 2026-09-14 for step 9).
 */
import { describe, it, expect } from 'vitest';
import { localTimeTitle, localWindowTitle } from '../utcTime';

const start = Date.UTC(2026, 8, 7, 19, 7);
const end = Date.UTC(2026, 8, 14, 19, 7);

describe('localWindowTitle', () => {
  it('gives both ends of a window in local time, labelled once', () => {
    const title = localWindowTitle(start, end);

    expect(title.startsWith(localTimeTitle(start))).toBe(true);
    expect(title.endsWith(` – ${localTimeTitle(end).replace(/^Local: /, '')}`)).toBe(true);
    expect(title.match(/Local: /g)).toHaveLength(1);
  });
});
