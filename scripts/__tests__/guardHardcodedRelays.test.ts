/**
 * A relay address is written in the registry and nowhere else.
 *
 * Each "FAILS" case is a way the relay lists came apart before 2026-09-19: a
 * service with its own list, a script with its own list, a spec that went on
 * naming a set after the app stopped dialling it.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-hardcoded-relays.mjs';

// Built from one another, as the real registry is — the guard has to load it,
// not pattern-match it, or the spread below reads as an empty set.
const REGISTRY = `
export const NAVCOM_SURFACE_RELAYS = ['wss://a.example', 'wss://b.example'] as const;
export const THE_RECORD_RELAY = 'wss://record.example';
export const FEDERATION_READ_RELAYS = [THE_RECORD_RELAY, ...NAVCOM_SURFACE_RELAYS] as const;
export const PUBLIC_IPFS_GATEWAYS = ['https://ipfs.example/ipfs/'];
export const RETIRED_NOSTR_RELAYS = [{ url: 'wss://gone.example', reason: 'connection timeout' }];
`;

const spec = (...relays: string[]) => `## Relay surface\n\n\`\`\`\n${relays.join('\n')}\n\`\`\`\n`;

const clean = {
  /*
   * A repository, because that is what these fixtures stand in for.
   *
   * Without this the tree looked like a Vercel deploy export — the guard tells
   * the two apart by whether `.git` is there, since an export legitimately
   * ships without docs/ — so the missing-spec case below took the skip branch
   * and exited 0 while asserting 1. It had been failing since the export hatch
   * was added, which is the hatch doing to this test exactly what the harness
   * was written to catch guards doing in production.
   */
  '.git/HEAD': 'ref: refs/heads/main\n',
  'src/config/publicInfrastructure.ts': REGISTRY,
  // The one module that reads the sets, so the build's configuration applies to every consumer.
  'src/services/nostr/publishTargets.ts': "import { NAVCOM_SURFACE_RELAYS } from '../../config/publicInfrastructure';\nexport const publishRelays = () => [...NAVCOM_SURFACE_RELAYS];\n",
  'src/uses.ts': "import { publishRelays } from './services/nostr/publishTargets';\nconnect(publishRelays());\n",
  'docs/spec/starcom-navcom-interchange.spec.md': spec('wss://a.example', 'wss://b.example'),
};

describe('guard-hardcoded-relays', () => {
  it('passes when every file imports its set and the spec lists the surface', () => {
    const run = runGuardIn(GUARD, clean);
    expect(run.output).toMatch(/every relay address is read from the registry/);
    expect(run.status).toBe(0);
  });

  it('lets a named stand-in harness type the stand-ins\' addresses, and nothing else', () => {
    const harness = "await form.fill(`wss://relay.${team}.example`);\n";
    expect(runGuardIn(GUARD, { ...clean, 'scripts/lib/twoBrowserHarness.mjs': harness }).status).toBe(0);
    const run = runGuardIn(GUARD, { ...clean, 'scripts/check-other.mjs': harness });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/scripts\/check-other\.mjs:1/);
  });

  it('FAILS when a source file writes out its own relay list', () => {
    const run = runGuardIn(GUARD, { ...clean, 'src/services/chat.ts': "const relays = [\n  'wss://a.example',\n];\n" });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/services\/chat\.ts:2\s+wss:\/\/a\.example/);
  });

  /*
   * Plan item 0.3. An operator points each channel somewhere through
   * publishTargets.ts (VITE_NOSTR_<CHANNEL>_RELAYS). A service that reads its
   * set from the registry directly is out of that configuration's reach, as
   * chat, federation and chat's emergency relays were.
   */
  it('FAILS when a service reads a relay set from the registry instead of through publishTargets', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/services/chat.ts': "import { NAVCOM_SURFACE_RELAYS } from '../config/publicInfrastructure';\nconnect(NAVCOM_SURFACE_RELAYS);\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/services\/chat\.ts\s+NAVCOM_SURFACE_RELAYS/);
  });

  it('FAILS on a single relay, and on an import spread over lines under another name', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/services/federation.ts': "import {\n  FEDERATION_READ_RELAYS as READ,\n  THE_RECORD_RELAY,\n} from '../config/publicInfrastructure';\nconnect([...READ, THE_RECORD_RELAY]);\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/federation\.ts\s+FEDERATION_READ_RELAYS/);
    expect(run.output).toMatch(/federation\.ts\s+THE_RECORD_RELAY/);
  });

  it('lets anything read what is not a relay set: gateways, and the record of retired relays', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/services/ipfs.ts': "import { PUBLIC_IPFS_GATEWAYS, RETIRED_NOSTR_RELAYS } from '../config/publicInfrastructure';\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on a script, not only on the app — the scripts are what publish', () => {
    const run = runGuardIn(GUARD, { ...clean, 'scripts/claim.mjs': 'const DEFAULT = ["wss://record.example"];\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/scripts\/claim\.mjs:1/);
  });

  it('FAILS on a template literal and on a hand-written served JSON file', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/dial.ts': 'open(`wss://b.example/path`);\n',
      'public/.well-known/relays.json': '{ "relays": ["wss://b.example"] }\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/dial\.ts:1/);
    expect(run.output).toMatch(/public\/\.well-known\/relays\.json:1/);
  });

  it('does not flag a usage line in a comment, which dials nothing', () => {
    const run = runGuardIn(GUARD, { ...clean, 'scripts/cli.mjs': '/**\n * Relays: --relay wss://… (repeatable)\n */\n' });
    expect(run.status).toBe(0);
  });

  it('does not flag tests, which pin addresses on purpose', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/x.test.ts': "expect(r).toEqual(['wss://a.example']);\n",
      'src/y.vitest.ts': "expect(r).toEqual(['wss://a.example']);\n",
      'src/__tests__/z.ts': "const r = 'wss://a.example';\n",
    });
    expect(run.status).toBe(0);
  });

  it('does not flag the two files the build writes from the registry', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'public/.well-known/nostr.json': '{ "relays": { "k": ["wss://record.example"] } }\n',
      'public/.well-known/starcom-node.json': '{ "relays": ["wss://record.example"] }\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when the spec names a relay the app does not dial', () => {
    const run = runGuardIn(GUARD, { ...clean, 'docs/spec/starcom-navcom-interchange.spec.md': spec('wss://a.example', 'wss://b.example', 'wss://gone.example') });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/names wss:\/\/gone\.example/);
  });

  it('lets the spec name a relay the app reads but does not publish to, as The Record (interchange rev 11)', () => {
    const run = runGuardIn(GUARD, { ...clean, 'docs/spec/starcom-navcom-interchange.spec.md': spec('wss://a.example', 'wss://b.example', 'wss://record.example') });
    expect(run.status).toBe(0);
  });

  it("lets the spec name a relay the app reads as another's mirror, and only through publishTargets (D-MX, MX27)", () => {
    const withMirror = REGISTRY + "export const RELAY_MIRRORS = { [THE_RECORD_RELAY]: ['wss://mirror.example'] };\n";
    const named = { ...clean, 'src/config/publicInfrastructure.ts': withMirror, 'docs/spec/starcom-navcom-interchange.spec.md': spec('wss://a.example', 'wss://b.example', 'wss://mirror.example') };
    expect(runGuardIn(GUARD, named).status).toBe(0);
    const bypass = runGuardIn(GUARD, { ...named, 'src/services/pool.ts': "import { RELAY_MIRRORS } from '../config/publicInfrastructure';\nuse(RELAY_MIRRORS);\n" });
    expect(bypass.status).toBe(1);
    expect(bypass.output).toMatch(/src\/services\/pool\.ts\s+RELAY_MIRRORS/);
  });

  it('FAILS when the spec omits a relay the app dials', () => {
    const run = runGuardIn(GUARD, { ...clean, 'docs/spec/starcom-navcom-interchange.spec.md': spec('wss://a.example') });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/omits wss:\/\/b\.example/);
  });

  it('FAILS when the spec is missing, rather than skipping the comparison', () => {
    const { 'docs/spec/starcom-navcom-interchange.spec.md': _spec, ...withoutSpec } = clean;
    const run = runGuardIn(GUARD, withoutSpec);
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/is missing/);
  });

  it('skips the comparison in a deploy export, which has no repository and no docs', () => {
    /*
     * The one case where a missing spec is a fact about the tree rather than
     * about the spec: .vercelignore excludes docs/, so the build container
     * never receives it. Tested rather than trusted, because it is the branch
     * that makes the guard exit 0 without checking anything — and an unwatched
     * skip is what this harness exists to stop.
     */
    const { '.git/HEAD': _git, 'docs/spec/starcom-navcom-interchange.spec.md': _spec, ...deployExport } = clean;
    const run = runGuardIn(GUARD, deployExport);
    expect(run.status).toBe(0);
    expect(run.output).toMatch(/deploy build export/);
  });

  it('FAILS rather than comparing the spec against nothing when the surface set cannot be read', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/config/publicInfrastructure.ts': "export const SOMETHING_ELSE = ['wss://a.example'];\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/refusing to compare the spec against nothing/);
  });
});
