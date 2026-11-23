/**
 * Relays this project has already measured as dead must not be dialled again.
 *
 * The registry records a retired endpoint with the reason and the date it was
 * observed. The guard's job is to make that record binding: once something is
 * listed as retired, no source file may still reach for it. Without it, a
 * measurement decays into a comment nobody reads.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-retired-relays.mjs';

const registry = (url: string) => `
export const RETIRED_RELAYS = [
  { url: '${url}', reason: 'measured unreachable', observed: '2026-08-01' },
];
`;

describe('guard-retired-relays', () => {
  it('passes when nothing dials a retired relay', () => {
    const run = runGuardIn(GUARD, {
      'src/config/publicInfrastructure.ts': registry('wss://dead.example'),
      'src/uses.ts': "connect('wss://alive.example');\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when a source file still reaches for a retired relay', () => {
    const run = runGuardIn(GUARD, {
      'src/config/publicInfrastructure.ts': registry('wss://dead.example'),
      'src/uses.ts': "connect('wss://dead.example');\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/dead\.example/);
  });

  it('does not flag the registry entry itself, which must name the URL', () => {
    // The record has to contain the string to be a record. A guard that could
    // not tell the difference would make the registry unwritable.
    const run = runGuardIn(GUARD, {
      'src/config/publicInfrastructure.ts': registry('wss://dead.example'),
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when shipped JSON in public/ still names a retired endpoint', () => {
    // Why the guard walks public/ at all: public/config.json listed cloudflare-ipfs.com,
    // retired in the registry, for as long as this guard existed, because it only ever
    // walked src/. Configuration a browser loads is as dialable as a .ts constant.
    const run = runGuardIn(GUARD, {
      'src/config/publicInfrastructure.ts': registry('https://dead.example/ipfs/'),
      'public/config.json': '{ "gateways": ["https://dead.example/ipfs/"] }\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/public\/config\.json/);
  });

  it('still runs when a tree has no public/ at all', () => {
    // Every case above builds a tree without public/. Walking it unconditionally crashed
    // the guard on all of them — including the clean one — so a missing folder has to be
    // a folder with nothing in it, not an error.
    const run = runGuardIn(GUARD, {
      'src/config/publicInfrastructure.ts': registry('wss://dead.example'),
    });
    expect(run.status).toBe(0);
    expect(run.output).not.toMatch(/ENOENT/);
  });
});
