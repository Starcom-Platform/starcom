/**
 * A title crosses the Navcom boundary in full; a report's content does not.
 *
 * The briefing was fixed once already — `description` used to bypass redact()
 * and cross verbatim. Titles were the same hole one field over, and stayed
 * open because the obvious fix is wrong: maskNames is two capitalised words,
 * so applying it to titles turns "Operation Northern Light" into
 * "[redacted:name] Light" and takes every place name with it.
 *
 * So titles get the unambiguous subset. An email address or a nine-digit run
 * in a mission title is never something anyone meant to publish; a capitalised
 * pair very often is.
 */
import { describe, it, expect } from 'vitest';
import { PackageComposer } from '../PackageComposer';

const compose = (over: Record<string, unknown> = {}) =>
  PackageComposer.compose({
    name: 'Op Northern Light',
    description: 'briefing text',
    license: 'PROPRIETARY',
    author: 'Starcom',
    reports: [{ id: 'r1', title: 'report title', content: 'body' }],
    intel: [],
    redaction: { maskEmails: true, maskNumbers: true, maskNames: true },
    ...over,
  } as never).manifest;

describe('the manifest title', () => {
  it('masks an email typed into a mission title', () => {
    const m = compose({ name: 'Op contact analyst@example.org now' });
    expect(m.name).not.toContain('analyst@example.org');
    expect(m.name).toContain('[redacted@email]');
  });

  it('masks a long digit run typed into a mission title', () => {
    const m = compose({ name: 'Op ref 447700900123' });
    expect(m.name).not.toContain('447700900123');
  });

  it('masks the same in a report title, which also crosses in full', () => {
    const m = compose({ reports: [{ id: 'r1', title: 'call 447700900123', content: 'body' }] });
    expect(JSON.stringify(m.reports)).not.toContain('447700900123');
  });

  it('does NOT apply the name heuristic to titles, which would destroy them', () => {
    // Over-masking a title is not a safe default: it is the one line an
    // operator reads to decide whether a package concerns them at all.
    const m = compose({ name: 'Operation Northern Light' });
    expect(m.name).toBe('Operation Northern Light');
  });

  it('still fully redacts the briefing, names included', () => {
    const m = compose({ description: 'meet John Smith at the depot' });
    expect(m.description).toContain('[redacted:name]');
  });
});
