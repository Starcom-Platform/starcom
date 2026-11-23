/**
 * Mecha Jono's grant notices for the Market Exchange's Grants tab (decision D-MF, MF5): grants are not
 * missions. A notice carries no Grants.gov opportunity number, so it meets its window by title, as 10 of the
 * 17 open on 2026-10-16 did exactly; a title Mecha Jono cut short ("…") meets one beginning with it.
 */
import { describe, it, expect } from 'vitest';
import type { AcceptedPackage } from '../../intel/MissionPackageIngest';
import type { FundingWindow } from '../feeds/grantsGov';
import { grantNoticesFrom, matchNotices } from '../grantNotices';

const SIGNER = '6'.repeat(64);

function grant(d: string, over: { name?: string; closes?: string; state?: string; visibility?: string; family?: string } = {}): AcceptedPackage {
  return {
    event: {
      id: `evt-${d}`, pubkey: SIGNER, created_at: 1_790_000_000, kind: 30079, content: '', sig: '',
      tags: [['d', `starcom_mission_package_${d}`], ['mission_family', over.family ?? 'grant'], ['mission_state', over.state ?? 'open']],
    },
    check: {
      ok: true,
      manifest: {
        id: d, name: over.name ?? `Grant ${d}`, version: '1.0.0', author: 'Mecha Jono', createdAt: '2026-10-16T00:00:00Z',
        description: `MISSION: Get ${over.name ?? d} funding to a local group that does this work.\n\nIt closes soon and admits a registered nonprofit.`,
        license: 'CC-BY-4.0', visibility: over.visibility ?? 'public', reports: [], intel: [], assets: [],
        metadata: { mechaJono: { operation: { clock: over.closes ? [{ date: over.closes, what: 'closes' }] : [] } } },
        objectives: [
          { id: `${d}#1`, ask: 'Read the eligibility text.', effortMinutes: 10, done: false },
          { id: `${d}#2`, ask: 'Find a local group that does this work, and get it to them.', effortMinutes: 30, done: false },
        ],
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}

const window = (id: string, title: string): FundingWindow => ({
  id, number: `N-${id}`, title, agency: 'Bureau of Justice Assistance', agencyCode: 'USDOJ-OJP-BJA', opens: '2026-08-01', closes: '2026-10-30',
  status: 'posted', categories: ['LJL'], audiences: [], url: `https://www.grants.gov/search-results-detail/${id}`,
});

describe('grantNoticesFrom', () => {
  it('takes the open, public grant notices, with their mission line, steps and closing date', () => {
    const notices = grantNoticesFrom([
      grant('a', { name: 'BJA FY 2026 Second Chance Act Community-based Reentry Program', closes: '2026-10-30' }),
      grant('closed', { state: 'closed' }),
      grant('limited', { visibility: 'limited' }),
      grant('naloxone', { family: 'naloxone' }),
    ]);
    expect(notices.map((n) => n.title)).toEqual(['BJA FY 2026 Second Chance Act Community-based Reentry Program']);
    expect(notices[0]).toMatchObject({
      closes: '2026-10-30',
      mission: 'Get BJA FY 2026 Second Chance Act Community-based Reentry Program funding to a local group that does this work.',
      steps: ['Read the eligibility text.', 'Find a local group that does this work, and get it to them.'],
      signer: SIGNER,
    });
  });
});

describe('matchNotices', () => {
  const windows = [
    window('1', 'BJA FY 2026 Second Chance Act Community-based Reentry Program'),
    window('2', 'OJJDP FY 2026 Strengthening Internet Crimes Against Children (ICAC) Technological Investigative Capacity'),
  ];

  it('meets a notice with the window of its title, whatever the case and punctuation', () => {
    const [notice] = grantNoticesFrom([grant('a', { name: 'BJA FY 2026 Second-Chance Act Community-Based Reentry Program' })]);
    const { byWindow, unmatched } = matchNotices(windows, [notice]);
    expect(byWindow.get('1')?.key).toBe(notice.key);
    expect(unmatched).toEqual([]);
  });

  it('meets a title cut short with the window that begins with it', () => {
    const [notice] = grantNoticesFrom([grant('b', { name: 'OJJDP FY 2026 Strengthening Internet Crimes Against Children (ICAC) Technological Investigative…' })]);
    expect(matchNotices(windows, [notice]).byWindow.get('2')?.key).toBe(notice.key);
  });

  it('meets a whole title only with the same title, never with a longer one beginning with it', () => {
    const [notice] = grantNoticesFrom([grant('e', { name: 'BJA FY 2026 Second Chance Act' })]);
    expect(matchNotices(windows, [notice]).byWindow.size).toBe(0);
  });

  it('keeps a notice no window here meets, and does not stretch a short prefix to one', () => {
    const notices = grantNoticesFrom([
      grant('c', { name: 'Strengthening Ghana Health Service laboratory services' }),
      grant('d', { name: 'BJA…' }),
    ]);
    const { byWindow, unmatched } = matchNotices(windows, notices);
    expect(byWindow.size).toBe(0);
    expect(unmatched.map((n) => n.title)).toEqual(['Strengthening Ghana Health Service laboratory services', 'BJA…']);
  });
});
