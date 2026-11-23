/**
 * A received package as a card that leads with what it asks (decision D-MF, MF1). The fixtures keep the
 * shapes Mecha Jono's packages had on The Record on 2026-10-16: the mission line opening the description,
 * the stakes in the paragraph after it, the place and end in profile.fieldWork or metadata.mechaJono.
 */
import { describe, it, expect } from 'vitest';
import type { AcceptedPackage } from '../../MissionPackageIngest';
import { isGrantNotice, limitsOf, missionCardOf, sortMissionCards } from '../missionCard';

const PUBKEY = 'b'.repeat(64);
const DAY = 86_400_000;

function pkg(over: {
  d?: string; name?: string; description?: string; tags?: string[][]; createdAt?: number;
  profile?: Record<string, unknown>; metadata?: Record<string, unknown>;
  objectives?: Array<{ ask: string; effortMinutes?: number; done?: boolean }>;
}): AcceptedPackage {
  const d = over.d ?? 'starcom_mission_package_x';
  return {
    event: {
      id: `${d}-${over.createdAt ?? 1}`, pubkey: PUBKEY, created_at: over.createdAt ?? 1_790_000_000, kind: 30079,
      tags: [['d', d], ['t', 'starcom_mission_package'], ...(over.tags ?? [])], content: '{}', sig: '',
    },
    check: {
      ok: true,
      manifest: {
        id: d, name: over.name ?? '', version: '1.0.0', description: over.description ?? '', author: 'Mecha Jono',
        createdAt: '2026-10-16T00:00:00Z', license: 'CC-BY-4.0', visibility: 'public', reports: [], intel: [], assets: [],
        metadata: over.metadata ?? {},
        objectives: (over.objectives ?? []).map((o, i) => ({ id: `${d}#${i}`, ask: o.ask, effortMinutes: o.effortMinutes, done: o.done ?? false })),
        ...(over.profile ? { profile: over.profile } : {}),
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}

const naloxone = pkg({
  d: 'starcom_mission_package_field-naloxone-nm',
  name: 'Carry naloxone in New Mexico: overdose deaths up 31.9% in a year',
  description: 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico, and more people who know how to use it.\n\n'
    + "The CDC's provisional count: 1,128 people died of a drug overdose in New Mexico in the 12 months to May 2026, up 31.9% from 855 a year before, while most states fell. Naloxone reverses an opioid overdose, is sold without a prescription, and anyone can carry it. A third sentence the card leaves out.",
  tags: [['t', 'where:field'], ['mission_state', 'open']],
  profile: { agent: 'mecha_jono', claims: 'many', fieldWork: { jurisdiction: 'us-nm', validUntil: 1_794_700_800 }, missionState: 'open' },
  metadata: { mechaJono: { area: { country: 'us-nm', state: 'NM' }, window: { until: '2026-11-15T00:00:00+00:00' } } },
  objectives: [
    { ask: 'Get naloxone: most pharmacies sell it without a prescription.', effortMinutes: 30 },
    { ask: 'Learn the four steps of using it.', effortMinutes: 10 },
    { ask: 'Carry it, and tell two people where it is.', effortMinutes: 30 },
    { ask: 'Count the kits carried or placed.', effortMinutes: 5 },
  ],
});

const advisory = pkg({
  d: 'starcom_mission_package_ic-icsa-26-272-05',
  name: 'Anjvision YSSD-RTMP-H5',
  description: 'MISSION: Get owners of Anjvision YSSD-RTMP-H5 a fix or a mitigation they can use tonight, and record whether the vendor answers.\n\n'
    + 'The advisory ICSA-26-272-05 on Anjvision YSSD-RTMP-H5 lists 1 vulnerability scored 9 or higher with no fix available or planned.',
  tags: [['t', 'where:desk'], ['t', 'variant:quick_win'], ['mission_state', 'open']],
  objectives: [{ ask: "Read the vendor's own published material.", effortMinutes: 20 }, { ask: 'Write what you found.', effortMinutes: 15, done: true }],
});

describe('missionCardOf', () => {
  it('leads with the mission line, keeps the title as what it is about, and the stakes as two sentences', () => {
    const card = missionCardOf(naloxone);
    expect(card.headline).toBe('Put naloxone in more pockets and first-aid kits in New Mexico, and more people who know how to use it.');
    expect(card.subject).toBe('Carry naloxone in New Mexico: overdose deaths up 31.9% in a year');
    expect(card.stakes).toBe("The CDC's provisional count: 1,128 people died of a drug overdose in New Mexico in the 12 months to May 2026, up 31.9% from 855 a year before, while most states fell. Naloxone reverses an opioid overdose, is sold without a prescription, and anyone can carry it.");
  });

  it('stops the stakes before a list, and leaves out the sentence that only introduces it', () => {
    const card = missionCardOf(pkg({
      name: 'Protect the older people around you: 4 scams to know',
      description: 'MISSION: Get this fortnight\'s scam warnings to the older people around you.\n\n'
        + "Older people lose the most to scams, and a warning reaches them best from someone they know. The FTC and the FBI's Internet Crime Complaint Center named these in the last month:\n• What to know ahead of open enrollment\n• Fake toll texts",
    }));
    expect(card.stakes).toBe('Older people lose the most to scams, and a warning reaches them best from someone they know.');
  });

  it('cuts stakes with no sentence break at a word, and says it was cut', () => {
    const long = `${'word '.repeat(120)}end`;
    const card = missionCardOf(pkg({ name: 'Long', description: `MISSION: Do it.\n\n${long}` }));
    expect(card.stakes!.length).toBeLessThanOrEqual(281);
    expect(card.stakes).toMatch(/word…$/);
  });

  it('a device model as its title still leads with what to do', () => {
    const card = missionCardOf(advisory);
    expect(card.headline).toMatch(/^Get owners of Anjvision YSSD-RTMP-H5 a fix/);
    expect(card.subject).toBe('Anjvision YSSD-RTMP-H5');
  });

  it('prefers the mission its format states over the description', () => {
    const card = missionCardOf(pkg({ name: 'Heat', description: 'MISSION: from the text.', metadata: { mechaJono: { format: { mission: 'From the format.' } } } }));
    expect(card.headline).toBe('From the format.');
  });

  it('with no mission line, the title is the headline and there is no subject', () => {
    const card = missionCardOf(pkg({ name: 'Disaster relief, the way responders ask: West Virginia', description: 'FEMA has declared a major disaster in West Virginia.' }));
    expect(card.headline).toBe('Disaster relief, the way responders ask: West Virginia');
    expect(card.subject).toBeUndefined();
    expect(card.stakes).toBe('FEMA has declared a major disaster in West Virginia.');
  });

  it('reads the place, the end, the effort left and the steps', () => {
    const card = missionCardOf(naloxone);
    expect(card.place).toEqual({ state: 'NM' });
    expect(card.closesAt).toBe(1_794_700_800_000);
    expect(card.effortMinutes).toBe(75);
    expect(card.steps).toHaveLength(4);
    expect(card.where).toBe('field');
  });

  it('knows a field mission by its field_mission tag too, as the panel does', () => {
    expect(missionCardOf(pkg({ tags: [['t', 'field_mission']] })).where).toBe('field');
  });

  it('counts only the steps not yet done', () => {
    const card = missionCardOf(advisory);
    expect(card.effortMinutes).toBe(20);
    expect(card.steps).toEqual(["Read the vendor's own published material."]);
    expect(card.quickWin).toBe(true);
    expect(card.where).toBe('desk');
  });

  it('reads a place and an end from metadata where the profile has none', () => {
    const card = missionCardOf(pkg({ metadata: { mechaJono: { area: { country: 'us' }, window: { until: '2026-10-19T00:00:00+00:00' } } } }));
    expect(card.place).toEqual({ country: 'US' });
    expect(card.closesAt).toBe(Date.parse('2026-10-19T00:00:00Z'));
  });

  it('names the areas a package lists', () => {
    const card = missionCardOf(pkg({ metadata: { mechaJono: { area: { areas: ['Los Angeles County Beaches', 'Malibu Coast'], country: 'us-ca', state: 'CA' } } } }));
    expect(card.place).toEqual({ state: 'CA', areas: ['Los Angeles County Beaches', 'Malibu Coast'] });
  });

  it('states nothing it was not told', () => {
    const card = missionCardOf(pkg({ name: 'Bare', description: '' }));
    expect(card.place).toBeUndefined();
    expect(card.closesAt).toBeUndefined();
    expect(card.effortMinutes).toBeUndefined();
    expect(card.stakes).toBeUndefined();
    expect(card.where).toBeUndefined();
  });

  it('takes its state from the signed profile over the tags, as the panel does', () => {
    expect(missionCardOf(pkg({ tags: [['mission_state', 'open']], profile: { missionState: 'closed', claims: 'many' } })).open).toBe(false);
  });

  it('reads a field mission\'s place and end from its NavCom tags when it carries no signed profile', () => {
    const card = missionCardOf(pkg({ tags: [['t', 'navcom_mission'], ['jurisdiction', 'us-ca'], ['valid_until', '1796083199']] }));
    expect(card.place).toEqual({ state: 'CA' });
    expect(card.closesAt).toBe(1_796_083_199_000);
  });

  it('is closed when its state says so', () => {
    expect(missionCardOf(pkg({ tags: [['mission_state', 'closed']] })).open).toBe(false);
    expect(missionCardOf(pkg({ profile: { missionState: 'closed' } })).open).toBe(false);
    expect(missionCardOf(naloxone).open).toBe(true);
  });
});

describe('sortMissionCards', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const card = (key: string, over: Partial<ReturnType<typeof missionCardOf>>) => ({ ...missionCardOf(pkg({ d: key })), key, ...over });

  it('puts what closes soonest first, then what can be done now, then the newest; ended and closed last', () => {
    const sorted = sortMissionCards([
      card('closed', { open: false, closesAt: now + DAY }),
      card('later', { closesAt: now + 30 * DAY }),
      card('ended', { closesAt: now - DAY }),
      card('undated-old', { publishedAt: now - 9 * DAY }),
      card('quick', { quickWin: true, publishedAt: now - 20 * DAY }),
      card('soon', { closesAt: now + 2 * DAY }),
      card('undated-new', { publishedAt: now - DAY }),
    ], now);
    expect(sorted.map((c) => c.key)).toEqual(['soon', 'later', 'quick', 'undated-new', 'undated-old', 'ended', 'closed']);
  });
});

describe('isGrantNotice', () => {
  // MF5: grants are not missions. Mecha Jono's grant notices carry the family and the category.
  it('knows a grant notice by its family or its category, and nothing else', () => {
    expect(isGrantNotice(pkg({ tags: [['mission_family', 'grant']] }))).toBe(true);
    expect(isGrantNotice(pkg({ tags: [['t', 'category:funding.grant']] }))).toBe(true);
    expect(isGrantNotice(pkg({ tags: [['mission_family', 'naloxone'], ['t', 'category:outreach.naloxone']] }))).toBe(false);
    expect(isGrantNotice(pkg({}))).toBe(false);
  });
});

describe('limitsOf', () => {
  // MF9: a mission's safety limits are read and agreed before it is taken.
  it("is the limits its format states, or else every ask's, each said once", () => {
    expect(limitsOf(pkg({ metadata: { mechaJono: { format: { limits: 'Work in pairs. Never confront anyone.' } } } }))).toBe('Work in pairs. Never confront anyone.');
    const fromAsks = pkg({ objectives: [{ ask: 'One' }, { ask: 'Two' }] });
    fromAsks.check.manifest!.objectives[0].limits = ['Do not contact the vendor.'];
    fromAsks.check.manifest!.objectives[1].limits = ['Do not contact the vendor.', 'Post nothing.'];
    expect(limitsOf(fromAsks)).toBe('Do not contact the vendor. Post nothing.');
    expect(limitsOf(pkg({ objectives: [{ ask: 'One' }] }))).toBeUndefined();
  });
});
