import { describe, it, expect } from 'vitest';
import {
  categorizeGdeltEvent,
  diplomaticEventColor,
  DIPLOMATIC_CONNECTION_COLOR,
  DIPLOMATIC_CATEGORIES,
} from '../diplomaticEventTheme';

/*
 * D-DP, DP4: every cooperative root GDELTEventService loads, in CAMEO's words. Roots 03, 07 and 08, and
 * root 05 but for 057, were loaded and dropped; and the keys said treaty, summit and trade.
 */
describe('categorizeGdeltEvent (bug-injection verified)', () => {
  it('maps EventCode 057 (sign formal agreement) to an agreement, before its root', () => {
    expect(categorizeGdeltEvent('05', '057')).toBe('agreement');
  });

  it('maps each cooperative root to its own category', () => {
    expect(categorizeGdeltEvent('03', '036')).toBe('intent');
    expect(categorizeGdeltEvent('04', '042')).toBe('consult');
    expect(categorizeGdeltEvent('04', '046')).toBe('consult');
    expect(categorizeGdeltEvent('05', '051')).toBe('diplomatic');
    expect(categorizeGdeltEvent('05', '050')).toBe('diplomatic');
    expect(categorizeGdeltEvent('06', '061')).toBe('material');
    expect(categorizeGdeltEvent('07', '073')).toBe('aid');
    expect(categorizeGdeltEvent('08', '087')).toBe('yield');
  });

  it('returns null outside the cooperative roots', () => {
    expect(categorizeGdeltEvent('01', '010')).toBeNull();
    expect(categorizeGdeltEvent('14', '145')).toBeNull();
    expect(categorizeGdeltEvent('09', '090')).toBeNull();
  });
});

describe('DIPLOMATIC_CATEGORIES', () => {
  it('are the seven, in CAMEO\'s order', () => {
    expect(DIPLOMATIC_CATEGORIES).toEqual(['intent', 'consult', 'diplomatic', 'agreement', 'material', 'aid', 'yield']);
  });
});

describe('diplomaticEventColor', () => {
  it('returns a distinct color for each of the seven', () => {
    const colors = DIPLOMATIC_CATEGORIES.map(diplomaticEventColor);
    expect(new Set(colors).size).toBe(7);
  });
});

describe('DIPLOMATIC_CONNECTION_COLOR', () => {
  it('is distinct from every marker color (connections read separately from event category)', () => {
    const markerColors = DIPLOMATIC_CATEGORIES.map(diplomaticEventColor);
    expect(markerColors).not.toContain(DIPLOMATIC_CONNECTION_COLOR);
  });
});
