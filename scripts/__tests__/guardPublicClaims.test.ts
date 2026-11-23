/**
 * The public face must not claim a retired product (guard-public-claims.mjs).
 *
 * On 2026-11-20 the README and the site's metadata still described Solana, Gun.js,
 * "quantum-safe encryption" and a public analytics dashboard, months after the code
 * dropped them, because every guard read code and none read the text people read.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-public-claims.mjs';

describe('guard-public-claims', () => {
  it('passes a front door that says what Starcom does', () => {
    const run = runGuardIn(GUARD, {
      'README.md': '# Starcom\n\nPublic data on a live globe. No server, no accounts, no analytics.\n',
      'index.html': '<meta name="description" content="Public data on a live 3D globe">\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on the README the repository had until 2026-11-20', () => {
    const run = runGuardIn(GUARD, {
      'README.md': 'Built on Solana and Ethereum, with Gun.js chat and quantum-safe encryption mandatory.\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/README\.md:1: "Solana"/);
    expect(run.output).toMatch(/Gun\.js/);
    expect(run.output).toMatch(/quantum-safe/);
  });

  it('reads index.html, files served from public/ and package.json description', () => {
    const run = runGuardIn(GUARD, {
      'index.html': '<meta content="Cyber operations for the Earth Alliance">\n',
      'public/analytics-dashboard.html': '<p>Our Looker Studio dashboard</p>\n',
      'public/.well-known/security-policy.md': 'Military-grade protection.\n',
      'package.json': JSON.stringify({ name: 'x', description: 'A dApp' }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/index\.html:1/);
    expect(run.output).toMatch(/public\/analytics-dashboard\.html:1/);
    expect(run.output).toMatch(/security-policy\.md:1/);
    expect(run.output).toMatch(/package\.json description/);
  });

  it('allows "post-quantum", which names a real class of algorithm', () => {
    const run = runGuardIn(GUARD, {
      'README.md': 'An inner ML-DSA-65 signature, a post-quantum-safe integrity proof.\n',
    });
    expect(run.status).toBe(0);
  });

  it('in tree mode reads every markdown file, but not the dated decision records', () => {
    const files = {
      'docs/missions/04-plan/retirement-audit.md': 'The wallet: six @solana packages, removed.\n',
      'src/lib/chat/README.md': 'Chat over Nostr.\n',
    };
    expect(runGuardIn(GUARD, files, { PUBLIC_CLAIMS_TREE: '.' }).status).toBe(0);

    const stale = runGuardIn(GUARD, { ...files, 'src/models/README.md': 'Reports stored on Solana.\n' }, { PUBLIC_CLAIMS_TREE: '.' });
    expect(stale.status).toBe(1);
    expect(stale.output).toMatch(/src\/models\/README\.md:1/);
  });
});
