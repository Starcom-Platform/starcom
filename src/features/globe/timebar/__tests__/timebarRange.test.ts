/**
 * The time bar's range, shared (D-EQ, EQ14): the bar sets it, a layer reading by the window shown follows it, and it is
 * kept in this browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTimebarRangeForTests, setTimebarRange, subscribeTimebarRange, timebarRange } from '../timebarRange';

describe('the time bar range', () => {
  beforeEach(() => { localStorage.clear(); resetTimebarRangeForTests(); });

  it('is All until one is picked, and keeps what was picked', () => {
    expect(timebarRange()).toBe('all');
    setTimebarRange('7d');
    resetTimebarRangeForTests();
    expect(timebarRange()).toBe('7d');
  });

  it('tells those that follow it, and ignores a stale or unknown keep', () => {
    const heard = vi.fn();
    const stop = subscribeTimebarRange(heard);
    setTimebarRange('30d');
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    localStorage.setItem('starcom:timebar-range', 'decade');
    resetTimebarRangeForTests();
    expect(timebarRange()).toBe('all');
  });
});

describe('History (D-EQ, EQ15)', () => {
  it('chooses the decade, year or month round a moment, and names it', async () => {
    const { historyWindowContaining, historyWindowWords, historicalUtc, historyStart, yearWords } = await import('../timebarRange');
    const t = Date.UTC(1964, 2, 28, 3, 36);
    expect(historyWindowContaining(t, 'year')).toEqual({ start: Date.UTC(1964, 0, 1), end: Date.UTC(1965, 0, 1) });
    expect(historyWindowContaining(t, 'decade')).toEqual({ start: Date.UTC(1960, 0, 1), end: Date.UTC(1970, 0, 1) });
    expect(historyWindowContaining(t, 'month')).toEqual({ start: Date.UTC(1964, 2, 1), end: Date.UTC(1964, 3, 1) });
    expect(historyWindowWords(historyWindowContaining(t, 'decade'), 'decade')).toBe('the 1960s');
    expect(historyWindowWords(historyWindowContaining(t, 'month'), 'month')).toBe('Mar 1964');
    // Years before 100 and before the common era: Date.UTC would read 79 as 1979.
    expect(new Date(historicalUtc(79)).getUTCFullYear()).toBe(79);
    expect(yearWords(-2149)).toBe('2150 BC');
    expect(yearWords(new Date(historyStart('atlas')).getUTCFullYear())).toBe('2150 BC');
    expect(historyStart('1900')).toBe(Date.UTC(1900, 0, 1));
  });

  it('keeps the span and unit chosen', async () => {
    const { setTimebarHistory, timebarHistory } = await import('../timebarRange');
    expect(timebarHistory()).toEqual({ span: '1900', unit: 'year' });
    setTimebarHistory({ unit: 'decade' });
    resetTimebarRangeForTests();
    expect(timebarHistory()).toEqual({ span: '1900', unit: 'decade' });
  });
});
