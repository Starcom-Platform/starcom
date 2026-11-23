/**
 * Search that finds records (plan item 1.4, story S24): cases, missions and
 * reports, by what they are called, their number, or what they say, through
 * the same index the Intel Dashboard searches reports with. Every word must
 * match; the last one matches by its start, since it is still being typed.
 * What a record is called counts for more than what it mentions.
 */
import { buildDocIndex, hasSearchWords, search, type IndexedDoc, type ReportSearchIndex } from '../intel/search/reportSearchIndex';
import { isEncryptedAtRest } from '../intel/IntelWorkspaceManager';
import type { RecordKind } from '../../routes/recordLink';

interface Common { id: string; title: string; tags?: string[]; sample?: boolean }
export interface SearchableRecords {
  reports: Array<Common & { content: string; summary?: string }>;
  cases: Array<Common & { caseNumber?: string; description?: string }>;
  missions: Array<Common & { missionNumber?: string; briefing?: string }>;
}

export interface RecordHit {
  kind: RecordKind;
  id: string;
  title: string;
  number?: string;
  sample: boolean;
}

const WEIGHT = { title: 3, number: 3, tags: 2, text: 1 };
const KEYS = { case: 'c', mission: 'm', report: 'r' } as const;
const tags = (r: Common) => (r.tags ?? []).map((t) => t.toLowerCase());

/** The records, indexed once, to search as a query is typed (reviewed after plan item 1.4). */
export interface RecordIndex { index: ReportSearchIndex; hits: Map<string, RecordHit> }

/**
 * A protected record's text is ciphertext at rest, a JSON of byte values, and
 * indexed it matched "12" or "iv" in every protected record. Only what can
 * be read is searched: its name and number still are.
 */
const readable = (text: string | undefined) => (text && !isEncryptedAtRest(text) ? text : undefined);

export function indexRecords(records: SearchableRecords): RecordIndex {
  const hits = new Map<string, RecordHit>();
  const docs: IndexedDoc[] = [];
  const add = (kind: RecordKind, r: Common, number: string | undefined, text: string | undefined) => {
    const key = `${KEYS[kind]}:${r.id}`;
    hits.set(key, { kind, id: r.id, title: r.title, ...(number ? { number } : {}), sample: r.sample === true });
    docs.push({
      id: key,
      fields: [
        { text: r.title, weight: WEIGHT.title },
        ...(number ? [{ text: number, weight: WEIGHT.number }] : []),
        { tokens: tags(r), weight: WEIGHT.tags },
        ...(readable(text) ? [{ text: text!, weight: WEIGHT.text }] : []),
      ],
    });
  };
  records.cases.forEach((c) => add('case', c, c.caseNumber, c.description));
  records.missions.forEach((m) => add('mission', m, m.missionNumber, m.briefing));
  records.reports.forEach((r) => add('report', r, undefined, [readable(r.summary), readable(r.content)].filter(Boolean).join(' ')));
  return { index: buildDocIndex(docs), hits };
}

export function searchRecordIndex(query: string, { index, hits }: RecordIndex): RecordHit[] {
  // A query with no word in it ("-", "#") matched every record, score 0.
  if (!hasSearchWords(query)) return [];
  return search(index, query, { prefixLast: true }).map(({ id }) => hits.get(id)!);
}

export function searchRecords(query: string, records: SearchableRecords): RecordHit[] {
  return searchRecordIndex(query, indexRecords(records));
}
