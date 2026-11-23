/**
 * How Starcom says what it does not know.
 *
 * Every honesty defect this codebase has produced was a WORDING failure before
 * it was a visual one:
 *
 *   - `showLow` never meant "someone said low" — it meant "nobody classified
 *     this", and the name hid an entire filtered-out population.
 *   - A table offered "open to view" for a description whose key was gone.
 *   - "Showing N of M" where M was derived from the same capped array as N, so
 *     the sentence could never be true.
 *   - A case replay rendered a tidy sequence for a log missing six of fourteen
 *     action types, and raised no gap, because nothing had been written to be
 *     inconsistent with.
 *
 * Sixteen components render some form of epistemic status with no shared
 * vocabulary between them. A shared COMPONENT that carries the wrong sentence
 * is no better than sixteen that do — so the vocabulary starts here, with the
 * sentences, and the visual primitive is built on top rather than the reverse.
 *
 * The rule every function below obeys: **state the absence, never imply its
 * cause.** "Not shown" is a different claim from "nothing found", "no
 * coordinates" is different from "not found", and "nobody said" is different
 * from "somebody said low". Where a cause is genuinely known it is named;
 * where it is not, the sentence stops.
 *
 * Phrasings marked EXTRACTED came verbatim from GlobeIntelStatus, whose twelve
 * tests are the specification for them. They are the most carefully worded
 * disclosures in the app and are the reason this module reads the way it does.
 */

/**
 * Two tones, and the rule that decides between them.
 *
 * DECIDED, so it is not re-argued per surface — sixteen components disclose
 * this kind of thing and the split has to mean the same in all of them.
 *
 *   warn  — something is DEGRADED or MISSING that the reader may need to act
 *           on. The system could not do the thing, or the integrity of the
 *           data is in question. Expired layers, unplaceable records, a
 *           degraded computation, fabricated input, structural blindness.
 *
 *   info  — a NORMAL, EXPECTED reduction. The operator's own choice, an
 *           ordinary configured cap, or an explanation of an empty state.
 *           A time cursor, a priority filter, a maxReports cap, a lone source.
 *
 * If everything warns, nothing does. That was the live risk: five of seven
 * axes rendered amber in the design sketch, which trains a reader to skip the
 * corner where the real problems appear.
 *
 * The hard case is a cap, because two of them fall on opposite sides.
 * `truncatedMarks` warns: it is the analysis layer's own budget, and dropping
 * findings can hide a contradiction the reader needed. `matchedVersusShown`
 * notes: it is a maxReports limit the operator configured, doing exactly what
 * they set it to do. The question is not "was data withheld" — it always was —
 * but "would the reader be surprised, and can they act on it".
 *
 * WHAT THIS VOCABULARY DOES NOT OWN: the surface. Tone and wording are shared;
 * chrome is per-context by design. The globe overlay composites over a rendered
 * planet and stays dark in every theme, while a table banner follows the
 * viewer's. Forcing one component across both would mean the globe borrowing a
 * Material surface it cannot sit on. Consumers render `tone` in their own
 * idiom.
 */
export type DisclosureTone = 'warn' | 'info';

export interface Disclosure {
  tone: DisclosureTone;
  text: string;
}

const warn = (text: string): Disclosure => ({ tone: 'warn', text });
const info = (text: string): Disclosure => ({ tone: 'info', text });
/** A count in words: "1 mark", "3 marks". Never "(s)" (the house style, plan item 3.1). */
const count_ = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Prefix a sentence with a source label when there is more than one source.
 *
 * With a single layer the prefix is noise; with several, one healthy source
 * must not be able to vouch for a broken one. `cap` keeps the sentence reading
 * correctly either way rather than emitting a stray lowercase opening word.
 */
export const labelled = (label: string, sentence: string): string =>
  label ? `${label}${sentence}` : sentence.charAt(0).toUpperCase() + sentence.slice(1);

/** EXTRACTED. A layer past its display limit — withheld, which is not "empty". */
export const withheldAsExpired = (id: string, ageMs: number): Disclosure =>
  warn(`${id} withheld — ${(ageMs / 3_600_000).toFixed(1)}h old, past its display limit. Not "nothing found".`);

/** EXTRACTED. Some of what IS shown is old, while the rest of the view is live. */
export const stalestShown = (ageMs: number): Disclosure =>
  warn(`Oldest shown analysis is ${Math.round(ageMs / 60_000)} min old; the rest of the globe is live.`);

/** EXTRACTED. Hidden by the operator's own time cursor — a choice, not a gap. */
export const hiddenByTimeWindow = (count: number): Disclosure =>
  info(`${count_(count, 'mark', 'marks')} outside the current time window.`);

/**
 * Marks drawn from storage when the globe opened, rather than received in this
 * session (decision D-F, step 4.4).
 *
 * Info, not warn: drawing them is the point — the globe was empty whenever the
 * public relays were unreachable, measured at 2/5 and 3/5 reachable on one
 * afternoon. What has to be SAID is that they are old, and with the most recent
 * receipt rather than one time for the group, because their receipts differ and
 * claiming a single one would be a guess.
 *
 * Takes the time already formatted, so this module keeps its zero dependencies.
 */
export const drawnFromEarlierSession = (count: number, newestReceivedAt: string): Disclosure =>
  info(
    `${count} ${count === 1 ? 'mark' : 'marks'} from an earlier session, `
    + `the most recent received ${newestReceivedAt} — `
    + `drawn faded until ${count === 1 ? 'it arrives' : 'they arrive'} again.`
  );

/**
 * Records placed in time by when they were written, because none stated when its
 * event happened (decision D-E). Info, not warn: falling back is the rule, and today
 * it applies to nearly every record. It says how they were placed and never guesses
 * why no event time was given.
 */
/**
 * Reports a paused cursor could not place at all, because no time of theirs can
 * be read (decision D-E; D-F step 15). Distinct from placedByWrittenTime: those
 * were placed, by a fallback the globe states; these have nothing to place by.
 */
export const untimedNotPlaced = (count: number, total: number, noun: string): Disclosure =>
  info(`${count} of ${total} ${total === 1 ? noun : `${noun}s`} not placed on the timeline — ${notStated('time')}.`);

export const placedByWrittenTime = (count: number, total: number, noun: string): Disclosure =>
  info(
    `${count} of ${total} ${total === 1 ? noun : `${noun}s`} placed by when ${count === 1 ? 'it was' : 'they were'} written — ${notStated('event time')}.`
  );

/**
 * Paused before any eco-disaster snapshot was captured, the globe draws no eco
 * disasters (decision D-E): a later snapshot, or live data, would show disasters
 * that had not happened by then. Says so, with when the first snapshot was
 * captured, or that none has been since.
 */
export const noEcoSnapshotBy = (moment: string, first: string | null, quakesDrawn = false): Disclosure =>
  info(
    // The quakes are read for the window from their own records (D-EQ, EQ1, EQ3): only the other hazards are missing.
    quakesDrawn
      ? `No snapshot of the other hazards was captured by ${moment}${first === null ? '' : `; the first is ${first}`}. The quakes come from their own records.`
      : first === null
        ? `No eco-disaster snapshot captured by ${moment}, or since.`
        : `No eco-disaster snapshot captured by ${moment}; the first is ${first}.`
  );

/** EXTRACTED. A display budget dropped some marks, and which ones is stated. */
export const truncatedMarks = (
  label: string,
  shown: number,
  total: number,
  budgetOverrun: boolean
): Disclosure =>
  warn(labelled(label, budgetOverrun
    ? `showing ${shown} of ${total} marks — contradictions only, all kept.`
    : `showing ${shown} of ${total} marks — strongest kept, contradictions never dropped.`));

/**
 * EXTRACTED. Records that exist but could not be put on a map.
 *
 * The reasons matter individually: "no coordinates" and "record not found" and
 * "in a store this resolver does not read" are three different problems with
 * three different fixes, and a bare count conflates them.
 */
export const unplaceableRecords = (
  label: string,
  count: number,
  reasons: Record<string, number>
): Disclosure => {
  const why = Object.entries(reasons).map(([r, n]) => `${n} ${r}`).join('; ');
  return warn(`${label}${count_(count, 'finding', 'findings')} not drawn — ${why}.`);
};

/**
 * Events that reached this node under the intel hashtag and never became reports.
 *
 * The findings layer has said this about its own records since it was written
 * (`unplaceableRecords` above). The LIVE RELAY path did not: an event carrying
 * `#starcom_intel` with no geo encoding is dropped before parsing and counted
 * only as `droppedNoGeo`, which surfaced as a quality PERCENTAGE in the marquee.
 * A ratio answers "how good is this feed"; it does not answer "is there
 * something here I am not being shown", and those are different questions.
 *
 * It matters most to the publisher, who gets silence. Somebody writing to
 * Starcom's own hashtag in a form the globe cannot place has no way to learn
 * that, and neither has the person looking at the globe.
 *
 * Counted by cause, for the reason `unplaceableRecords` gives: "no location"
 * and "could not be read" are two different problems with two different fixes.
 */
export const refusedIntelEvents = (reasons: Record<string, number>): Disclosure => {
  const total = Object.values(reasons).reduce((sum, n) => sum + n, 0);
  const why = Object.entries(reasons).map(([r, n]) => `${n} ${r}`).join('; ');
  return warn(`${count_(total, 'event', 'events')} arrived and ${total === 1 ? 'was' : 'were'} not drawn — ${why}.`);
};

/**
 * Unclaimed mission work, said in terms of the evidence it rests on.
 *
 * The wording carries the whole claim, so it is here rather than in the
 * component. An objective has no location and a mission has none either
 * (option C), so a mark can only ever mean "the evidence under this pin has
 * unclaimed work resting on it" — never "there is work to do at this place".
 * The first is true; the second would put work somewhere nobody said it
 * happens, which is what D-F 17 stopped a polygon doing when it stood on its
 * own first vertex.
 */
export const openWorkOnEvidence = (objectives: number, reports: number): Disclosure =>
  info(
    `${count_(objectives, 'open objective rests', 'open objectives rest')} on ${count_(reports, 'report', 'reports')} drawn here.`,
  );

/**
 * Open work whose evidence cannot be drawn at all.
 *
 * Reported separately and never folded into the figure above, because they are
 * different facts: one is work you can see the evidence for, the other is work
 * the globe is structurally unable to show. Summing them would imply the globe
 * can lead you to all of it.
 */
export const openWorkNotDrawn = (missions: number, objectives: number): Disclosure =>
  warn(
    // What it measures: a place to draw. "Rest on nothing" read as no evidence at
    // all, beside a Coverage panel counting the same missions as resting on
    // evidence (plan item 1.8).
    `${count_(objectives, 'open objective', 'open objectives')} in ${count_(missions, 'mission', 'missions')} ${objectives === 1 ? "isn't" : "aren't"} linked to a place.`,
  );

/**
 * Shapes drawn from a stored outline rather than from the published geometry.
 *
 * The outline is bounded — at most 64 vertices of a shape that may have had
 * 2000 — because the whole workspace serialises into one storage key and full
 * geometry is megabytes for shapes a few hundred pixels wide. That trade is
 * defensible; drawing the result as though it were the original is not. A
 * simplified boundary looks exactly like an exact one, on the surface where the
 * shape IS the claim, so the count says how many are not the shape that was
 * published.
 */
export const outlinesSimplified = (simplified: number, drawn: number): Disclosure =>
  info(`${simplified} of ${count_(drawn, 'shape', 'shapes')} drawn from a simplified outline.`);

/**
 * Territories a publisher named that this globe holds no polygon for.
 *
 * ─── WHY IT NAMES THEM INSTEAD OF COUNTING THEM ────────────────────────────
 *
 * regionMarksFor has returned an `unmatched` list since it was written and
 * nothing read it, so a report whose only stated place was `us-tx` simply was
 * not on the globe: no mark, no count, no sentence. Absent for that reason
 * looks exactly like absent because nobody published anything.
 *
 * The code is the part a reader can act on — look it up, ask the publisher for
 * a coordinate, or decide the depth is worth adding to the dataset. A bare
 * count is not actionable, and this is the tag the publisher chose.
 *
 * ─── AND WHY IT DOES NOT SAY "UNKNOWN" ─────────────────────────────────────
 *
 * The publisher was clear. The dataset here holds 247 territories, countries and
 * France's overseas regions, so anything sub-national matches nothing, and widening it to the country is refused on
 * purpose — drawing a state's subject as its country claims more than was
 * said. This is a fact about our map, not about their claim, and the wording
 * has to put it on our side.
 */
export const territoriesNotDrawn = (codes: string[]): Disclosure => {
  // A country's own code (two letters) the map does not draw apart is not a missing level: the map folds it into
  // another territory (Bonaire into the Netherlands) or leaves it out (Mecha Jono's note of 7 Nov 2026, on French
  // Guiana, since drawn: D-FO). Only a deeper code has no boundary at that level.
  const country = codes.filter((code) => /^[a-z]{2}$/i.test(code));
  const deeper = codes.filter((code) => !/^[a-z]{2}$/i.test(code));
  const why = [
    ...(deeper.length ? [`no boundary at that level for ${deeper.join(', ')}`] : []),
    ...(country.length ? [`this map draws ${country.join(', ')} inside another territory or not at all`] : []),
  ].join('; ');
  return warn(`${codes.length} ${codes.length === 1 ? 'territory' : 'territories'} named and not drawn — ${why}.`);
};

/** Why a record linked to a Case or a Mission is not among its pins on the globe. */
export type LinkedRecordNotDrawn = 'no-coordinates' | 'intel-item' | 'not-found' | 'case-not-found';

const NOT_DRAWN: Record<LinkedRecordNotDrawn, (n: number) => string> = {
  'no-coordinates': (n) => (n === 1 ? '1 report has no coordinates' : `${n} reports have no coordinates`),
  // Items can carry coordinates; the globe's report layer still does not draw them.
  'intel-item': (n) => `${n} ${n === 1 ? 'intel item' : 'intel items'} (the globe pins reports only)`,
  // Not "deleted": an id that matches nothing may name a record this does not read.
  'not-found': (n) => `${n} not found among reports or intel items`,
  // A Mission's case that cannot be found: whatever it links to cannot be read either.
  'case-not-found': (n) => (n === 1 ? '1 linked case not found' : `${n} linked cases not found`),
};

/**
 * Records linked to a Case or a Mission that are not on the globe, and why.
 *
 * The count is not a footnote (case-location-semantics.md): a case showing two
 * pins out of nine linked records looks like a case about two places.
 */
export const linkedRecordsNotDrawn = (byReason: Partial<Record<LinkedRecordNotDrawn, number>>): Disclosure => {
  const reasons = (Object.keys(NOT_DRAWN) as LinkedRecordNotDrawn[]).filter((r) => (byReason[r] ?? 0) > 0);
  const total = reasons.reduce((sum, r) => sum + (byReason[r] ?? 0), 0);
  const why = reasons.map((r) => NOT_DRAWN[r](byReason[r] ?? 0)).join('; ');
  return warn(`${count_(total, 'linked record', 'linked records')} not drawn — ${why}.`);
};

/**
 * Nothing to pin, said as what it is. No pins is not a case where nothing
 * happened, and a mission whose cases link nothing is not a mission with
 * nothing linked.
 */
export const nothingLinked = (to: 'case' | 'mission' | 'mission-cases'): Disclosure =>
  info({
    case: 'Nothing is linked to this case yet, so it has no pins.',
    mission: 'Nothing is linked to this mission yet, so it has no pins.',
    'mission-cases': "This mission's cases have nothing linked yet, so it has no pins.",
  }[to]);

/** EXTRACTED. The computation ran without all its inputs. Sparse ≠ quiet. */
export const computedWhileDegraded = (label: string, blindSpots: string[]): Disclosure =>
  warn(labelled(label, `computed with ${blindSpots.join(', ')} unreachable — sparse does not mean quiet.`));

/** EXTRACTED. Some of the input is synthetic. A mock RECORD, not wrong content. */
export const fabricatedInput = (label: string, realRatio: number): Disclosure =>
  warn(`${label}${Math.round((1 - realRatio) * 100)}% of the input behind these marks is fabricated.`);

/**
 * Nothing has contested a claim — which is not the same as agreement.
 *
 * The exact shape of the `showLow` defect this module was built after: an empty
 * contested list reads as consensus, when the honest reading is that no
 * refutation has ARRIVED. A claim nobody has argued with may simply be one
 * nobody has read, and on a federated network those look identical on screen.
 *
 * `info`, not `warn`: silence from peers is the ordinary state, not a fault.
 */
export const noRefutationReceived = (): Disclosure =>
  info('Nobody has disputed this yet.');

/**
 * Provenance nobody stated.
 *
 * Obeys the rule above exactly: it states the ABSENCE of a statement and stops.
 * It does not say the evidence is fabricated, because nobody said that either —
 * and "unmeasured" is the whole point. publicationPolicy refuses `undefined` as
 * firmly as `true` for this reason, so the sentence has to carry the same
 * distinction the gate does.
 *
 * Written twice before it lived here: once as an AttentionPanel tooltip and
 * once, days later, in FindingsPanel by somebody who had not seen the first.
 */
export const unmeasuredProvenance = (): Disclosure =>
  warn('No contributor stated whether this evidence is real. That is not the same as it being genuine.');

/**
 * A census whose boundary nobody stated.
 *
 * Warns rather than notes, because this is not a reduction the reader chose:
 * every conforming node REJECTS such a claim outright — a count that cannot be
 * re-run is indistinguishable from an invented one, so the boundary is what
 * makes an enumeration a claim at all rather than an assertion.
 */
export const uncheckableCount = (): Disclosure =>
  warn('No stated boundary. A count nobody can re-run cannot be told apart from an invented number, and conforming nodes reject it.');

/** Provenance stated, and stated as fabricated. A different claim entirely. */
export const fabricatedEvidence = (): Disclosure =>
  warn('This rests on fabricated evidence. Publishing would broadcast demo data signed by this instance.');

export type EmptyReason = 'no-observations' | 'nothing-qualified' | 'all-unplaceable';

/** EXTRACTED. Why a view is empty — three distinct answers, never merged. */
export const emptyBecause = (label: string, reason: EmptyReason): Disclosure =>
  info(labelled(label, {
    // Of yours: a first visitor's globe shows reports from the network, which this
    // analysis does not read, so "nothing to analyse" read as nothing at all (D-F).
    'no-observations': 'nothing of yours to analyse.',
    'nothing-qualified': 'analysis ran across real input and nothing qualified.',
    'all-unplaceable': 'results exist, but none could be placed on a map.',
  }[reason]));

/**
 * A cap reduced what is drawn, and the two numbers mean different things.
 *
 * Phrased "matched — showing" rather than "showing N of M" because the total is
 * what passed the SOURCE's filters, and asserting why the two differ would
 * claim more than the data supports.
 */
export const matchedVersusShown = (matched: number, shown: number): Disclosure =>
  info(`${matched} reports matched — showing ${shown}`);

/**
 * How many reports from the network the globe is showing. Said because the timeline
 * counts intel items and the analysis status counts what is yours, so 7 reports on
 * the globe beside "0 events" read as a contradiction (decision D-F, step 1).
 */
export const networkReportsShown = (count: number): Disclosure =>
  info(`Showing ${count} report${count === 1 ? '' : 's'} from the network`);

/**
 * The globe, while it is fetching and nothing has arrived yet.
 *
 * A first visit measured 14.7 s from load to the first report, and for all of it
 * the globe drew nothing and said nothing (decision D-F, step 4).
 *
 * CONNECTED, not answered. `relaysConnected` counts open sockets, and a relay can
 * be connected and send nothing; the ingest keeps no count of relays that returned
 * data. Saying "answered" would be a claim the app cannot support, in the one place
 * a first visitor is looking.
 */
export const listeningForReports = (connected: number, total: number): Disclosure =>
  info(`Listening for reports — ${connected} of ${total} relay${total === 1 ? '' : 's'} connected`);

/**
 * Before the ingest has started at all.
 *
 * `relay.connected` is set when a probe socket opens or a subscription reaches
 * end-of-stored-events, so it reads 0 while sockets are still opening. Saying
 * "0 of 5 relays connected" at second one would show a floor as though it were a
 * measurement, and a visitor would reasonably read it as five relays refusing.
 */
export const connectingToRelays = (): Disclosure =>
  info('Listening for reports — connecting to relays');

/**
 * Hidden by a filter the operator set. Distinct from a cap: these were
 * received and deliberately not drawn, which has a different fix.
 */
export const hiddenByOperatorFilter = (count: number, filterName: string): Disclosure =>
  info(`${count} hidden by your ${filterName}`);

/**
 * Nobody stated a value. NOT the lowest value on the scale.
 *
 * The distinction that cost the globe every report it created for itself.
 */
export const notStated = (field: string): string => `no stated ${field}`;

/**
 * An action whose actor was never recorded.
 *
 * Never a name and never a placeholder: attributing an unattributed action
 * manufactures a chain of custody, which is the one thing an audit trail
 * must not do.
 */
export const unattributedActor = (): string => 'nobody recorded';

/**
 * A labelled field whose record holds no value.
 *
 * The form for a slot whose label already names the field; `notStated` is the
 * inline form. Never "Unknown", "None" or "Unspecified". In the RLSH dataset
 * `status: "Unknown"` is a real category with nine members, so printing the
 * same word for an empty field made an absence read as that category, and
 * "None" beside Risk Flags read as a check that had found nothing.
 */
export const notRecorded = (): string => 'Not recorded';

/**
 * What a reconstruction is structurally blind to.
 *
 * Distinct from a gap. A gap is a log contradicting itself, which can be
 * detected. This is a category nothing ever writes, which cannot be — so it
 * must be declared rather than discovered.
 */
export const blindTo = (subject: string, things: string[]): Disclosure =>
  warn(`Not recorded anywhere, so ${subject} is blind to ${things.join(', ')}. Their absence is not evidence they did not happen.`);

/**
 * A claim carried by exactly one independent feed.
 *
 * "Single-source" and "uncorroborated" are the same fact; "unverified" and
 * "doubtful" are not, and must not creep in here. Nothing disagrees with these
 * claims — they are simply alone, which is a prompt for collection rather than
 * a judgement about truth.
 */
export const singleSourceClaims = (count: number): Disclosure =>
  info(`Single-source claims (${count})`);

/** Why a single-source claim is worth acting on, in the analyst's terms. */
export const singleSourceExplainer = (): string =>
  'Backed by one feed. A second independent source would corroborate them.';

/**
 * How much of a collection came from a real source rather than a fallback.
 *
 * Phrased as a share of the INPUT, never of the conclusions: a run standing on
 * fabricated input does not make its conclusions proportionally wrong, it makes
 * them un-assessable. Same reasoning as fabricatedInput above, which reports
 * the same axis for a globe layer.
 */
export const realDataShare = (realCount: number, total: number): string =>
  `real data (${realCount}/${total} recent collections)`;

/**
 * A record whose provenance is synthetic.
 *
 * Marks the RECORD as fabricated, not its contents as false — the distinction
 * eventsAdapter's isMock comment insists on, and the reason a mock label is a
 * provenance statement rather than an accuracy one.
 */
export const fabricatedRecordLabel = (): string => 'MOCK';

/** Encrypted at rest. Deliberately does not promise the key still exists. */
export const encryptedAtRest = (): string => 'Description encrypted';

/**
 * A search that could not read some of what it searched over, and says so.
 *
 * Without this line "no match" and "some of it could not be read" render
 * identically, which is the same conflation as "not shown" vs "nothing found".
 */
export const notSearched = (count: number, noun: string, why: string): Disclosure =>
  info(`${count} ${noun}${count === 1 ? '' : 's'} not searched — ${why}.`);

/**
 * A read that failed, said as a failure.
 *
 * The timeline's adapter caught its own storage error and returned an empty
 * list, so a failed read reached the screen as "no intel events" with advice
 * to ingest data. "Could not look" and "nothing there" must never render as
 * the same claim.
 */
export const couldNotRead = (what: string): Disclosure =>
  warn(`${labelled('', what)} could not be read. Not "nothing found".`);

/**
 * An empty timeline, explained by the timeline's own rule.
 *
 * Only an intel item with an event date is a timeline event. The old empty
 * state guessed instead ("ingest data"), which was wrong for anyone whose items
 * simply carry no event date. The sentence is true whether there are no items
 * at all or only undated ones, so it needs no count to be honest.
 */
export const nothingDated = (): Disclosure =>
  info('No intel item carries an event date, so the timeline is empty.');

/**
 * Names a view left off for lack of room.
 *
 * Every item is still drawn; only its name is missing. Saying so keeps a short
 * run of names from being read as a short run of events.
 */
export const namedForRoom = (named: number, total: number): Disclosure =>
  info(`${named} of ${total} events named — the rest would overlap.`);
