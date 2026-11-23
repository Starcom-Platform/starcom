/**
 * The round trip the handoff promises: a package Starcom publishes verifies
 * in Starcom.
 *
 * Until this existed, Starcom could sign a Mission Package and had never once
 * verified one — verifyManifestSignature had no caller outside its own tests,
 * and nothing consumed kind 30079 at all. The conformance checklist given to
 * a second node was therefore half impossible on our side, which is a poor
 * thing to discover after they build against it.
 *
 * Real keys sign real events here, so this runs in node: jsdom's Uint8Array is
 * a different realm and @noble rejects it inside getEventHash.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19, type Event as NostrEvent } from 'nostr-tools';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex } from '@noble/hashes/utils';
import { verifyMissionPackageEvent } from '../MissionPackageVerifier';
import { rememberNamedNote } from '../namesPeople';
import { buildMissionPackageManifest } from '../MissionPackageBuilder';
import { MissionPackageBroadcastService } from '../MissionPackageBroadcastService';
import { profileTags } from '../packageProfile';
import { createMLDSASigner } from '../../exchange/signing';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { PackageManifest } from '../../exchange/types';

const sk = generateSecretKey();

const mission = (o: Partial<MissionUI> = {}): MissionUI => ({
  id: 'm1', missionNumber: 'MSN-2026-0001', title: 'Recon', briefing: 'Proceed as briefed.',
  status: MissionStatus.READY_FOR_PACKAGE, objectives: [], assignedTo: [],
  startDate: '2026-01-15T00:00:00.000Z', relatedReports: [], relatedCases: [],
  collaborators: [], activityLog: [],
  createdBy: getPublicKey(sk), createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z', ...o,
} as MissionUI);

/** The signer's own key names it, as a package published through Starcom without a callsign does (D-MX, MX7). */
const SIGNER = nip19.npubEncode(getPublicKey(sk));

async function signedManifest(overrides: Partial<MissionUI> = {}): Promise<PackageManifest> {
  const keys = ml_dsa65.keygen();
  return createMLDSASigner(bytesToHex(keys.secretKey))(buildMissionPackageManifest(mission(overrides), SIGNER));
}

/** Signs the package as the broadcaster tags it, profile included (rev 11); `editTags` alters the tags first. */
function publish(manifest: PackageManifest, secret = sk, editTags: (tags: string[][]) => string[][] = (tags) => tags): NostrEvent {
  return finalizeEvent({
    kind: 30079,
    created_at: Math.floor(Date.parse('2026-01-15T00:00:00.000Z') / 1000),
    tags: editTags([
      ['d', `starcom_mission_package_${manifest.id}`],
      ['t', 'starcom_mission_package'],
      ['t', 'navcom_handoff'],
      ...profileTags(manifest.profile),
    ]),
    content: JSON.stringify(manifest),
  } as Parameters<typeof finalizeEvent>[0], secret);
}

const resign = (manifest: PackageManifest) => createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(manifest);

describe('a package Starcom publishes verifies in Starcom', () => {
  it('accepts a genuine round trip', async () => {
    const check = await verifyMissionPackageEvent(publish(await signedManifest()));
    expect(check.reason ?? 'ok').toBe('ok');
    expect(check.ok).toBe(true);
    expect(check.manifest?.name).toBe('Recon');
  });

  it('accepts a package from a DIFFERENT node', async () => {
    // The invariant is institutional, not "this institution". Requiring the
    // literal "Starcom" would oblige every peer to claim to be us — which is
    // exactly what the conformance runner did until this was written.
    const manifest = { ...(await signedManifest()), author: 'Mecha Jono' };
    const resigned = await createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(manifest);
    const check = await verifyMissionPackageEvent(publish(resigned));
    expect(check.ok).toBe(true);
  });
});

describe('node admission — the only inter-node trust decision available', () => {
  it('admits everyone when no allowlist is set', async () => {
    // The honest default for an open commons: a package from an unknown node
    // is not thereby false, and refusing to look is not refusing to believe.
    const check = await verifyMissionPackageEvent(publish(await signedManifest()), {});
    expect(check.ok).toBe(true);
  });

  it('refuses a publisher outside the allowlist, before doing any other work', async () => {
    const stranger = generateSecretKey();
    const event = publish(await signedManifest(), stranger);
    const check = await verifyMissionPackageEvent(event, {
      admittedPublishers: new Set([getPublicKey(sk)]),
    });
    expect(check.code).toBe('publisher-not-admitted');
  });

  it('admits a listed publisher and still verifies everything else', async () => {
    // Admission is not a bypass: a package from an admitted node with a broken
    // signature is still refused.
    const admitted = { admittedPublishers: new Set([getPublicKey(sk)]) };
    expect((await verifyMissionPackageEvent(publish(await signedManifest()), admitted)).ok).toBe(true);

    const unsigned = buildMissionPackageManifest(mission(), SIGNER);
    expect((await verifyMissionPackageEvent(publish(unsigned), admitted)).code)
      .toBe('missing-manifest-signature');
  });
});

describe('what the verifier refuses', () => {
  it('refuses a tampered manifest — the ML-DSA block no longer matches', async () => {
    const manifest = await signedManifest();
    const event = publish({ ...manifest, name: 'Something else' });
    const check = await verifyMissionPackageEvent(event);
    expect(check.code).toBe('bad-manifest-signature');
  });

  it('refuses a tampered event — the Schnorr signature no longer matches', async () => {
    const event = publish(await signedManifest());
    const tampered = { ...event, content: JSON.stringify({ tampered: true }) };
    const check = await verifyMissionPackageEvent(tampered);
    expect(check.code).toBe('bad-event-signature');
  });

  it('refuses an unsigned manifest rather than trusting the outer signature alone', async () => {
    // The outer signature proves who sent it, not that the payload is what its
    // producer signed. One does not substitute for the other.
    const unsigned = buildMissionPackageManifest(mission(), SIGNER);
    const check = await verifyMissionPackageEvent(publish(unsigned));
    expect(check.code).toBe('missing-manifest-signature');
  });

  it('accepts its signer as author, by callsign or by their own key, hex or npub (D-MX, MX7)', async () => {
    for (const author of ['Night Owl', getPublicKey(sk), nip19.npubEncode(getPublicKey(sk))]) {
      const manifest = { ...(await signedManifest()), author };
      const resigned = await createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(manifest);
      const check = await verifyMissionPackageEvent(publish(resigned));
      expect(check.ok, author).toBe(true);
    }
  });

  it('refuses a manifest that names no author, as one built without its signer does', async () => {
    const manifest = { ...(await signedManifest()), author: '   ' };
    const resigned = await createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(manifest);
    expect((await verifyMissionPackageEvent(publish(resigned))).code).toBe('author-missing');
  });

  it('refuses a manifest naming another key as its author: nobody publishes in another\'s name', async () => {
    const other = getPublicKey(generateSecretKey());
    for (const author of [other, nip19.npubEncode(other)]) {
      const manifest = { ...(await signedManifest()), author };
      const resigned = await createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(manifest);
      const check = await verifyMissionPackageEvent(publish(resigned));
      expect(check.code, author).toBe('author-not-signer');
    }
  });

  it('refuses a report entry carrying body content', async () => {
    const manifest = await signedManifest();
    const leaky = { ...manifest, reports: [{ ...manifest.reports[0], content: 'linked report body' }] };
    const resigned = await createMLDSASigner(bytesToHex(ml_dsa65.keygen().secretKey))(leaky as never);
    const check = await verifyMissionPackageEvent(publish(resigned));
    expect(check.code).toBe('report-body-crossed');
  });

  it('refuses a manifest that does not match the package schema, and names the field', async () => {
    // Everything the checks before it read is fine, and a signature block is present:
    // only the schema can see this, and until now it was never consulted.
    const manifest = { ...(await signedManifest()), createdAt: 'last Tuesday' } as PackageManifest;
    const check = await verifyMissionPackageEvent(publish(manifest));
    expect(check.ok).toBe(false);
    expect(check.code).toBe('malformed-manifest');
    expect(check.reason).toMatch(/createdAt/);
  });

  it('refuses an event missing the application tag', async () => {
    const manifest = await signedManifest();
    const event = finalizeEvent({
      kind: 30079, created_at: 1,
      tags: [['d', `starcom_mission_package_${manifest.id}`]],
      content: JSON.stringify(manifest),
    } as Parameters<typeof finalizeEvent>[0], sk);
    expect((await verifyMissionPackageEvent(event)).code).toBe('missing-app-tag');
  });

  describe('a package too big to check (security re-audit, 2026-10-23)', () => {
    const withContent = (content: string) => finalizeEvent({
      kind: 30079, created_at: 1,
      tags: [['d', 'x'], ['t', 'starcom_mission_package']],
      content,
    } as Parameters<typeof finalizeEvent>[0], sk);

    it('refuses content over The Record\'s 131,072 bytes before parsing it, and takes it at the limit', async () => {
      const over = await verifyMissionPackageEvent(withContent('x'.repeat(131_073)));
      expect(over.code).toBe('content-too-large');
      expect(over.reason).toContain('131,072 bytes');
      // At the limit the size passes, and what is wrong is that it is not JSON.
      expect((await verifyMissionPackageEvent(withContent('x'.repeat(131_072)))).code).toBe('unparseable-content');
    });

    it('counts bytes, not characters', async () => {
      // 65,537 characters, under the limit as a string, but 196,611 bytes of UTF-8.
      expect((await verifyMissionPackageEvent(withContent('€'.repeat(65_537)))).code).toBe('content-too-large');
    });

    it('refuses a list over 1,000 entries before the schema walks it, and names the list', async () => {
      const manifest = await signedManifest();
      // Every entry fails the schema: checked after it, these would be malformed-manifest.
      const reports = await verifyMissionPackageEvent(publish({ ...manifest, reports: Array(1_001).fill({}) }));
      expect(reports.code).toBe('list-too-long');
      expect(reports.reason).toContain('reports list holds 1,001 entries, more than the 1,000');
      const intel = await verifyMissionPackageEvent(publish({ ...manifest, intel: Array(1_001).fill({}) }));
      expect(intel.code).toBe('list-too-long');
      expect(intel.reason).toContain('intel list');
      const assets = await verifyMissionPackageEvent(publish({ ...manifest, assets: Array(1_001).fill({}) }));
      expect(assets.code).toBe('list-too-long');
      expect(assets.reason).toContain('assets list');
      // 1,000 is within the limit, so the schema sees them and refuses them itself.
      expect((await verifyMissionPackageEvent(publish({ ...manifest, reports: Array(1_000).fill({}) }))).code)
        .toBe('malformed-manifest');
    });
  });

  it('refuses a wrong kind and unparseable content', async () => {
    const wrongKind = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: '{}' } as never, sk);
    expect((await verifyMissionPackageEvent(wrongKind)).code).toBe('wrong-kind');

    const garbage = finalizeEvent({
      kind: 30079, created_at: 1,
      tags: [['d', 'x'], ['t', 'starcom_mission_package']],
      content: 'not json',
    } as Parameters<typeof finalizeEvent>[0], sk);
    expect((await verifyMissionPackageEvent(garbage)).code).toBe('unparseable-content');
  });

  it('always pairs a machine code with a human sentence', async () => {
    const check = await verifyMissionPackageEvent(publish(buildMissionPackageManifest(mission(), SIGNER)));
    expect(check.code).toBeTruthy();
    expect(check.reason).toBeTruthy();
  });
});

describe('the package profile NavCom reads (interchange rev 11; D-MX, MX2, MX13)', () => {
  // Field work names something to report, as NavCom asks of it (rev 5, §4.3; D-MX MX28).
  const FIELD_WORK: Partial<MissionUI> = {
    claims: 'one', fieldWork: { jurisdiction: 'us-ca', until: '2026-11-30T23:59:59.000Z' },
    objectives: [{ id: 'o1', description: 'Count the cooling centres open', completed: false }],
  };

  it('accepts a package whose tags say what its signed profile says, as the broadcaster writes them', async () => {
    const manifest = await signedManifest(FIELD_WORK);
    const event = finalizeEvent(
      new MissionPackageBroadcastService([]).buildUnsignedEvent(manifest) as Parameters<typeof finalizeEvent>[0], sk,
    );
    expect(event.tags).toContainEqual(['jurisdiction', 'us-ca']);
    expect((await verifyMissionPackageEvent(event)).ok).toBe(true);
  });

  it('refuses tags that say other than the signed profile: another state, another region, or field work it never signed', async () => {
    const fieldWork = await signedManifest(FIELD_WORK);
    const deskWork = await signedManifest();
    const cases: Array<[PackageManifest, (tags: string[][]) => string[][]]> = [
      [fieldWork, (tags) => tags.map((t) => (t[0] === 'mission_state' ? ['mission_state', 'closed'] : t))],
      [fieldWork, (tags) => tags.map((t) => (t[0] === 'jurisdiction' ? ['jurisdiction', 'us-tx'] : t))],
      [fieldWork, (tags) => [...tags, ['jurisdiction', 'us-nv']]],
      [fieldWork, (tags) => tags.filter((t) => t[0] !== 'valid_until')],
      [fieldWork, (tags) => tags.filter((t) => !(t[0] === 't' && t[1] === 'navcom_mission'))],
      [deskWork, (tags) => [...tags, ['t', 'navcom_mission'], ['jurisdiction', 'us-ca']]],
      [deskWork, (tags) => tags.map((t) => (t[0] === 'claims' ? ['claims', 'one'] : t))],
      [deskWork, (tags) => [...tags, ['agent', 'someone_else']]],
    ];
    for (const [manifest, editTags] of cases) {
      const check = await verifyMissionPackageEvent(publish(manifest, sk, editTags));
      expect(check.code).toBe('profile-tags-disagree');
      expect(check.reason).toBeTruthy();
    }
  });

  it('refuses a signed profile that is malformed: claimed by anybody, or a region finer than a state', async () => {
    const malformed = [
      { missionState: 'claimed', claims: 'many' },
      { missionState: 'open', fieldWork: { jurisdiction: 'us-tx-leander', validUntil: 1796083199 } },
      { missionState: 'pending' },
    ];
    for (const profile of malformed) {
      const manifest = await resign({ ...(await signedManifest()), profile } as unknown as PackageManifest);
      const check = await verifyMissionPackageEvent(publish(manifest));
      expect(check.code, JSON.stringify(profile)).toBe('malformed-manifest');
      expect(check.reason).toMatch(/profile/);
    }
  });

  it('accepts a package with no profile, as one from before rev 11, with or without profile tags another producer wrote', async () => {
    // An objective, so the tagged copy is a field package someone could report on (§4.3).
    const { profile: _dropped, ...rest } = await signedManifest({ objectives: [{ id: 'o1', description: 'Look', completed: false }] });
    const noProfile = await resign(rest as PackageManifest);
    expect((await verifyMissionPackageEvent(publish(noProfile))).ok).toBe(true);
    const tagged = publish(noProfile, sk, (tags) => [...tags, ['mission_state', 'open'], ['t', 'navcom_mission']]);
    expect((await verifyMissionPackageEvent(tagged)).ok).toBe(true);
  });
});

describe('a field package NavCom could not take reports on is refused, as NavCom refuses it (rev 5, §4.3; D-MX MX28)', () => {
  const FIELD: Partial<MissionUI> = {
    fieldWork: { jurisdiction: 'us-ca', until: '2026-11-30T23:59:59.000Z' },
    objectives: [{ id: 'o1', description: 'Count the cooling centres open', completed: false }, { id: 'o2', description: 'Note their hours', completed: false }],
  };
  const refusalOf = async (manifest: PackageManifest, editTags?: (tags: string[][]) => string[][]) =>
    verifyMissionPackageEvent(publish(manifest, sk, editTags));
  const withEffect = async (effect: string[]) => {
    const base = await signedManifest(FIELD);
    const { signature: _signature, ...metadata } = (base.metadata ?? {}) as Record<string, unknown>;
    return resign({ ...base, metadata: { ...metadata, mechaJono: { format: { effect } } } } as PackageManifest);
  };

  it('accepts a sound field package, and holds no desk package to the rules', async () => {
    expect((await refusalOf(await signedManifest(FIELD))).ok).toBe(true);
    expect((await refusalOf(await signedManifest({ objectives: [] }))).ok).toBe(true);
  });

  it('refuses one with no objectives, and one with two sharing an id', async () => {
    const none = await refusalOf(await signedManifest({ ...FIELD, objectives: [] }));
    expect(none).toMatchObject({ ok: false, code: 'field-package-unreportable' });
    expect(none.reason).toMatch(/no objectives/);
    const shared = await refusalOf(await signedManifest({ ...FIELD, objectives: [FIELD.objectives![0], { ...FIELD.objectives![1], id: 'o1' }] }));
    expect(shared.reason).toMatch(/sharing an id/);
  });

  it('refuses an objective id holding a space, and a d tag holding one', async () => {
    const spaced = await refusalOf(await signedManifest({ ...FIELD, objectives: [{ ...FIELD.objectives![0], id: 'o 1' }] }));
    expect(spaced.reason).toMatch(/empty or holds a space/);
    const d = await refusalOf(await signedManifest(FIELD), (tags) => tags.map((t) => (t[0] === 'd' ? ['d', 'field heat'] : t)));
    expect(d.reason).toMatch(/d tag/);
  });

  it('refuses an effect line over 200 characters, but not one of exactly 200', async () => {
    expect((await refusalOf(await withEffect(['x'.repeat(200)]))).ok).toBe(true);
    const long = await refusalOf(await withEffect(['x'.repeat(201)]));
    expect(long.reason).toMatch(/over 200 characters/);
  });

  it('refuses one that runs past 2100', async () => {
    const late = await refusalOf(await signedManifest({ ...FIELD, fieldWork: { jurisdiction: 'us-ca', until: '2100-06-01T00:00:00.000Z' } }));
    expect(late.reason).toMatch(/past 2100/);
  });
});

describe('a mission names no one (D-NP, NP5)', () => {
  it('refuses a package that carries the words of a note naming a person, and takes it when it does not', async () => {
    rememberNamedNote('30023:x:named', 'Minister Jane Roe resigns over the port deal', '');
    const carrying = await verifyMissionPackageEvent(publish(await signedManifest({ title: 'Follow up: Minister Jane Roe resigns over the port deal' })));
    expect(carrying.ok).toBe(false);
    expect(carrying.code).toBe('carries-named-words');
    expect(carrying.reason).toMatch(/names no one/);

    const clean = await verifyMissionPackageEvent(publish(await signedManifest({ title: 'Follow up on the port deal' })));
    expect(clean.reason ?? 'ok').toBe('ok');
  });
});
