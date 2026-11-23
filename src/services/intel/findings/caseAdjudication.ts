/**
 * A Case's adjudicated position, as an attested claim.
 *
 * ─── WHY THIS IS A METHOD AND NOT A NEW KIND ───────────────────────────────
 *
 * A case adjudication IS an attested claim: a statement about a subject, plus
 * how it was reached. It belongs at kind 30082 with every other claim, and
 * `method.algorithm` is what distinguishes it — which the NIP has always called
 * an implementation-defined identifier.
 *
 * Giving human judgement its own kind number would be worse than redundant. A
 * consumer would then select on the kind to decide how much a claim is worth,
 * and the kind is chosen by the author — which is precisely what "weight is
 * derived from method and age, never asserted by the author" forbids.
 * `algorithm: 'case-adjudication'` is derivable; a private kind number is a
 * claim about oneself.
 *
 * ─── WHY THE STATEMENT DOES NOT TRAVEL ─────────────────────────────────────
 *
 * `position.statement` is the adjudicator's prose and stays local. What crosses
 * is the verdict, which a consumer can act on without a human reading it, and
 * the counts describing what the judgement rested on.
 *
 * The prose is not withheld to be secretive — it is withheld because the
 * publication gate keys on `subjectKind`, and free text cannot be evaluated by
 * it. Sanitising prose was measured against coordinate notations and let place
 * names through untouched. Distillation is the discipline, not an inconvenience.
 */
import { FINDING_SCHEMA_VERSION_V2 } from './attestation';
import type { FindingAttestation } from './attestation';
import type { CasePosition } from '../../../types/intel/IntelCaseUI';
import type { ContentSensitivity } from '../../../types/intel/IntelItemUI';
import type { InformationVisibility } from '../../../types/intel/IntelItemUI';
import type { SubjectKind } from '../../../types/intel/SourceObservation';

/** Milliseconds in a day — the coarsest honest precision for a human judgement. */
const ONE_DAY_MS = 86_400_000;

/**
 * Exactly the fields a published adjudication draws on — no more.
 *
 * Typed structurally rather than as IntelCaseUI so the adapter's CaseItem view
 * satisfies it too. Requiring the full record would have meant the UI, which
 * holds a CaseItem, refetching a case it already has on screen in order to
 * publish what is already displayed.
 *
 * `startDate` is a string on the stored record and a Date on the adapter's
 * view. Both are accepted rather than converted at one of the call sites,
 * because a conversion in only one of them is the kind of asymmetry that
 * eventually publishes an epoch date.
 */
export interface AdjudicatedCase {
  caseNumber: string;
  /** Sample material (plan item 0.9): never published. */
  sample?: boolean;
  /** Who may receive what it concluded (plan item 0.4). Undefined: nobody has decided, so nothing goes. */
  visibility?: InformationVisibility;
  /** The joined team relays a Limited case also goes to (LW1). */
  limitedTo?: string[];
  relatedEntities: string[];
  contradictedBy?: string[];
  position?: CasePosition;
  startDate: string | Date;
  /** What the content requires (plan item 0.5): evidence is fingerprinted only from a case marked open. */
  sensitivity?: ContentSensitivity;
}

export interface CaseAdjudicationOptions {
  /** What the case is about. Chosen by the adjudicator: a case may touch several subjects. */
  subjectRef: string;
  /** Required by the publication gate, which cannot read it off a case. */
  subjectKind: SubjectKind;
  /**
   * Whether the evidence behind this case is synthetic. REQUIRED, not defaulted.
   *
   * publicationPolicy refuses `undefined` as firmly as it refuses `true`: "no
   * contributor said whether it was real" is not permission. Passing the policy
   * options straight through left this unset, so every case adjudication was
   * refused — the path was blocked forever for want of a statement nobody was
   * ever going to make. That is the failure eventsAdapter already warns about
   * where it sets isMock on reports, and this repeated it one tier up.
   *
   * Required rather than defaulted to `false` because a default would make the
   * claim on the caller's behalf, and the whole point of the gate is that
   * somebody states it.
   */
  evidenceIsSynthetic: boolean;
  /**
   * When the underlying observations were made, if known.
   *
   * A case records when IT was open, which is a different span — evidence
   * gathered in March can be adjudicated in September. Passing the case's own
   * period as the observation window would misdescribe the evidence, so when
   * this is absent the claim says so in `weakBacking` rather than substituting
   * a window it does not have.
   */
  evidenceWindow?: { from: string; to: string };
  /**
   * The SHA-256 of each evidence file the case holds, as evidence or against it (decision D-EX, EX23):
   * captured through Uplink, kept by the capturer. Published as `method.inputFingerprints` so a reader
   * holding the same files can confirm they match, without either side revealing content or sources;
   * only from a case marked open, since a fingerprint confirms a guess (see reproducibility.ts).
   */
  evidenceFingerprints?: string[];
  /**
   * Whether the case rests on a Wayback Machine snapshot (decision D-EX, EX34): the Internet Archive's
   * terms ask that published research name it, so the criteria says so.
   */
  archiveCited?: boolean;
}

/**
 * The `d`-tag slot a case adjudication occupies.
 *
 * The case number is part of the attribute deliberately. Kind 30082 is
 * addressable on (author, subject, attribute), so two cases investigating the
 * same subject would otherwise share one slot and the second would REPLACE the
 * first — silently deleting an earlier investigation's published conclusion.
 * Two investigations are two claims, even about one subject.
 */
export function caseAdjudicationAttribute(caseNumber: string): string {
  return `case-adjudication:${caseNumber}`;
}

/**
 * Build the attestation. Returns null when the case has stated no position:
 * an unadjudicated case has concluded nothing, and publishing one would assert
 * a verdict nobody reached.
 */
export function attestationForCasePosition(
  caseRecord: AdjudicatedCase,
  options: CaseAdjudicationOptions,
  now: () => Date = () => new Date(),
): FindingAttestation | null {
  const position = caseRecord.position;
  if (!position) return null;

  const contradictionsTotal = (caseRecord.contradictedBy ?? []).length;
  const contradictionsAddressed = Object.keys(position.addressed ?? {}).length;
  const reportsBehind = caseRecord.relatedEntities.length;

  const weakBacking: string[] = [];
  if (!options.evidenceWindow) {
    weakBacking.push(
      'observation window unknown: the span published is the period this case was '
      + 'open, not when the underlying observations were made',
    );
  }
  if (contradictionsTotal > contradictionsAddressed) {
    // Stated as weak backing rather than left to the counts, because a reader
    // scanning weakBacking is looking for exactly this and should not have to
    // subtract two numbers to find it.
    weakBacking.push(
      `${contradictionsTotal - contradictionsAddressed} of ${contradictionsTotal} `
      + 'linked contradictions were not addressed by the adjudicator',
    );
  }
  if (reportsBehind === 0) {
    weakBacking.push('no evidence was linked to this case: the position rests on nothing recorded here');
  }
  const prints = [...new Set(options.evidenceFingerprints ?? [])].sort();
  const printable = prints.length > 0 && caseRecord.sensitivity === 'open';
  if (printable) {
    weakBacking.push(
      `${prints.length} evidence file(s) fingerprinted, kept by the capturer: a reader holding the same `
      + 'files can confirm they match; the files and their timestamp proofs are shared only on request',
    );
  } else if (prints.length) {
    const marked = caseRecord.sensitivity === 'careful' ? 'marked careful'
      : caseRecord.sensitivity === 'protected' ? 'marked protected' : 'not marked open';
    weakBacking.push(`evidence not fingerprinted: the case is ${marked}, and a fingerprint confirms a guess about what was used`);
  }

  /**
   * An unparseable start date must not throw, and must not become NaN.
   *
   * `new Date('nope').toISOString()` throws RangeError, and this is awaited
   * inside a click handler with no catch — so a single legacy record left the
   * publish button disabled on "Publishing…" forever, with no error shown.
   */
  const rawStart = caseRecord.startDate;
  const startParsed = typeof rawStart === 'string' ? Date.parse(rawStart) : rawStart?.getTime?.();
  const startDate = Number.isFinite(startParsed)
    ? new Date(startParsed as number).toISOString()
    : undefined;
  const from = options.evidenceWindow?.from ?? startDate;
  const to = options.evidenceWindow?.to ?? position.adjudicatedAt;

  /**
   * Math.max cannot clamp NaN — `Math.max(1, NaN)` is NaN, not 1.
   *
   * So an unparseable timestamp published `windowHours: null` (JSON has no
   * NaN), every consumer derived a weight of NaN or zero from it, and this
   * repo's own validators rejected the claim as underivable-weight at every
   * peer — while the publisher reported success, the ledger recorded it, and
   * the interface said "Published". A claim that no conforming node will store
   * is not published, and saying so is the whole point of having a gate.
   */
  const spanHours = (Date.parse(String(to)) - Date.parse(String(from))) / 3_600_000;
  const windowHours = Number.isFinite(spanHours) ? Math.max(1, spanHours) : undefined;
  if (windowHours === undefined) {
    throw new Error(
      'Refusing to publish this adjudication: its evidence window cannot be dated, '
      + 'so no peer could derive a weight for it and every conforming node would reject it.',
    );
  }
  if (from === undefined) {
    throw new Error('Refusing to publish this adjudication: the case has no usable start date.');
  }

  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: options.subjectRef,
      subjectKind: options.subjectKind,
      attribute: caseAdjudicationAttribute(caseRecord.caseNumber),
      // The verdict, not the prose. Structured so a consumer can act on it
      // without a human reading anything.
      value: position.verdict,
    },
    method: {
      algorithm: 'case-adjudication',
      algorithmVersion: 1,
      parameters: {
        /**
         * The span the verdict covers, so precision derives honestly: a
         * judgement over thirty days is amply supported by day-precision
         * inputs, and one over an hour is not. Nothing is exempted here —
         * `matchedBy: 'equality'` would claim timing is not a signal for this
         * algorithm, and for a judgement about a period it plainly is.
         */
        windowHours,
        // No distanceThresholdKm: nothing here matched by distance, and
        // publishing 0 would read as an extremely precise radius.
        reportsBehind,
        contradictionsTotal,
        /**
         * Backed by text, always. `addressed` entries with no words are dropped
         * before a position is saved, so this count cannot be inflated by
         * ticking a box — every unit of it is a sentence someone had to write.
         */
        contradictionsAddressed,
      },
      // A conclusion drawn ACROSS RECORDS, not something witnessed. Claiming a
      // primary record would say the adjudicator saw what the reports describe.
      modality: 'inference',
      weakBacking,
      ...(printable ? { inputFingerprints: prints } : {}),
      sourceCount: reportsBehind,
      observedFrom: from,
      observedTo: to,
      // Weighing reports across days does not give finer resolution than a day,
      // and claiming minutes would earn precision weight nobody earned.
      timePrecisionMs: ONE_DAY_MS,
      /**
       * Describes THE WORK, never the worker.
       *
       * This said "A human adjudicator reviewed…", which is an assertion about
       * who did it, published into the disclosure every peer weighs the claim
       * by — and it was unconditional, so an adjudication by anyone else put a
       * signed statement on the wire that a human did the work. The method is
       * what earns weight here: records read, contradictions addressed, a
       * verdict reached. Whether the reader was a person is not a property of
       * the method and cannot be verified by anyone receiving it.
       */
      criteria:
        `An adjudicator reviewed ${reportsBehind} linked report(s) and `
        + `${contradictionsTotal} recorded contradiction(s), addressing `
        + `${contradictionsAddressed} of them in writing, and concluded the case is `
        + `${position.verdict}. The adjudicator's reasoning is held by the publishing `
        + `node and is not part of this claim.`
        + (options.archiveCited ? ' Some of its evidence is from the Internet Archive\'s Wayback Machine (web.archive.org).' : ''),
    },
    publishedAt: now().toISOString(),
  };
}
