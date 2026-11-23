/**
 * The bundle secret guard fails a build that inlines a credential, and lets a
 * public key through only by name and with a reason.
 *
 * Every deploy from 2026-09-29 13:44 on failed here and nowhere else: the
 * deploy host sets VITE_MECHA_JONO_PUBKEY, "KEY" is in its name, and Raver
 * Watch reads only notes that key signed, so its value is in the bundle by
 * design. A local build passed, because the variable is set only on the host.
 * The first test is that failure, reproduced.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const MECHA_JONO = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const bundleWith = (literal: string) => ({ 'dist/assets/index-abc123.js': `const publishers=["${literal}"];` });

describe('guard-bundle-secrets', () => {
  it("lets Mecha Jono's public key through when the deploy host sets it, and says why", () => {
    const run = runGuardIn('guard-bundle-secrets.mjs', bundleWith(MECHA_JONO), { VITE_MECHA_JONO_PUBKEY: MECHA_JONO });
    expect(run.output).not.toMatch(/LEAKED/);
    expect(run.output).toMatch(/allowed {2}VITE_MECHA_JONO_PUBKEY — /);
    expect(run.status).toBe(0);
  });

  it('still fails a build that inlines a value its variable calls a key', () => {
    const run = runGuardIn('guard-bundle-secrets.mjs', bundleWith('a1b2c3d4e5f6a7b8c9d0e1f2'), { VITE_SHODAN_API_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2' });
    expect(run.output).toMatch(/LEAKED {3}VITE_SHODAN_API_KEY/);
    expect(run.status).toBe(1);
  });

  it('fails on a Nostr secret key in the bundle, whatever variable it came from', () => {
    const nsec = `nsec1${'q'.repeat(58)}`;
    const run = runGuardIn('guard-bundle-secrets.mjs', bundleWith(nsec), { VITE_MECHA_JONO_PUBKEY: MECHA_JONO });
    expect(run.output).toMatch(/LEAKED {3}Nostr secret key/);
    expect(run.status).toBe(1);
  });
});
