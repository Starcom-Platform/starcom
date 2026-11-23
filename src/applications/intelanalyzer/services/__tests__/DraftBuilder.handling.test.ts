/**
 * DraftBuilder on the two handling axes.
 *
 * DraftBuilder.classification.test.ts covered the LEGACY path and kept passing
 * unchanged through the re-key, which was the evidence that a draft built the
 * old way still behaved the old way. It is deleted in 7c along with the option
 * it exercised — every one of its cases has an equivalent here, checked
 * one by one before removing it.
 *
 * ─── THE BRANCH THAT HAD NO REACHABLE INPUT ────────────────────────────────
 *
 * Two decisions were made from one ladder value at one threshold:
 *
 *   does the watchlist section appear?   -> the tier, at one threshold
 *   are the entity names masked?         -> the tier, at the same threshold
 *
 * Identical conditions, so whenever the section appeared, redaction was already
 * on. The `else` emitting `- Entities: x, y` could not execute. Enumerated
 * before the change: all 8 combinations of 4 levels x redactSensitive gave
 * entitiesInClear = false.
 *
 * Splitting the questions onto the axis that means each one makes it reachable:
 * 'limited' + 'open' is an internal draft whose contents need no masking.
 */
import { describe, it, expect } from 'vitest';
import { DraftBuilder } from '../DraftBuilder';
import type { DraftExportOptions } from '../DraftBuilder';

const board = {
  id: 'b3', name: 'Charlie', savedAt: 0,
  state: {
    view: 'table', filters: {}, selection: null, notes: 'n', pins: [],
    watch: { tags: ['alpha'], entities: ['x', 'y'] }
  }
} as any;

const build = (opts: Partial<DraftExportOptions>) =>
  DraftBuilder.buildFromBoard(board, {
    title: 't', includeFilters: false, includeWatchlists: true, redactSensitive: false, ...opts
  });

describe('the two axes decide two different things', () => {
  /**
   * The formerly-unreachable state. If this ever goes back to [REDACTED], the
   * two questions have collapsed into one again.
   */
  it("'limited' + 'open': watchlists appear WITH real entity names", () => {
    const out = build({ visibility: 'limited', sensitivity: 'open' }).report.content;
    expect(out).toMatch(/## Context: Watchlists/);
    expect(out).toMatch(/Entities: x, y/);
    expect(out).not.toMatch(/\[REDACTED\]/);
  });

  it("'limited' + 'careful': watchlists appear, entities masked", () => {
    const out = build({ visibility: 'limited', sensitivity: 'careful' }).report.content;
    expect(out).toMatch(/## Context: Watchlists/);
    expect(out).toMatch(/Entities:\s*\[REDACTED\]/);
    expect(out).not.toMatch(/Entities: x, y/);
  });

  it("'private' + 'protected': watchlists appear, entities masked", () => {
    const out = build({ visibility: 'private', sensitivity: 'protected' }).report.content;
    expect(out).toMatch(/## Context: Watchlists/);
    expect(out).toMatch(/Entities:\s*\[REDACTED\]/);
  });

  /**
   * A public draft does not carry our watchlists at all, whatever the content
   * axis says. Distribution decides this one on its own.
   */
  it.each(['open', 'careful', 'protected'] as const)(
    "'public' + '%s': no watchlist section at any sensitivity",
    (sensitivity) => {
      const res = build({ visibility: 'public', sensitivity });
      expect(res.report.content).not.toMatch(/## Context: Watchlists/);
      expect(res.report.tags).toEqual([]);
    }
  );

  /**
   * Sensitivity does not smuggle the section back in. A 'protected' public
   * draft is still public: it withholds the section rather than including a
   * masked one.
   */
  it("'public' + 'protected' withholds the section rather than masking it", () => {
    const out = build({ visibility: 'public', sensitivity: 'protected' }).report.content;
    expect(out).not.toMatch(/## Context: Watchlists/);
    expect(out).not.toMatch(/\[REDACTED\]/);
  });

  it('redactSensitive still forces masking on its own', () => {
    const out = build({ visibility: 'limited', sensitivity: 'open', redactSensitive: true }).report.content;
    expect(out).toMatch(/Entities:\s*\[REDACTED\]/);
  });

  /**
   * Unmarked means unstated, and unstated reads as the open case: a public
   * draft, so no internal context. Same as the old UNCLASSIFIED default.
   */
  it('an unmarked draft carries no watchlist section', () => {
    const res = build({});
    expect(res.report.content).not.toMatch(/## Context: Watchlists/);
    expect(res.report.tags).toEqual([]);
  });

  /*
   * A test named 'prefers an explicit axis over a legacy classification' stood
   * here, passing both a tier and the axes to prove the axes won. The option
   * no longer accepts a tier, so there is nothing left to prefer over — the
   * precedence it pinned is now a property of the type, not of the code.
   */
});

describe('tags follow the same gate as the section', () => {
  it('emits watch tags exactly when the section is emitted', () => {
    expect(build({ visibility: 'limited', sensitivity: 'open' }).report.tags).toEqual(['alpha']);
    expect(build({ visibility: 'limited', sensitivity: 'protected' }).report.tags).toEqual(['alpha']);
    expect(build({ visibility: 'public', sensitivity: 'protected' }).report.tags).toEqual([]);
  });
});
