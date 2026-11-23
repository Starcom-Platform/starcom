import { describe, it, expect } from 'vitest';
import { validateReport } from '../reportValidation';
import { IntelReportUI } from '../../../../types/intel/IntelReportUI';

function base(): IntelReportUI {
  const now = new Date();
  return {
    id: 'r1',
    title: 'Title',
    content: 'Body',
    author: 'author',
    category: 'cat',
    tags: ['alpha','beta'],
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    conclusions: ['c1'],
    recommendations: ['r1'],
    methodology: ['m1'],
    targetAudience: [],
    sourceIntelIds: [],
    version: 1,
    history: []
  };
}

describe('reportValidation', () => {
  it('passes base report (no ERROR issues)', () => {
    const issues = validateReport(base());
    expect(issues.filter(i => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('flags required title/content', () => {
    const r = base();
    (r as any).title = ' ';
    (r as any).content = '';
    const issues = validateReport(r);
    const codes = issues.filter(i => i.code === 'REQUIRED').map(i => i.field).sort();
    expect(codes).toEqual(['content','title']);
  });

  /**
   * ─── THIS VALIDATOR REJECTED EVERY UNMARKED REPORT ─────────────────────────
   *
   * It required `classification` to be one of four tiers. Stage 7a' made the
   * field optional, so a report that declared nothing failed with severity
   * ERROR and the message "Invalid classification" — the type said optional
   * and the validator said required.
   *
   * Latent: every fixture in this suite set the field, including base() above,
   * so the whole suite stayed green over it.
   */
  it('accepts a report that declares no handling at all', () => {
    const r = base();
    delete (r as any).classification;
    const issues = validateReport(r);
    expect(issues.filter(i => i.severity === 'ERROR')).toEqual([]);
  });

  it('flags an invalid visibility', () => {
    const r = base();
    (r as any).visibility = 'BAD';
    const issues = validateReport(r);
    expect(issues.some(i => i.field === 'visibility' && i.code === 'INVALID_ENUM')).toBe(true);
  });

  it('flags an invalid sensitivity', () => {
    const r = base();
    (r as any).sensitivity = 'BAD';
    const issues = validateReport(r);
    expect(issues.some(i => i.field === 'sensitivity' && i.code === 'INVALID_ENUM')).toBe(true);
  });

  it('accepts every valid axis value', () => {
    for (const visibility of ['public', 'limited', 'private'] as const) {
      for (const sensitivity of ['open', 'careful', 'protected'] as const) {
        const r = { ...base(), visibility, sensitivity };
        expect(validateReport(r).filter(i => i.severity === 'ERROR')).toEqual([]);
      }
    }
  });

  it('flags invalid status', () => {
    const r = base();
    (r as any).status = 'WRONG';
    const issues = validateReport(r);
    expect(issues.some(i => i.field === 'status' && i.code === 'INVALID_ENUM')).toBe(true);
  });

  it('warns on confidence out of range', () => {
    const r = base();
    r.confidence = 2;
    const issues = validateReport(r);
    expect(issues.some(i => i.field === 'confidence' && i.code === 'OUT_OF_RANGE' && i.severity === 'WARN')).toBe(true);
  });

  it('warns on geo pair mismatch', () => {
    const r = base();
    r.latitude = 10;
    const issues = validateReport(r);
    expect(issues.some(i => i.code === 'GEO_PAIR')).toBe(true);
  });

  it('warns on geo ranges invalid', () => {
    const r = base();
    r.latitude = 100;
    r.longitude = -200;
    const issues = validateReport(r);
    const codes = issues.filter(i => i.code === 'GEO_RANGE').length;
    expect(codes).toBe(2);
  });

  it('warns when arrays exceed max lengths', () => {
    const r = base();
    r.conclusions = Array.from({length: 25}, (_,i) => 'c'+i);
    r.recommendations = Array.from({length: 25}, (_,i) => 'r'+i);
    r.methodology = Array.from({length: 45}, (_,i) => 'm'+i);
    const issues = validateReport(r);
    expect(issues.filter(i => i.code === 'TOO_LONG').length).toBe(3);
  });

  it('warns duplicate tags (case-insensitive)', () => {
    const r = base();
    r.tags = ['One','two','one','TWO'];
    const issues = validateReport(r);
    const dup = issues.find(i => i.field === 'tags' && i.code === 'DUPLICATE');
    expect(dup).toBeTruthy();
    expect(dup?.message).toMatch(/one, two/);
  });

  it('import mode adds info when no history', () => {
    const r = base();
    r.history = [];
    const issues = validateReport(r, { mode: 'import' });
    expect(issues.some(i => i.field === 'history' && i.code === 'MISSING_HISTORY' && i.severity === 'INFO')).toBe(true);
  });
});
