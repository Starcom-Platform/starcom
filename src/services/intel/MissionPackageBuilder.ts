// MissionPackageBuilder — transforms a MissionUI into a ComposeInput for the
// existing (reused, not reinvented) PackageComposer/PackageManifest pipeline,
// enforcing the Navcom handoff boundary (Locked Decision #7): a Mission
// Package carries objectives/briefing only — never raw linked Report
// content, never collaborators' or reviewers' identities. Its author is its
// signer, by the callsign they publish or their key (#7 as amended by D-MX,
// MX7, 2026-10-06): the person publishes, through Starcom.
//
// Unlike a normal exchange package (built from real report/intel content),
// this always synthesizes a single package entry from the mission's own
// briefing + objective descriptions — relatedReports/relatedCases cross only
// as counts in metadata, never as their real content or ids, so nothing
// resolvable back to a specific Starcom-internal record leaves the boundary.
import type { MissionUI } from '../../types/intel/MissionUI';
import type { ComposeInput, ObjectiveAsk, PackageManifest } from '../exchange/types';
import { PackageComposer } from '../exchange/PackageComposer';
import { missionProfile } from './packageProfile';


/**
 * Mask positions written the ways operators actually write them.
 *
 * Enforces Locked Decision #7/D1 — mission POSITION stays internal — on the
 * two text paths that bypassed it: a coordinate typed into the briefing
 * crossed as prose, and the title had no mask applied to it at all.
 *
 * The first version matched only a comma/semicolon/slash-separated decimal
 * pair. A stress pass over nine notations showed that covered three of them:
 * degrees-minutes-seconds, a space-separated pair, a `lat:`/`lon:` labelled
 * pair and a newline-separated pair all crossed intact. A mask that handles
 * one notation while the docs say "position stays internal" is worse than no
 * mask, because it turns a known gap into a believed guarantee.
 *
 * Still deliberately bounded, and the bound is the RANGE CHECK: a pair only
 * masks when the numbers are plausible as latitude and longitude. That is what
 * keeps "Budget is 4500.75 over 12 days" and "MSN-2026-0001" intact, and it is
 * why widening the separators does not widen the collateral damage.
 *
 * What still crosses, stated rather than implied: a place NAME, and grid
 * systems (MGRS, plus codes) which are alphanumeric rather than numeric pairs.
 * Closing those needs a gazetteer or an operator-facing preview of exactly
 * what will cross, not a longer regex.
 */
const REDACTED = '[redacted:position]';

/** Plausible as a lat/lon pair — the bound that keeps ordinary figures intact. */
const isLatLon = (a: string, b: string): boolean =>
  Math.abs(Number(a)) <= 90 && Math.abs(Number(b)) <= 180;

function maskCoordinatePairs(text: string): string {
  let out = text;

  // Degrees-minutes-seconds, with or without hemisphere letters.
  out = out.replace(
    /-?\d{1,3}\s*°\s*\d{1,2}\s*['\u2032]\s*[\d.]+\s*["\u2033]?\s*[NSEW]?/gi,
    REDACTED,
  );

  // A labelled pair: lat: 52.52 lon: 13.405 (any order, any punctuation).
  out = out.replace(
    /lat(?:itude)?\s*[:=]?\s*(-?\d{1,3}\.\d+)[\s,;/]*(?:lon|lng|long(?:itude)?)\s*[:=]?\s*(-?\d{1,3}\.\d+)/gi,
    (whole, a: string, b: string) => (isLatLon(a, b) ? REDACTED : whole),
  );

  // A bare decimal pair separated by punctuation OR whitespace, including a
  // newline — "52.52, 13.405", "52.52 / 13.405", "52.52 13.405", one per line.
  out = out.replace(
    /(-?\d{1,3}\.\d+)\s*[,;/]?\s*(-?\d{1,3}\.\d+)/g,
    (whole, a: string, b: string) => (isLatLon(a, b) ? REDACTED : whole),
  );

  return out;
}

/**
 * One objective, as the receiving node reads it.
 *
 * ─── WHAT CROSSES, AND WHAT MUST NOT ───────────────────────────────────────
 *
 * An objective now carries six things it did not. Two of them are barred by
 * Locked Decision #7 and are absent here by construction, not by filtering:
 *
 *   `evidenceRef` is a Starcom-internal record id. The decision already says
 *   relatedReports and relatedCases cross as COUNTS only, so nothing is
 *   resolvable back to a specific internal record. An objective pointing at
 *   report `rep-3f2a` would walk straight through that.
 *
 *   `claimedBy` is one of our operators. The decision bars Starcom analyst
 *   identities outright, and who is working on what is exactly the staffing
 *   detail it exists to keep inside.
 *
 * What does cross is what a stranger needs in order to decide whether they
 * could do this: the ask, what to hand back, roughly how long, who it is for,
 * and what they must not do.
 *
 * That sentence was FALSE from the day it was written until 2026-09-21. The
 * objective block below was rendered into a synthesized report's content, and
 * PackageComposer reduces every report to `{id, title, checksum}` — so all of
 * it crossed as a 32-bit hash and a peer received a title, a briefing and a
 * count. The careful redaction argument above was written for data that never
 * left the building. It is true now because the asks travel in the manifest's
 * own `objectives` field, beside `reports` rather than inside one, where the
 * body-content rule cannot swallow them.
 *
 * ─── WHY EFFORT IS PRINTED IN WHOLE MINUTES ────────────────────────────────
 *
 * The UI shows "1.5 h" because that is what a person reads. Here it stays
 * "90 min", because the coordinate mask matches a PAIR of decimals and will
 * reach across a newline to find one. Two objectives estimated at "1.5 h" and
 * "2.5 h" are a plausible lat/lon pair, so a package would ship with its
 * effort figures redacted — the mask working exactly as designed, on data that
 * was never a position. Integers cannot form that pair.
 */
function objectiveBlock(o: MissionUI['objectives'][number]): string {
  const lines = [`- [${o.completed ? 'x' : ' '}] ${o.description}`];
  if (o.expectedArtifact) lines.push(`      hands back: ${o.expectedArtifact}`);
  if (o.effortMinutes !== undefined) lines.push(`      effort: ${Math.round(o.effortMinutes)} min`);
  if (o.beneficiary) lines.push(`      for: ${o.beneficiary}`);
  // Stated either way, unlike the others. "No limits" and "limits nobody wrote
  // down" are the same text to a reader and very different to someone deciding
  // what they are allowed to do, so the absence is named rather than omitted.
  lines.push(`      must not: ${o.limits?.length ? o.limits.join('; ') : 'none stated'}`);
  return lines.join('\n');
}

/**
 * One objective as an outsider receives it.
 *
 * `evidenceRef` and `claimedBy` are not read here at all — absent by
 * construction rather than filtered out, so a field added to MissionObjective
 * later cannot leak by default. Coordinates are masked at this edge, as they
 * are for the title and briefing; the composer applies the rest.
 */
function objectiveAsk(o: MissionUI['objectives'][number]): ObjectiveAsk {
  return {
    id: o.id,
    ask: maskCoordinatePairs(o.description),
    ...(o.expectedArtifact ? { handsBack: maskCoordinatePairs(o.expectedArtifact) } : {}),
    // Whole minutes: a decimal pair across two objectives ("1.5", "2.5") is
    // plausible as a latitude and longitude, and the coordinate mask reaches
    // across a newline to find one. It crosses as a number here rather than
    // as text, so it is out of the mask's reach either way — but the rounding
    // stays, because the UI's "1.5 h" must not become a pair anywhere.
    ...(o.effortMinutes !== undefined ? { effortMinutes: Math.round(o.effortMinutes) } : {}),
    ...(o.beneficiary ? { for: o.beneficiary } : {}),
    ...(o.limits?.length ? { limits: o.limits.map(maskCoordinatePairs) } : {}),
    done: o.completed,
  };
}

/**
 * `author` is the package's signer, by the callsign they publish or their key
 * (callsign.ts's authorFor). Not given, it is empty, so a package nobody
 * signed for names no author and every verifier refuses it: it is never
 * credited to the app. `agent`, when the signer's key is an agent's, is the
 * name its package says posted it (callsign.ts's agentFor).
 */
export function buildMissionPackageComposeInput(mission: MissionUI, author = '', agent?: string): ComposeInput {
  const objectiveLines = mission.objectives.length
    ? mission.objectives.map(objectiveBlock).join('\n')
    : '- (no objectives recorded)';
  const content = maskCoordinatePairs(`# Briefing\n\n${mission.briefing}\n\n# Objectives\n\n${objectiveLines}`);

  return {
    // name/description carry free text across the boundary and the composer's
    // redaction does not touch `name` at all, so D1 is enforced here.
    /*
     * The mission's own id, so republishing a mission REPLACES its package
     * rather than adding another beside it, and so the coordinate a peer
     * replies to stays put. It already crosses the boundary just below, in
     * `reports[].id`, so naming it here exposes nothing new.
     */
    id: mission.id,
    name: maskCoordinatePairs(mission.title),
    description: maskCoordinatePairs(mission.briefing),
    /*
     * The wire field is `visibility` now, and OPTIONAL — so an unmarked
     * mission emits no key at all rather than the `|| 'UNCLASSIFIED'` default
     * this line used to carry, which put a marking on the wire that nobody
     * had applied.
     */
    visibility: mission.visibility,
    license: 'PROPRIETARY',
    author,
    // The report entry carries its own copy of the title, so it needs the
    // same mask — masking only `name` left the coordinate crossing anyway.
    reports: [{ id: mission.id, title: maskCoordinatePairs(mission.title), content }],
    intel: [],
    // The asks themselves, beside `reports` rather than inside one — see
    // ObjectiveAsk for why the body-content rule made this necessary.
    ...(mission.objectives.length ? { objectives: mission.objectives.map(objectiveAsk) } : {}),
    // What NavCom reads (rev 11): codes and numbers only, and a region, never a point (D-MX, MX11).
    profile: missionProfile(mission, agent),
    metadata: {
      missionNumber: mission.missionNumber,
      status: mission.status,
      relatedReportCount: mission.relatedReports.length,
      relatedCaseCount: mission.relatedCases.length,
      objectiveCount: mission.objectives.length,
      // What a report counts (MX32; spec rev 18): effect lines in a field of no one's name.
      ...(mission.countLines?.length ? { format: { effect: [...mission.countLines] } } : {}),
    },
    // Always on for Mission Packages, unlike DraftBuilder's sensitivity-gated
    // redaction — a Mission Package is built specifically to cross the Navcom
    // trust boundary, so it redacts unconditionally rather than only when the
    // content asks for care. maskNames is a best-effort heuristic (see its doc
    // comment on ComposeInput) — it reduces, not eliminates, the known
    // residual gap that a name typed into a mission's free-text briefing
    // could cross to Navcom; it is not a guarantee.
    redaction: { maskEmails: true, maskNumbers: true, maskNames: true }
  };
}

export function buildMissionPackageManifest(mission: MissionUI, author = '', agent?: string): PackageManifest {
  return PackageComposer.compose(buildMissionPackageComposeInput(mission, author, agent)).manifest;
}
