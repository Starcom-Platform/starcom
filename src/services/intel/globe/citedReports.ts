/**
 * Which reports a received package cites, and what its signer published
 * (plan item 9.14, decision G6).
 *
 * A Mission Package names reports in `reports[].id`, and the spec does not
 * say what that id names. Starcom's own packages cite nothing there (D1: they
 * cross as counts). Mecha Jono's cite the tail of their report's `d` tag:
 * `ic-ein-51f0f8bfc7` for `30023:<their key>:starcom-intel-ic-ein-51f0f8bfc7`.
 * Starcom's own reports carry `starcom_intel_<cid>`, so nothing here assumes
 * one convention. A citation is honoured where, among the reports the same
 * key signed, it names exactly one: by its whole address, by its `d` tag, or
 * by a `d` tag ending in `-<id>` or `_<id>`. Anything else is said to be
 * cited and not found, never guessed.
 *
 * A report published as several features is stored once per feature
 * (`<address>#<n>`), and a citation of it draws every piece.
 */
import { fromRelayFeed } from '../bundles/bundleDistribution';

export interface PublishedReport {
  id: string;
  author: string;
  history?: ReadonlyArray<{ action?: string; user?: string }>;
}

/** A stored report's address, without the feature suffix, and its `d` tag, when it has one. */
function addressOf(id: string): { base: string; pubkey: string | null; d: string | null } {
  const base = id.split('#')[0];
  const parts = base.split(':');
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    return { base, pubkey: parts[1], d: parts.slice(2).join(':') };
  }
  return { base, pubkey: null, d: null };
}

/** The reports the relay feed brought from this key: what it published, as far as this node has it. */
export function publishedBy(pubkey: string, reports: readonly PublishedReport[]): string[] {
  return reports.filter((r) => r.author === pubkey && fromRelayFeed(r)).map((r) => r.id);
}

/** The stored reports a package's citations name, among what its signer published; and those naming none. */
export function resolveCitations(
  signer: string,
  cites: readonly string[],
  reports: readonly PublishedReport[],
): { resolved: string[]; unresolved: string[] } {
  const theirs = reports.filter((r) => r.author === signer && fromRelayFeed(r));
  const byBase = new Map<string, string[]>();
  for (const r of theirs) {
    const { base } = addressOf(r.id);
    byBase.set(base, [...(byBase.get(base) ?? []), r.id]);
  }
  const bases = [...byBase.keys()];

  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const cite of cites) {
    // Most exact first; a rule that names more than one report settles nothing.
    const rules: Array<(base: string) => boolean> = [
      (base) => base === cite,
      (base) => addressOf(base).d === cite,
      (base) => {
        const d = addressOf(base).d;
        return d !== null && (d.endsWith(`-${cite}`) || d.endsWith(`_${cite}`));
      },
    ];
    let found: string | null = null;
    let ambiguous = false;
    for (const rule of rules) {
      const matches = bases.filter(rule);
      if (matches.length === 1) { found = matches[0]; break; }
      if (matches.length > 1) { ambiguous = true; break; }
    }
    if (found && !ambiguous) {
      for (const id of byBase.get(found) ?? []) if (!resolved.includes(id)) resolved.push(id);
    } else {
      unresolved.push(cite);
    }
  }
  return { resolved, unresolved };
}
