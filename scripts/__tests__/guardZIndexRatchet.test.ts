/**
 * guard-z-index-ratchet: the count of raw z-indexes at or above 100 never
 * grows, and none reaches the preloader tier at all (K16, plan block D, step 1).
 *
 * Eleven layers sat at 9999 and 10000, each written to beat the last, so DOM
 * order decided what covered what among them, and the popup layer covered the
 * notifications meant to sit over it. Those tiers are tokens now: `--z-preloader`
 * and `--z-critical`. A raw number there would start the climb again, so it
 * fails however low the count is.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-z-index-ratchet.mjs';
const run = (files: Record<string, string>) => runGuardIn(GUARD, files);

describe('guard-z-index-ratchet', () => {
  it('fails on a raw z-index at the preloader tier or above, saying where, however low the count', () => {
    const r = run({ 'src/components/Popup.module.css': '.layer {\n  position: fixed;\n  z-index: 10000;\n}\n' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/components\/Popup\.module\.css:3 {2}10000/);
  });

  it('fails on one written inline in a component', () => {
    const r = run({ 'src/components/Debug.tsx': "export const D = () => <div style={{ zIndex: 9999 }} />;\n" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/Debug\.tsx:1 {2}9999/);
  });

  it('passes the tokens for those tiers, and a number below them', () => {
    expect(run({
      'src/components/Popup.module.css': '.layer { z-index: var(--z-modal); }\n.pre { z-index: var(--z-preloader); }\n',
      'src/components/Card.module.css': '.label { z-index: 2; }\n.panel { z-index: 2000; }\n',
    }).status).toBe(0);
  });

  it('reads no number in a comment', () => {
    expect(run({
      'src/components/Note.module.css': '/* It was z-index: 10000, written to beat a 9999. */\n.n { z-index: var(--z-notification); }\n',
      'src/components/Note.tsx': '// it claimed zIndex: 9999\nexport const n = 1;\n',
    }).status).toBe(0);
  });
});
