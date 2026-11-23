/**
 * Contract v6: describeView (decision D-F, section 18, item 6). Additive.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v6', () => {
  it('is at version 6 or later: v7 added to it and moved nothing', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(6);
  });

  it('declares describeView, taking the preset whose crop it counts', () => {
    // v13 added `fit`, an option and a return; additive, so v6's are all still there.
    expect(SHARE_HANDLE_CONTRACT.methods.describeView.args).toBe(1);
    expect(SHARE_HANDLE_CONTRACT.methods.describeView.options[0]).toBe('preset');
    expect(SHARE_HANDLE_CONTRACT.returns.describeView).toEqual(expect.arrayContaining(['preset', 'layers', 'notCounted']));
  });

  it('keeps every v5 method', () => {
    for (const m of ['listReports', 'frameReports', 'focusReport', 'compose', 'setView']) {
      expect(SHARE_HANDLE_CONTRACT.methods).toHaveProperty(m);
    }
  });
});
