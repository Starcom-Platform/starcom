/**
 * Which of a key's published reports a package it signed cites (plan item
 * 9.14, decision G6).
 *
 * The spec does not say what `reports[].id` names. Mecha Jono's packages cite
 * `ic-ein-51f0f8bfc7`, the tail of their report's `d` tag
 * (`starcom-intel-ic-ein-51f0f8bfc7`); Starcom's own reports carry
 * `starcom_intel_<cid>`. So a citation is honoured where it names, among the
 * reports the same key signed, exactly one: by its address, its `d` tag, or a
 * `d` tag ending in it. Anything else is said to be cited and not found.
 */
import { describe, it, expect } from 'vitest';
import { publishedBy, resolveCitations } from '../citedReports';

const MECHA = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const feed = [{ action: 'IMPORTED', user: 'nostr' }];
const r = (id: string, author = MECHA, history = feed) => ({ id, author, history });

const reports = [
  r(`30023:${MECHA}:starcom-intel-ic-ein-51f0f8bfc7`),
  r(`30023:${MECHA}:starcom-intel-ic-ein-2#0`),
  r(`30023:${MECHA}:starcom-intel-ic-ein-2#1`),
  r(`30023:${MECHA}:plain-d`),
  r(`30023:${MECHA}:first-dup`),
  r(`30023:${MECHA}:second-dup`),
  r(`30023:${OTHER}:starcom-intel-theirs`, OTHER),
  r('e'.repeat(64)),
  r('intel-local-1', MECHA, []),
];

describe('resolveCitations', () => {
  it("honours a citation by the tail of the report's d tag, as Mecha Jono's packages cite", () => {
    expect(resolveCitations(MECHA, ['ic-ein-51f0f8bfc7'], reports)).toEqual({
      resolved: [`30023:${MECHA}:starcom-intel-ic-ein-51f0f8bfc7`], unresolved: [],
    });
  });

  it('honours one by its whole address, or its d tag', () => {
    expect(resolveCitations(MECHA, [`30023:${MECHA}:plain-d`], reports)).toEqual({ resolved: [`30023:${MECHA}:plain-d`], unresolved: [] });
    expect(resolveCitations(MECHA, ['plain-d'], reports)).toEqual({ resolved: [`30023:${MECHA}:plain-d`], unresolved: [] });
  });

  it('draws every piece of a report published as several features', () => {
    expect(resolveCitations(MECHA, ['ic-ein-2'], reports).resolved).toEqual([
      `30023:${MECHA}:starcom-intel-ic-ein-2#0`, `30023:${MECHA}:starcom-intel-ic-ein-2#1`,
    ]);
  });

  it('never finds a report another key signed', () => {
    expect(resolveCitations(MECHA, ['theirs', `30023:${OTHER}:starcom-intel-theirs`], reports)).toEqual({
      resolved: [], unresolved: ['theirs', `30023:${OTHER}:starcom-intel-theirs`],
    });
  });

  it('leaves a citation that could name two reports unresolved, rather than pick one', () => {
    expect(resolveCitations(MECHA, ['dup'], reports)).toEqual({ resolved: [], unresolved: ['dup'] });
  });

  it('says which it could not find', () => {
    expect(resolveCitations(MECHA, ['ic-ein-51f0f8bfc7', 'nowhere'], reports)).toEqual({
      resolved: [`30023:${MECHA}:starcom-intel-ic-ein-51f0f8bfc7`], unresolved: ['nowhere'],
    });
  });
});

describe('publishedBy', () => {
  it("is every report the relay feed brought from that key, and nothing of this workspace's own", () => {
    expect(publishedBy(MECHA, reports)).toEqual([
      `30023:${MECHA}:starcom-intel-ic-ein-51f0f8bfc7`,
      `30023:${MECHA}:starcom-intel-ic-ein-2#0`,
      `30023:${MECHA}:starcom-intel-ic-ein-2#1`,
      `30023:${MECHA}:plain-d`,
      `30023:${MECHA}:first-dup`,
      `30023:${MECHA}:second-dup`,
      'e'.repeat(64),
    ]);
  });
});
