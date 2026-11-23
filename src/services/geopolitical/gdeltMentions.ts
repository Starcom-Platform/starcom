/**
 * The coder's confidence in each event, from GDELT's Mentions table (decision D-DP, DP10).
 *
 * Each line of a Mentions file is one mention of an event in one article. Its Confidence is a
 * percent, 10 to 100, that "indicates how aggressively GDELT had to perform tasks like coreference
 * or grammatical restructuring to extract the event from that particular article" (GDELT 2.0 Event
 * codebook). An event is as sure as its surest mention: the codebook's own use of the field is to
 * find "the strongest and most unambiguous discussion of an event".
 */

const MENTION_COL = { GLOBAL_EVENT_ID: 0, CONFIDENCE: 11 } as const;
/** Every column up to Confidence must be there for a line to be read. */
const MIN_FIELDS = MENTION_COL.CONFIDENCE + 1;

/**
 * Each event's highest confidence in one Mentions file, gathered into `into` across a day's files.
 * Only the events in `ids` are kept, when given: a day's files mention a great many events, most of
 * them not in the snapshot. A line too short, or a confidence that is not a percent, is skipped.
 */
export function highestConfidence(
  text: string,
  ids?: ReadonlySet<string>,
  into: Map<string, number> = new Map(),
): Map<string, number> {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.replace(/\r$/, '').split('\t');
    if (fields.length < MIN_FIELDS) continue;
    const id = fields[MENTION_COL.GLOBAL_EVENT_ID];
    if (!id || (ids && !ids.has(id))) continue;
    const raw = fields[MENTION_COL.CONFIDENCE].trim();
    if (!/^\d+$/.test(raw)) continue;
    const confidence = Number(raw);
    if (confidence > 100) continue;
    if (confidence > (into.get(id) ?? -1)) into.set(id, confidence);
  }
  return into;
}
