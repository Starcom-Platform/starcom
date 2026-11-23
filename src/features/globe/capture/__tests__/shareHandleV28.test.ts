/**
 * Share handle v28, as published: category emblems (BA12–BA15). Each listed
 * Intel Report carries its stated `category`; `setReportLook({ emblems })` sets
 * whether glyphs wear their category's emblem for this page only, never saved;
 * `getReportLook()` says the look in force; `reportCategories` publishes the
 * words with what each means and its icon.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { INTEL_CATEGORIES } from '../../../../symbols/symbolRegistry';

describe('contract v28', () => {
  it('is at version 28', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(28);
  });

  it('lists each report\'s category, and sets and reads the look for a page', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toContain('category');
    expect(SHARE_HANDLE_CONTRACT.methods.setReportLook).toEqual({ args: 1, options: [] });
    expect(SHARE_HANDLE_CONTRACT.methods.getReportLook).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setReportLook).toEqual(['emblems', 'from']);
    expect(SHARE_HANDLE_CONTRACT.returns.getReportLook).toEqual(['emblems', 'from']);
  });

  it('publishes each category word with what it means and its icon, and the icon for any other word', () => {
    const { words, other } = SHARE_HANDLE_CONTRACT.reportCategories;
    expect(words.map((w) => w.word)).toEqual([...INTEL_CATEGORIES]);
    expect(words[0]).toEqual({ word: 'conflict', meaning: 'conflict and war', icon: 'swords' });
    expect(other).toEqual({ meaning: 'another category', icon: 'tag' });
  });
});
