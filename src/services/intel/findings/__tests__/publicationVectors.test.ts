/**
 * One policy, two implementations, one set of vectors.
 *
 * scripts/peer/publication.mjs is a standalone reference a peer can copy, port,
 * or ignore in favour of their own. Starcom's TypeScript is a second
 * implementation. Neither is authoritative — the VECTORS are, and this runs both
 * against them.
 *
 * WHY NOT A SHARED LIBRARY: a single module everyone imports would make Starcom
 * the moderator of what other people may publish, which is the role this whole
 * architecture avoids. We do not host their content and do not hold their keys;
 * we should not own their policy either. Agreeing on OUTCOMES while disagreeing
 * about implementation is what lets nodes cooperate without one being in charge.
 *
 * This lives in the test suite rather than the build chain deliberately. The
 * build needs tsx to import app TypeScript, and a step that dies there costs
 * deploys — this repository lost five months to exactly that. Tests run on every
 * change and cost nothing when they pass.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePublication as starcom } from '../publicationPolicy';
// @ts-expect-error — .mjs reference implementation, deliberately untyped
import { evaluatePublication as reference } from '../../../../../scripts/peer/publication.mjs';

const DIR = 'docs/spec/publication-vectors';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')) as {
  vectors: Array<{ name: string; file: string }>;
};

type Vector = {
  name: string;
  description: string;
  subjectKind: string;
  options?: Record<string, unknown>;
  expect: { allowed: boolean; reasonMatches?: string };
};

const vectors: Vector[] = index.vectors.map(
  v => JSON.parse(fs.readFileSync(path.join(DIR, v.file), 'utf8')) as Vector,
);

describe('publication policy vectors', () => {
  it('ships vectors covering every branch worth pinning', () => {
    // A corpus that shrinks silently is a corpus nobody notices going stale.
    expect(vectors.length).toBeGreaterThanOrEqual(20);
  });

  for (const v of vectors) {
    describe(v.name, () => {
      for (const [label, impl] of [
        ['starcom', starcom],
        ['reference', reference],
      ] as const) {
        it(`${label}: ${v.description.slice(0, 70)}`, () => {
          const got = (impl as (k: string, o: unknown) => { allowed: boolean; reason?: string })(
            v.subjectKind, v.options ?? {},
          );
          expect(got.allowed).toBe(v.expect.allowed);
          if (v.expect.reasonMatches) {
            // A refusal that does not say why cannot be acted on, so the reason
            // is part of the contract rather than decoration.
            expect(String(got.reason ?? '')).toContain(v.expect.reasonMatches);
          }
        });
      }
    });
  }
});
