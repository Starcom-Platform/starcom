/**
 * Share handle v25, as published: the report cap (BA1, BA5–BA7). listReports
 * says when the cap cut the list (`{ counts: true }`); setReportCap sets a cap
 * for the page, never saved; getReportCap says the cap in force.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v25', () => {
  it('is at version 25', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(25);
  });

  it('lists reports with counts on asking, and sets and reads the report cap', () => {
    // Later versions add options beside it (v30: area).
    expect(SHARE_HANDLE_CONTRACT.methods.listReports.args).toBe(1);
    expect(SHARE_HANDLE_CONTRACT.methods.listReports.options).toContain('counts');
    expect(SHARE_HANDLE_CONTRACT.methods.setReportCap).toEqual({ args: 1, options: [] });
    expect(SHARE_HANDLE_CONTRACT.methods.getReportCap).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setReportCap).toEqual(['cap', 'label', 'from']);
    expect(SHARE_HANDLE_CONTRACT.returns.getReportCap).toEqual(['cap', 'label', 'from']);
  });

  it('publishes the choices', () => {
    expect(SHARE_HANDLE_CONTRACT.reportCap).toEqual({ steps: [50, 100, 250, 500], max: 1000, min: 10, default: 50, named: ['max', 'unlimited'] });
  });
});
