import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * The published documents must not claim a capability the code refuses.
 *
 * ─── WHAT WENT WRONG, SO IT IS NOT REPEATED ────────────────────────────────
 *
 * `/.well-known/security-policy.md` told a reader — a journalist, a relay
 * operator, someone who believes a published claim about them is false — that
 * we could "tell you whether something is ours", and pointed at the node key in
 * the descriptor as the way to check.
 *
 * Two paths mint kind 30082 and only one uses that key. The command-line path
 * signs with it; the browser application signs with the OPERATOR'S key. So the
 * promised check would have classified nearly every genuine claim this project
 * produces as foreign, and would have lent any claim carrying the node key an
 * authority the whole design refuses (see refusal R-1: nothing is gated on a
 * credential, and a roster of legitimate publishers would be one).
 *
 * The document was written from what the architecture ought to permit rather
 * than what it does. That is the failure mode `security-policy.md` itself says
 * this project takes most seriously — "a capability that does not do what it
 * says" — so it gets a test rather than a fix and a hope.
 *
 * ─── WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
 *
 * Not the prose. A test that greps for sentences only proves the sentences were
 * copied into it, and would have passed against the wrong document just as
 * happily. It asserts the STRUCTURE the honest answer needs, and the one code
 * coupling that decides whether the answer stays true.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('published signing claims match the code', () => {
  // The descriptor as the build publishes it from the code now, not a copy an earlier build left on disk: the file is
  // generated and ignored by git, so a fresh clone has none, and an old copy could pass after the generator changed.
  execFileSync(path.join(root, 'node_modules', '.bin', 'tsx'), ['--tsconfig', 'tsconfig.app.json', 'scripts/publish-node-descriptor.mjs'], { cwd: root, stdio: 'pipe' });
  const descriptor = JSON.parse(read('public/.well-known/starcom-node.json'));

  it('the descriptor states who signs what, rather than leaving it to be inferred', () => {
    // A reader following identity.pubkey → nostr.json → NIP-05 lands on one key
    // and concludes it signs the claims. Every field here exists to head off a
    // specific wrong turn from that inference; an empty one is the same as a
    // missing one, so both fail.
    for (const field of [
      'nodeKeySigns',
      'operatorKeySigns',
      'absenceProvesNothing',
      'noRoster',
      'doNotFilterOn',
      'weightIsUnaffected',
    ]) {
      expect(typeof descriptor.signing?.[field]).toBe('string');
      expect(descriptor.signing[field].length).toBeGreaterThan(40);
    }
  });

  it('the identity block is not presented as the signer of claims', () => {
    // The descriptor may name a node key. What it must not do is describe that
    // key as what signs claims, because a consumer would then filter on it and
    // silently receive nothing.
    const identity = JSON.stringify(descriptor.identity ?? {}).toLowerCase();
    expect(identity).not.toContain('signs');
    expect(identity).not.toContain('signer');
  });

  it('the publishing path refuses to sign rather than minting a key', () => {
    /*
     * This is the coupling that decides whether the published claim stays true.
     *
     * `signing.operatorKeySigns` says the publishing path ships no key of this
     * node's and refuses to publish without one the caller supplies. The moment
     * signEvent gains a fallback that mints a key, that sentence becomes false
     * — and the app would begin publishing under a key its user never chose and
     * does not know they are answerable for.
     *
     * `generateSecretKey` is present elsewhere in the bundle and expected there
     * (guard-absent-capabilities records why). What must not happen is it
     * appearing on THIS path.
     */
    const src = read('src/services/intel/findings/FindingsBroadcastService.ts');
    const signEvent = src.slice(src.indexOf('private async signEvent'));
    const body = signEvent.slice(0, signEvent.indexOf('\n  }'));

    expect(body).not.toContain('generateSecretKey');
    expect(body).toMatch(/throw new Error\('No signing method available/);
  });

  it('the security policy states the limit of the signature check, not just the check', () => {
    // The check is sound evidence of presence and no evidence of absence. A
    // policy offering the first half without the second is the version that was
    // wrong. Asserted as a semantic fragment, not a sentence, so the document
    // can be rewritten freely as long as the limit survives the rewrite.
    const policy = read('public/.well-known/security-policy.md').toLowerCase();
    expect(policy).toContain('proves nothing');
    expect(policy).toContain('r-1');
  });
});

/**
 * The revalidation cadence, which the specification asks each node to publish
 * rather than fixing a number in the document.
 *
 * A published cadence is a promise about how long a retraction can go unnoticed
 * here — including one published at the request of a person asking to be
 * removed. A figure that drifts from the code is worse than no figure, because
 * a peer decides what our copies are worth by reading it.
 */
describe('published revalidation cadence matches the ingest', () => {
  const descriptor = JSON.parse(read('public/.well-known/starcom-node.json'));

  it('publishes a cadence and a lookback at all', () => {
    expect(typeof descriptor.revalidation?.cadence).toBe('string');
    expect(descriptor.revalidation.lookback).toMatch(/^P\d+D$/);
    // The limit is part of the claim, not a footnote to it: a session left
    // running relies on a subscription that can be dropped without notice.
    expect(typeof descriptor.revalidation.honestLimit).toBe('string');
  });

  it('publishes the lookback the code actually uses', () => {
    /*
     * Read out of the source rather than imported. Exporting the constant so a
     * test could see it would make it an export nothing outside its own file
     * uses, which is the shape guard-orphan-exports exists to refuse.
     */
    const src = read('src/services/intel/federation/FederationIngestService.ts');
    const m = src.match(/const DEFAULT_LOOKBACK_MS\s*=\s*([^;]+);/);
    expect(m).not.toBeNull();

    const ms = Function(`"use strict"; return (${m![1]});`)() as number;
    const days = ms / 86_400_000;
    expect(Number.isInteger(days)).toBe(true);
    expect(descriptor.revalidation.lookback).toBe(`P${days}D`);
  });
});
