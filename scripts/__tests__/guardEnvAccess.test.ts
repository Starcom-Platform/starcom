/**
 * Read import.meta.env one variable at a time, or ship the whole environment.
 *
 * Vite substitutes each STATIC member access with its literal value. It cannot
 * do that for any other shape, so it falls back to emitting the entire env
 * object — every VITE_ variable on the build machine, whether or not a line of
 * code reads it. The shipped bundle carried VITE_DISCORD_BOT_TOKEN,
 * VITE_TELEGRAM_BOT_TOKEN and VITE_CENSYS_SECRET because of that, none of them
 * referenced anywhere.
 *
 * Six places had it, and every one was DISGUISED — casts, optional chaining, a
 * computed key. The subtlest: import.meta.env.X is substituted and
 * import.meta.env?.X is not. One character apart, both look careful, and only
 * one ships the environment.
 *
 * I wrote this guard today and verified it by hand against three planted
 * defects. This is that check made permanent — a guard nobody has watched fail
 * is a claim, and this one is now the reason a credential cannot ride out
 * again.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const G = 'guard-env-access.mjs';
const F = 'src/config/thing.ts';

describe('guard-env-access', () => {
  it('allows a plain static read', () => {
    const run = runGuardIn(G, {
      [F]: "export const mode = import.meta.env.VITE_TARGET;\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on optional chaining, which Vite does not substitute', () => {
    const run = runGuardIn(G, {
      [F]: "export const url = import.meta.env?.VITE_SOLANA_RPC_URL;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/not substituted/i);
  });

  it('FAILS on a computed key', () => {
    const run = runGuardIn(G, {
      [F]: "export const get = (k: string) => import.meta.env[k];\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/computed key/i);
  });

  it('FAILS on a cast, which is how every real instance hid', () => {
    const run = runGuardIn(G, {
      [F]: "export const prod = (import.meta as any).env?.PROD;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/cast/i);
  });

  it('does not fire on a comment that DOCUMENTS the hazard', () => {
    // Five files in this repo legitimately explain the rule in prose. A guard
    // that failed on its own documentation would be deleted within a day.
    const run = runGuardIn(G, {
      [F]: '// Never write import.meta.env?.X — it is not substituted.\n'
        + '/* Nor import.meta.env[key], for the same reason. */\n'
        + 'export const ok = import.meta.env.VITE_TARGET;\n',
    });
    expect(run.status).toBe(0);
  });

  it('names the file and the line so the fix is findable', () => {
    const run = runGuardIn(G, {
      'src/a.ts': "export const a = import.meta.env.VITE_TARGET;\n",
      'src/b.ts': "export const b = import.meta.env?.VITE_TARGET;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toContain('src/b.ts');
    expect(run.output).not.toContain('src/a.ts');
  });
});
