/**
 * MissionPackageBuilder — Cycle 4.
 *
 * Verifies the Navcom handoff boundary (Locked Decision #7) is enforced at
 * the data-construction level, not just documented: a Mission Package must
 * never carry raw linked Report content or a real analyst identity, and
 * must always redact (unlike DraftBuilder's classification-gated redaction),
 * since a Mission Package is built specifically to cross the trust boundary.
 */
import { describe, it, expect } from 'vitest';
import { buildMissionPackageComposeInput, buildMissionPackageManifest } from '../MissionPackageBuilder';
import { PackageComposer } from '../../exchange/PackageComposer';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { MissionStatus } from '../../../types/intel/MissionUI';

function makeMission(overrides: Partial<MissionUI> = {}): MissionUI {
  const now = new Date().toISOString();
  return {
    id: 'mission-1',
    missionNumber: 'MSN-2026-0001',
    title: 'Recon Mission',
    briefing: 'Contact analyst@earthalliance.example for follow-up. Case ref 123456789.',
    status: MissionStatus.READY_FOR_PACKAGE,
    objectives: [
      { id: 'obj-1', description: 'Recon target', completed: true },
      { id: 'obj-2', description: 'Extract asset', completed: false }
    ],
    assignedTo: [],
    startDate: now,
    relatedReports: ['intel-report-1', 'intel-report-2'],
    relatedCases: ['intelcase-1'],
    tags: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
    createdBy: 'operative',
    collaborators: [
      { userId: 'pk-analyst-1', name: 'Real Analyst Name', addedAt: now, addedBy: 'operative' }
    ],
    comments: [],
    activityLog: [],
    permissions: {
      isPublic: false
    },
    ...overrides
  };
}

describe('buildMissionPackageComposeInput', () => {
  it('names as author the signer it is given, and never a collaborator (D-MX, MX7; Locked Decision #7 as amended)', () => {
    const input = buildMissionPackageComposeInput(makeMission(), 'Night Owl');
    expect(input.author).toBe('Night Owl');
    expect(JSON.stringify(input)).not.toContain('Real Analyst Name');
    expect(JSON.stringify(input)).not.toContain('pk-analyst-1');
  });

  it('names no author unless given one: a package nobody signed for is refused, never credited to the app', () => {
    expect(buildMissionPackageComposeInput(makeMission()).author).toBe('');
    expect(JSON.stringify(buildMissionPackageComposeInput(makeMission()))).not.toContain('"Starcom"');
  });

  /*
   * ─── THE OBJECTIVE'S NEW FIELDS, AT THE BOUNDARY ─────────────────────────
   *
   * An objective carries six things it did not. Four are meant to cross — the
   * ask, what to hand back, how long, who for, what is forbidden — and two are
   * barred by Decision #7. These pin the bar, because it is the kind that
   * quietly stops holding when somebody adds a field to the renderer.
   */
  it("carries an objective's ask, artifact, effort, beneficiary and limits", () => {
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [{
        id: 'o1', description: 'Read the federal award record', completed: false,
        expectedArtifact: 'a plain reading of the record',
        effortMinutes: 45,
        beneficiary: 'public',
        limits: ['federal record facts only', 'no inferences about intent'],
      }],
    }));
    const content = input.reports[0].content;
    expect(content).toContain('Read the federal award record');
    expect(content).toContain('hands back: a plain reading of the record');
    expect(content).toContain('effort: 45 min');
    expect(content).toContain('for: public');
    expect(content).toContain('must not: federal record facts only; no inferences about intent');
  });

  it('never carries an objective evidenceRef — it names an internal record', () => {
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [{
        id: 'o1', description: 'Check the filing', completed: false,
        evidenceRef: 'intel-report-1',
      }],
    }));
    // Same rule relatedReports already obeys: nothing resolvable back to a
    // specific Starcom-internal record leaves the boundary.
    expect(JSON.stringify(input)).not.toContain('intel-report-1');
  });

  it('never carries an objective claimedBy — it names one of our operators', () => {
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [{
        id: 'o1', description: 'Check the filing', completed: false,
        claimedBy: 'Real Analyst Name',
      }],
    }));
    expect(JSON.stringify(input)).not.toContain('Real Analyst Name');
  });

  it('masks a coordinate typed into an objective artifact or its limits', () => {
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [{
        id: 'o1', description: 'Observe the frontage', completed: false,
        expectedArtifact: 'a field note from 38.9072, -77.0369',
        limits: ['do not approach 51.5074, -0.1278'],
      }],
    }));
    const content = input.reports[0].content;
    expect(content).not.toContain('38.9072');
    expect(content).not.toContain('-77.0369');
    expect(content).not.toContain('51.5074');
    expect(content).toContain('[redacted:position]');
  });

  it('says limits are unstated rather than letting silence read as none', () => {
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [{ id: 'o1', description: 'Check the filing', completed: false }],
    }));
    expect(input.reports[0].content).toContain('must not: none stated');
  });

  it('prints effort in whole minutes, so two estimates cannot read as a position', () => {
    // "1.5 h" and "2.5 h" are a plausible lat/lon pair and the mask reaches
    // across newlines, so decimal efforts would ship redacted.
    const input = buildMissionPackageComposeInput(makeMission({
      objectives: [
        { id: 'o1', description: 'First', completed: false, effortMinutes: 90 },
        { id: 'o2', description: 'Second', completed: false, effortMinutes: 150 },
      ],
    }));
    const content = input.reports[0].content;
    expect(content).toContain('effort: 90 min');
    expect(content).toContain('effort: 150 min');
    expect(content).not.toContain('[redacted:position]');
  });

  it('exposes relatedReports/relatedCases only as counts, never as their real ids', () => {
    const input = buildMissionPackageComposeInput(makeMission());
    expect(input.metadata).toMatchObject({ relatedReportCount: 2, relatedCaseCount: 1 });
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('intel-report-1');
    expect(serialized).not.toContain('intelcase-1');
  });

  it('the single synthetic report entry carries only the briefing/objectives text, not linked report content', () => {
    const input = buildMissionPackageComposeInput(makeMission());
    expect(input.reports).toHaveLength(1);
    expect(input.reports[0].content).toContain('Contact analyst@earthalliance.example');
    expect(input.reports[0].content).toContain('Recon target');
    expect(input.reports[0].content).toContain('Extract asset');
    expect(input.intel).toEqual([]);
  });

  it('always redacts (unlike DraftBuilder, not gated on the handling axes), including the best-effort name heuristic', () => {
    // An unmarked mission: a Mission Package crosses the Navcom trust boundary
    // whatever the mission says about itself, so redaction is unconditional.
    const unmarked = buildMissionPackageComposeInput(makeMission());
    expect(unmarked.redaction).toEqual({ maskEmails: true, maskNumbers: true, maskNames: true });
  });
});

describe('buildMissionPackageManifest', () => {
  // Found by the publish review's first live run (plan item 0.1): the mask took
  // only unbroken runs of nine digits, so a phone number written the usual way
  // crossed into the package's description, and the review flagged it.
  it('masks a phone number written the usual ways, not only an unbroken run of digits', () => {
    for (const phone of ['(973) 555-0100', '973-555-0100', '973.555.0100', '+1 973 555 0100', '+44 20 7946 0958']) {
      const manifest = buildMissionPackageManifest(makeMission({ title: `Call ${phone}`, briefing: `Confirm by phone at ${phone}.` }));
      expect(manifest.description).not.toContain(phone);
      expect(manifest.description).toContain('[redacted:phone]');
      expect(manifest.name).not.toContain(phone);
    }
  });

  it('leaves dates, times and counts alone', () => {
    const manifest = buildMissionPackageManifest(makeMission({ briefing: 'On 2026-09-26 at 10:30, 2 of 5 sites; 150 people.' }));
    expect(manifest.description).toContain('2026-09-26');
    expect(manifest.description).toContain('10:30');
    expect(manifest.description).not.toContain('[redacted:phone]');
  });

  it('carries what a report counts as effect lines in a field of no one\'s name, and none when it asks none (MX32)', () => {
    expect(buildMissionPackageManifest(makeMission({ countLines: ['Kits placed: a count'] })).metadata.format).toEqual({ effect: ['Kits placed: a count'] });
    expect(buildMissionPackageManifest(makeMission()).metadata).not.toHaveProperty('format');
  });

  it('never embeds raw content in the manifest — only a checksum', () => {
    const manifest = buildMissionPackageManifest(makeMission());
    const serializedReport = JSON.stringify(manifest.reports);
    expect(serializedReport).not.toContain('analyst@earthalliance.example');
    expect(manifest.reports[0].checksum).toBeTruthy();
  });

  it('redaction is actually applied before checksumming, not just requested', () => {
    // Compare against the same content composed WITHOUT redaction — if
    // redact() were a no-op (or its flags were silently dropped), the two
    // checksums would be identical, since PackageComposer only ever hashes
    // the (possibly-redacted) content string.
    const input = buildMissionPackageComposeInput(makeMission());
    const redactedManifest = PackageComposer.compose(input).manifest;
    const unredactedManifest = PackageComposer.compose({ ...input, redaction: undefined }).manifest;
    expect(redactedManifest.reports[0].checksum).not.toBe(unredactedManifest.reports[0].checksum);
  });

  it('marks incomplete objectives distinctly from completed ones in the synthesized content', () => {
    const input = buildMissionPackageComposeInput(makeMission());
    expect(input.reports[0].content).toContain('[x] Recon target');
    expect(input.reports[0].content).toContain('[ ] Extract asset');
  });

  // Real gap fixed: `description` previously bypassed redact() entirely
  // (only reports[]/intel[] content ever went through it, and only to
  // compute a checksum — description crossed into the manifest verbatim).
  // manifest.description is set to mission.briefing directly, so this is
  // the one field where an unredacted leak was actually reachable, not
  // hypothetical.
  it('redacts description — not just the reports[] content that only ever affects a checksum', () => {
    const manifest = buildMissionPackageManifest(makeMission());
    expect(manifest.description).not.toContain('analyst@earthalliance.example');
    expect(manifest.description).not.toContain('123456789');
    expect(manifest.description).toContain('[redacted@email]');
  });

  it('the best-effort name heuristic redacts a Firstname-Lastname-shaped name out of the briefing', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      briefing: 'Debrief conducted by John Smith at checkpoint Delta.'
    }));
    expect(manifest.description).not.toContain('John Smith');
    expect(manifest.description).toContain('[redacted:name]');
  });
});

/**
 * Decision D1 (see docs/missions/01-architecture-decisions/mission-position-boundary.md):
 * a Mission MAY carry a position for in-app display, but that position does
 * NOT cross the Navcom boundary.
 *
 * These are written BEFORE any geo field exists on MissionUI, deliberately.
 * The builder composes metadata as an explicit allowlist rather than spreading
 * mission.metadata, so the boundary already holds by construction — and that
 * is exactly the property worth pinning, because it is invisible at the call
 * site. Whoever adds `mission.geo` will find this suite red only if they also
 * route it into the package, which is the moment the decision needs re-making
 * rather than inheriting.
 */
describe('Navcom boundary — mission position (D1)', () => {
  const BERLIN = { lat: 52.52, lon: 13.405 };

  /*
   * Amended for regions alone (D-MX, MX11): field work names the country or
   * state where it is, chosen by its publisher, so NavCom can draw it. A
   * point, a city or anything finer still never crosses.
   */
  it('carries field work as a region and an end, in the profile, and nothing finer', () => {
    const until = '2026-11-30T23:59:59.000Z';
    const manifest = buildMissionPackageManifest(makeMission({
      claims: 'one',
      fieldWork: { jurisdiction: 'us-ca', until },
      metadata: { geo: BERLIN },
    }), 'Night Owl');

    expect(manifest.profile).toEqual({
      missionState: 'open', claims: 'one', fieldWork: { jurisdiction: 'us-ca', validUntil: Date.parse(until) / 1000 },
    });
    expect(JSON.stringify(manifest)).not.toContain('13.405');
  });

  it('leaves out field work named finer than a state, rather than carrying the place', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      fieldWork: { jurisdiction: 'us-tx-leander', until: '2026-11-30T23:59:59.000Z' },
    }), 'Night Owl');

    expect(manifest.profile).toEqual({ missionState: 'open', claims: 'many' });
    expect(JSON.stringify(manifest)).not.toContain('leander');
  });

  it('does not carry a position placed in mission.metadata across the boundary', () => {
    const input = buildMissionPackageComposeInput(makeMission({
      metadata: { geo: BERLIN, latitude: BERLIN.lat, longitude: BERLIN.lon }
    }));

    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('52.52');
    expect(serialized).not.toContain('13.405');
  });

  it('keeps metadata an allowlist — an unknown key never rides through', () => {
    // The general form of the rule above. A spread would make every future
    // field opt-out; the allowlist makes each one opt-in.
    const input = buildMissionPackageComposeInput(makeMission({
      metadata: { somethingNobodyReviewed: 'leaked-value' }
    }));

    expect(JSON.stringify(input)).not.toContain('leaked-value');
    expect(Object.keys(input.metadata ?? {}).sort()).toEqual([
      'missionNumber', 'objectiveCount', 'relatedCaseCount', 'relatedReportCount', 'status'
    ]);
  });

  it('the same holds through to the composed manifest, not just the compose input', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      metadata: { geo: BERLIN }
    }));

    expect(JSON.stringify(manifest)).not.toContain('13.405');
  });

  /**
   * KNOWN GAP, asserted honestly rather than papered over.
   *
   * The structured boundary holds, but the briefing crosses as free text in
   * manifest.description, and the number mask only catches runs of nine or
   * more digits — so decimal degrees typed into prose survive it. This test
   * records the real behaviour so the gap is visible in CI instead of being
   * discovered after a relay broadcast, which cannot be recalled.
   *
   * Fixing it means a coordinate-shaped mask, which needs a decision first:
   * such a mask would also strip legitimate figures from a briefing.
   */
  it('a coordinate typed into the briefing is masked, not carried as prose', () => {
    // Was a KNOWN GAP: the number mask only caught runs of nine or more
    // digits, so decimal degrees in prose survived. D1 says position stays
    // internal, so the coordinate case is now closed explicitly.
    const manifest = buildMissionPackageManifest(makeMission({
      briefing: 'Rendezvous at 52.52, 13.405 before dawn.'
    }));

    expect(manifest.description).not.toContain('52.52');
    expect(manifest.description).not.toContain('13.405');
    expect(manifest.description).toContain('[redacted:position]');
    // The rest of the sentence survives — this is a position mask, not a purge.
    expect(manifest.description).toContain('before dawn');
  });

  /**
   * KNOWN GAP, and a wider one than the briefing above.
   *
   * Redaction is applied to the briefing (manifest.description) and to the
   * synthesized report content — but the mission TITLE is copied verbatim
   * into both manifest.name and reports[].title, reaching the wire with no
   * mask of any kind. Not even the nine-digit number rule applies to it.
   *
   * That matters more than it first looks: a title is exactly where an
   * operator writes a place ("Strike at ...", "Berlin rendezvous"), and it is
   * the one field guaranteed to be present on every package. This was
   * unnoticed because every previous test in this file left the title at its
   * fixture default.
   *
   * Recorded rather than silently fixed: masking the title runs into the same
   * unmade decision as the briefing mask (it would also strip legitimate
   * figures, e.g. an MSN number or a date), and D1 is about mission POSITION
   * specifically, so what belongs in a title is a boundary question that
   * needs answering before a mask is chosen.
   */
  it('masks a coordinate in the mission title, which no mask reached before', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      title: 'Strike at 52.52, 13.405'
    }));

    expect(manifest.name).toBe('Strike at [redacted:position]');
    expect(manifest.reports[0].title).toBe('Strike at [redacted:position]');
  });

  /**
   * The residual gap, stated rather than implied by silence.
   *
   * The mask is coordinate-shaped, so a place NAME still crosses. Note what
   * this test actually pins: 'Brandenburg Gate' is removed, but only because
   * the maskNames heuristic mistakes any Capitalised-Pair for a person — an
   * accident of shape, not place detection. A single-word place is untouched.
   *
   * Do not read the two-word case as coverage. Closing this properly needs a
   * gazetteer or an operator-facing preview of what will cross, not a wider
   * regex — and the title is the field most likely to carry one.
   */
  it('KNOWN GAP: a place named in prose still crosses the boundary', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      title: 'Berlin rendezvous', briefing: 'Meet at the Brandenburg Gate.'
    }));

    expect(manifest.name).toContain('Berlin');
    // Caught only incidentally, by the person-name heuristic.
    expect(manifest.description).toContain('[redacted:name]');
  });

  it('leaves legitimate figures alone — a lone number is not a position', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      briefing: 'Budget is 4500.75 credits over 12 days; see MSN-2026-0001.'
    }));

    expect(manifest.description).toContain('4500.75');
    expect(manifest.description).toContain('MSN-2026-0001');
    expect(manifest.description).not.toContain('[redacted:position]');
  });

  /**
   * The name mask is explicitly best-effort, and this pins how weak it is so
   * nobody reads "maskNames: true" as a guarantee: it takes the given name
   * and leaves the surname standing.
   */
  it('KNOWN GAP: maskNames strips a given name but leaves the surname', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      briefing: 'Contact Sarah Chen on arrival.'
    }));

    expect(manifest.description).not.toContain('Sarah');
    expect(manifest.description).toContain('Chen');
  });

  /**
   * The boundary MOVED, deliberately, and this records where it moved to.
   *
   * This asserted that objective text never crosses — only the count — and
   * warned that "a future change that started carrying objective descriptions
   * (e.g. to make packages more useful downstream) would be a real boundary
   * change, and this fails first". It did fail first, on 2026-09-21, which is
   * the test working rather than the test being wrong.
   *
   * The change was made knowingly: the asks were the one thing that would let
   * an outsider decide whether they could do the work, and without them a
   * Mission Package reached a peer as a title, a briefing and a number. See
   * MissionPackageBuilder.objectives.test.ts and spec rev 5.
   *
   * What did NOT move is asserted below, and is the part that was always the
   * point: a coordinate inside an objective still does not cross.
   */
  it('carries objective text, and still never carries a position inside it', () => {
    const manifest = buildMissionPackageManifest(makeMission({
      objectives: [{ id: 'o1', description: 'Observe the 48.8566, 2.3522 rooftop', completed: false }]
    }));

    const serialized = JSON.stringify(manifest);
    // The ask crosses now.
    expect(manifest.objectives?.[0].ask).toContain('rooftop');
    // The position in it does not, and that was the invariant worth keeping.
    expect(serialized).not.toContain('48.8566');
    expect(manifest.objectives?.[0].ask).toContain('[redacted:position]');
    expect(manifest.metadata?.objectiveCount).toBe(1);
  });
});
