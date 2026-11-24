/**
 * The retired "Earth Alliance" framing stays out of everything the app is built from
 * (guard-old-framing.mjs).
 *
 * On 2026-11-24 it was still under the wordmark, in the support appeal, on the chat
 * contacts' heading and in a Globe settings colour scheme, months after the front door
 * dropped it, because the front-door guard does not read the app's own code.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-old-framing.mjs';

describe('guard-old-framing', () => {
  it('passes code that says what each thing is', () => {
    const run = runGuardIn(GUARD, {
      'src/components/Header.tsx': '<div className={styles.version}>v{getAppVersion()}</div>\n',
      'src/types/Chat.ts': 'export interface ChatContact { pubkey: string; isVerified: boolean }\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on the header, the contacts and the theme as they were until 2026-11-24', () => {
    const run = runGuardIn(GUARD, {
      'src/components/Header.tsx': '<div className={styles.version}>Earth Alliance</div>\n',
      'src/types/Chat.ts': 'export interface EarthAllianceContact { earthAllianceId: string }\n',
      'src/styles/theme.css': '/* earth-alliance theme */\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/components\/Header\.tsx:1: "Earth Alliance"/);
    expect(run.output).toMatch(/src\/types\/Chat\.ts:1: "EarthAlliance"/);
    expect(run.output).toMatch(/src\/styles\/theme\.css:1: "earth-alliance"/);
  });

  it('reads scripts, the extension, index.html, package.json and files served from public/', () => {
    const run = runGuardIn(GUARD, {
      'scripts/setup.sh': 'echo "FOR THE EARTH ALLIANCE"\n',
      'extension/entrypoints/popup.html': '<h1>Earth Alliance Uplink</h1>\n',
      'index.html': '<meta content="Cyber operations for the Earth Alliance">\n',
      'package.json': JSON.stringify({ scripts: { 'test:earth-alliance': 'tsx x.ts' } }),
      'public/about.html': '<p>Earth_Alliance</p>\n',
    });
    expect(run.status).toBe(1);
    for (const f of ['scripts/setup.sh', 'extension/entrypoints/popup.html', 'index.html', 'package.json', 'public/about.html']) {
      expect(run.output).toContain(`${f}:1`);
    }
  });

  it('allows Earth Alliance News, a peer publication named by its own name', () => {
    const run = runGuardIn(GUARD, {
      'scripts/claim.mjs': '// reported by Earth Alliance News, who hit it first\n',
    });
    expect(run.status).toBe(0);
  });

  it('does not read docs, which may record what was removed, or the extension build output', () => {
    const run = runGuardIn(GUARD, {
      'docs/missions/04-plan/note.md': 'The header said "Earth Alliance" until 24 Nov 2026.\n',
      'extension/.output/chrome-mv3/popup.html': '<h1>Earth Alliance</h1>\n',
      'src/ok.ts': 'export const ok = true;\n',
    });
    expect(run.status).toBe(0);
  });
});
