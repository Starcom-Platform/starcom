// reportSearchIndex.ts - lightweight in-memory search index for IntelReportUI
// AND semantics across query tokens. Ranking weights configurable.

import { IntelReportUI } from '../../../types/intel/IntelReportUI';

export interface ReportSearchIndexEntry {
  id: string;
  tokenWeights: Record<string, number>; // token -> cumulative weight
  length: number; // number of distinct tokens (for potential normalization)
}

export interface ReportSearchIndex {
  entries: ReportSearchIndexEntry[];
  tokenToDocIds: Record<string, Set<string>>; // inverted map
  weights: typeof DEFAULT_WEIGHTS;
}

const DEFAULT_WEIGHTS = {
  title: 3,
  tags: 2,
  summary: 1,
  content: 1,
  conclusions: 1,
  recommendations: 1,
  methodology: 1
};

/**
 * Letters and digits of any script. It was `[a-z0-9]`, so a name written in
 * Cyrillic, Arabic or Chinese had no words at all, and a search for one
 * matched everything (reviewed after plan item 1.4).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Whether a query has any word to search for. */
export function hasSearchWords(query: string): boolean {
  return tokenize(query).length > 0;
}

/**
 * Something to index: its id, and the text (or ready-made tokens) of each
 * field with how much a match there counts. Reports, cases and missions all
 * go through this (plan item 1.4), so they are found by the same rules.
 */
export interface IndexedDoc {
  id: string;
  fields: Array<{ weight: number } & ({ text: string } | { tokens: string[] })>;
}

export function buildDocIndex(docs: IndexedDoc[], weights = DEFAULT_WEIGHTS): ReportSearchIndex {
  const entries: ReportSearchIndexEntry[] = [];
  const tokenToDocIds: Record<string, Set<string>> = {};
  for (const doc of docs) {
    const tokenWeights: Record<string, number> = {};
    for (const field of doc.fields) {
      const tokens = 'tokens' in field ? field.tokens : tokenize(field.text);
      for (const t of tokens) tokenWeights[t] = (tokenWeights[t] || 0) + field.weight;
    }
    entries.push({ id: doc.id, tokenWeights, length: Object.keys(tokenWeights).length });
    for (const token of Object.keys(tokenWeights)) {
      if (!tokenToDocIds[token]) tokenToDocIds[token] = new Set();
      tokenToDocIds[token].add(doc.id);
    }
  }
  return { entries, tokenToDocIds, weights };
}

export function buildIndex(reports: IntelReportUI[], weights = DEFAULT_WEIGHTS): ReportSearchIndex {
  return buildDocIndex(reports.map((r) => ({
    id: r.id,
    fields: [
      { text: r.title, weight: weights.title },
      ...(r.tags ? [{ tokens: r.tags.map((t) => t.toLowerCase()), weight: weights.tags }] : []),
      ...(r.summary ? [{ text: r.summary, weight: weights.summary }] : []),
      { text: r.content, weight: weights.content },
      ...(r.conclusions ?? []).map((c) => ({ text: c, weight: weights.conclusions })),
      ...(r.recommendations ?? []).map((rec) => ({ text: rec, weight: weights.recommendations })),
      ...(r.methodology ?? []).map((m) => ({ text: m, weight: weights.methodology })),
    ],
  })), weights);
}

export interface SearchResult { id: string; score: number; }

/**
 * `prefixLast`: the last word matches any token it begins, as a search box
 * does while a word is still being typed ("berth 4 cra" finds "cranes").
 */
export function search(index: ReportSearchIndex, query: string, options: { prefixLast?: boolean } = {}): SearchResult[] {
  const rawTokens = tokenize(query);
  const tokens = Array.from(new Set(rawTokens));
  if (tokens.length === 0) return index.entries.map(e => ({ id: e.id, score: 0 }));
  // The last word, while typed, stands for every token it begins.
  const last = tokens[tokens.length - 1];
  const expansions = options.prefixLast ? Object.keys(index.tokenToDocIds).filter((t) => t.startsWith(last)) : [last];
  const docsFor = (t: string, i: number): Set<string> | undefined => {
    if (!(options.prefixLast && i === tokens.length - 1)) return index.tokenToDocIds[t];
    const all = new Set<string>();
    for (const e of expansions) index.tokenToDocIds[e].forEach((id) => all.add(id));
    return all.size > 0 ? all : undefined;
  };

  // AND semantics: start with set of docs containing first token
  let candidateIds: Set<string> | null = null;
  for (const [i, t] of tokens.entries()) {
    const docs = docsFor(t, i);
    if (!docs) return []; // token not present anywhere => no matches
    candidateIds = candidateIds ? intersect(candidateIds, docs) : new Set(docs);
    if (candidateIds.size === 0) return [];
  }
  if (!candidateIds) return [];

  // Score candidates by summing token weights (could add normalization later)
  const scores: SearchResult[] = [];
  // Looked up by id, not scanned for: one pass per candidate was a pass over every entry.
  const byId = new Map(index.entries.map((e) => [e.id, e]));
  for (const id of candidateIds) {
    const entry = byId.get(id)!;
    let score = 0;
    for (const [i, t] of tokens.entries()) {
      if (options.prefixLast && i === tokens.length - 1) {
        // A loop, not Math.max(...spread): a one-letter prefix of a large
        // vocabulary overflowed the call stack, and the header swallowed it.
        let best = 0;
        for (const e of expansions) best = Math.max(best, entry.tokenWeights[e] || 0);
        score += best;
      } else {
        score += entry.tokenWeights[t] || 0;
      }
    }
    scores.push({ id, score });
  }
  return scores.sort((a,b)=> b.score - a.score || a.id.localeCompare(b.id));
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  // iterate smaller set
  const small = a.size < b.size ? a : b;
  const large = a.size < b.size ? b : a;
  for (const v of small) if (large.has(v)) out.add(v);
  return out;
}
