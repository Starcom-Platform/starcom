/**
 * What the receiver shows for packages other nodes published.
 *
 * The behaviour under test is mostly about NOT overstating things: a
 * publisher's chosen author string must not be rendered as its identity, and a
 * publisher's stated time must not be rendered as the moment this node saw it.
 * Both are easy to get wrong in a way that looks fine, so each is pinned.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';

const { navigateToApp } = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
// NavCom's labels are read from relays; none are reached from here.
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));
// Showing a package on the globe is covered in ReceivedPackagesPanel.globe.test.tsx.
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
// Reviews read relays; none are reached from here.
const reviewsAsked = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({
  fetchReviews: async (target: unknown) => { reviewsAsked.push(target); return []; },
}));
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';
import { takenAsks } from '../../../../services/intel/received/takenAsks';
import { takenMissions } from '../../../../services/intel/received/takenMissions';
import { forgetNames, learnName } from '../../../../services/identity/names';

const SIGNER = 'b778a0d16f78f237bedca54c1a65f893bf0192de4ee5b8530011223344556677';

const manifest = (over: Partial<PackageManifest> = {}): PackageManifest => ({
  id: 'pkg-1',
  name: 'Coastal survey handoff',
  version: '1.0.0',
  description: 'Two objectives, no linked report content.',
  visibility: 'public',
  createdAt: '2026-07-27T21:24:00.000Z',
  author: 'Navcom',
  license: 'CC-BY-4.0' as PackageManifest['license'],
  reports: [{ id: 'r-1', title: 'Objective summary', checksum: 'abc' }],
  intel: [],
  assets: [],
  metadata: { missionNumber: 'MSN-2026-0001', relatedReportCount: 3 },
  ...over,
});

const accepted = (over: Partial<PackageManifest> = {}, id = 'evt-1'): AcceptedPackage => ({
  event: { id, pubkey: SIGNER, created_at: 1, kind: 30079, tags: [], content: '', sig: '' } as AcceptedPackage['event'],
  check: { ok: true, manifest: manifest(over) },
  relay: 'wss://record.cosmiccodex.app',
});

const received = (over: Partial<ReceivedPackages> = {}): ReceivedPackages => ({
  accepted: [accepted()],
  refused: [],
  counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
  publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
  ...over,
});

const ASKS: PackageManifest['objectives'] = [
  { id: 'o-1', ask: 'Photograph the cranes at berth 4', handsBack: 'three photos', effortMinutes: 30, for: 'the harbour desk', limits: ['stay outside the fence'], done: false },
  { id: 'o-2', ask: 'Count the containers', done: true },
];

beforeEach(() => { takenAsks.reset(); takenMissions.reset(); });

describe('ReceivedPackagesPanel', () => {
  it('renders nothing when the network has been quiet', () => {
    const { container } = render(
      <ReceivedPackagesPanel
        received={received({
          accepted: [], publishers: [],
          counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} },
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each verified package by name, not just a count', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    expect(screen.getByTestId('received-packages')).toBeTruthy();
    const rows = screen.getAllByTestId('received-package-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Coastal survey handoff')).toBeTruthy();
  });

  // The one chip every screen draws (BD18), as the package states it. One that
  // states nothing says so in words: "undecided" is a choice nobody here made,
  // not something a publisher left out.
  // A card draws no chip for Public, which nearly every received mission states (D-MF, MF1); its details do.
  it('draws a Public distribution in its details, not on its card', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    const row = screen.getAllByTestId('received-package-row')[0];
    expect(within(row).queryByTestId('distribution-chip')).toBeNull();
    fireEvent.click(within(row).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    fireEvent.click(within(detail).getByRole('button', { name: 'Details' }));
    const field = within(detail).getByText('Distribution').parentElement!;
    expect(within(field).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('public');
  });

  // MF6: a package not marked Public, limited, private or stating none, is not drawn; it is counted.
  it('never shows a package not marked Public, and counts it', () => {
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ visibility: 'limited' }), accepted({ visibility: undefined })] })} />);
    expect(screen.queryByTestId('received-package-row')).toBeNull();
    expect(screen.getByTestId('mission-cards-not-public').textContent).toBe('2 not public, not shown');
  });

  // BD25: who it says it is from, beside the key that signed it, as the frame
  // every record wears. Navcom is a name nobody here has learned a key for yet.
  describe('whose it is', () => {
    beforeEach(() => forgetNames());
    const rowFrame = () => within(screen.getAllByTestId('received-package-row')[0]).getByTestId('provenance-frame');

    it('is unknown while nothing here ties the name it claims to its key', () => {
      render(<ReceivedPackagesPanel received={received()} />);
      expect(rowFrame().getAttribute('data-provenance')).toBe('unknown');
    });

    it("is the signer's when that name is known for the key that signed it", () => {
      learnName(SIGNER, 'Navcom', 'team');
      render(<ReceivedPackagesPanel received={received()} />);
      expect(rowFrame().getAttribute('data-provenance')).toBe('peer');
    });

    it('is an impersonation when that name is known for another key', () => {
      learnName('f'.repeat(64), 'Navcom', 'team');
      render(<ReceivedPackagesPanel received={received()} />);
      expect(rowFrame().getAttribute('data-provenance')).toBe('impersonation');
      expect(rowFrame().getAttribute('title')).toMatch(/^Says it is from Navcom, but .+ signed it\.$/);
    });
  });

  it('names the signing key on the card, because that is the verified fact; the relay is in its details', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    const row = screen.getAllByTestId('received-package-row')[0];
    // As an npub, the form people read and paste (plan item 2.1).
    expect(row.textContent).toContain(nip19.npubEncode(SIGNER).slice(0, 12));
    expect(row.textContent).not.toContain('record.cosmiccodex.app');
    fireEvent.click(within(row).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    fireEvent.click(within(detail).getByRole('button', { name: 'Details' }));
    expect(detail.textContent).toContain('record.cosmiccodex.app');
  });

  it('shows the author as a claim, beside the key that actually signed it', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    fireEvent.click(within(detail).getByRole('button', { name: 'Details' }));
    // The wording is the assertion: an author the publisher chose is what the
    // package SAYS of itself, and must not be printed as its identity.
    expect(within(detail).getByText('Says it is from')).toBeTruthy();
    expect(within(detail).getByText('Navcom')).toBeTruthy();
    expect(within(detail).getByText('Signed by')).toBeTruthy();
    const signer = within(detail).getByTestId('key-name');
    expect(signer.textContent).toContain(nip19.npubEncode(SIGNER).slice(-6));
    expect(signer.getAttribute('title')).toContain(nip19.npubEncode(SIGNER));
  });

  it("calls the publisher's time stated, and claims no arrival time", () => {
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    fireEvent.click(within(detail).getByRole('button', { name: 'Details' }));
    expect(detail.textContent).toContain('stated 27 Jul 2026 21:24Z');
    // The ingest records no arrival time. Printing one would be the Date.now()
    // substitution D-F 15 removed from the globe's intel.
    expect(detail.textContent).not.toMatch(/arrived at|received at/i);
  });

  it('says so when a field the publisher left empty is empty', () => {
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ name: '' })] })} />);
    expect(screen.getByText('no stated name')).toBeTruthy();
  });

  it('lists refusals with their cause, so wholesale refusal is visible', () => {
    render(
      <ReceivedPackagesPanel
        received={received({
          accepted: [],
          refused: [{
            eventId: 'evt-2', pubkey: SIGNER, code: 'bad-manifest-signature',
            reason: 'The manifest signature did not verify.', relay: 'wss://record.cosmiccodex.app',
          }],
          counters: { seen: 1, accepted: 0, refused: 1, refusedBy: { 'bad-manifest-signature': 1 } },
          publishers: [],
        })}
      />,
    );
    const refusals = screen.getByTestId('received-refusals');
    expect(refusals.textContent).toContain('bad manifest signature');
    expect(refusals.textContent).toContain('The manifest signature did not verify.');
    expect(screen.getByTestId('received-nothing-verified').textContent).toContain('nothing from the network verified');
  });

  // It states no distribution, so it is not drawn (MF6), only counted; rendering blanks is not on offer.
  it('counts a package that carried no readable manifest, rather than rendering blanks', () => {
    const noManifest: AcceptedPackage = {
      event: { id: 'evt-3', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [], content: '', sig: '' } as AcceptedPackage['event'],
      check: { ok: true },
      relay: 'wss://record.cosmiccodex.app',
    };
    render(<ReceivedPackagesPanel received={received({ accepted: [noManifest] })} />);
    expect(screen.queryByTestId('received-package-row')).toBeNull();
    expect(screen.getByTestId('mission-cards-not-public').textContent).toBe('1 not public, not shown');
  });

  it('opens a case about a package, carrying who said it and over what', () => {
    navigateToApp.mockClear();
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    fireEvent.click(screen.getByTestId('open-case-about-package'));

    expect(navigateToApp).toHaveBeenCalledTimes(1);
    const [app, , context] = navigateToApp.mock.calls[0];
    expect(app).toBe('cases');
    expect(context.openCaseAbout).toBe('Coastal survey handoff');
    // A case about a foreign record that cannot say which node said it, over
    // which relay, and when, has lost what makes it checkable later.
    expect(context.openCaseNote).toContain(SIGNER);
    expect(context.openCaseNote).toContain('record.cosmiccodex.app');
    expect(context.openCaseNote).toContain('stated 27 Jul 2026');
    expect(context.openCaseNote).toContain('Navcom');
  });

  it('offers no way to accept or import a foreign package', () => {
    // Taking the mission on is your act, kept here apart from your own missions
    // (D-MF, MF7); the package itself is never taken in as a record (plan item 2.6).
    // The omission is the design: what a verified package MEANS here is a
    // trust question the receiver refuses to answer by writing to storage.
    //
    // Enumerated as elements, not matched against textContent. The first
    // version of this test asserted /\bimport\b/ over the concatenated text,
    // where "Open a case about this" + "Import into workspace" reads as
    // "thisImport" — no word boundary, no match, and an Import button added
    // straight through it. Same defeat as the chip assertion in
    // MissionObjectives.test.tsx.
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    const buttons = within(detail).getAllByRole('button').map((b) => b.textContent);
    // Showing it on the globe (plan item 9.14) takes nothing in.
    expect(buttons).toEqual(['Take this mission', 'Details', 'Show what it cites on the globe', 'Show what this key published', 'Open a case about this', 'Close']);
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ objectives: ASKS }, 'evt-asks')] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[1]).getByTestId('mission-card-open'));
    const withAsks = screen.getAllByTestId('received-package-detail').at(-1)!;
    const labels = within(withAsks).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(labels.filter((l) => /accept|import|adopt/i.test(l))).toEqual([]);
  });

  it('lists what the package asks for, with what each hands back, its effort, who it is for and its limits', () => {
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ objectives: ASKS })] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const asks = screen.getAllByTestId('received-ask');
    expect(asks).toHaveLength(2);
    expect(asks[0].textContent).toContain('Photograph the cranes at berth 4');
    expect(asks[0].textContent).toContain('hands back three photos');
    expect(asks[0].textContent).toContain('about 30 min');
    expect(asks[0].textContent).toContain('for the harbour desk');
    expect(asks[0].textContent).toContain('not to: stay outside the fence');
  });

  it('says so when a package asks for nothing', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-package-detail').textContent).toContain('It asks for nothing.');
  });

  // D-MF, MF7–MF10: a mission is taken whole, its limits agreed first, kept here; the asks are its checklist.
  it('takes the mission whole once its limits are agreed, kept on this device', () => {
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ objectives: ASKS })] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    expect(within(detail).queryByRole('button', { name: 'Take this on' })).toBeNull();
    fireEvent.click(within(detail).getByTestId('mission-take-button'));
    expect(screen.getByTestId('mission-take-limits').textContent).toBe('stay outside the fence');
    expect(takenMissions.all()).toEqual([]);
    fireEvent.click(screen.getByTestId('mission-take-agree'));
    expect(takenMissions.all()).toMatchObject([{ signer: SIGNER, packageId: 'pkg-1', limits: 'stay outside the fence', steps: [{ id: 'o-1', ask: 'Photograph the cranes at berth 4', done: false }] }]);
    expect(within(detail).getByTestId('mission-taken').textContent).toMatch(/You took this on .*Its checklist is under Your missions\..*Kept on this device; nobody is told\./);
  });

  it('keeps an ask taken on its own before, and lets it go', () => {
    const pkg = accepted({ objectives: ASKS });
    takenAsks.take({ signer: SIGNER, packageId: 'pkg-1', packageName: pkg.check.manifest!.name, relay: pkg.relay }, ASKS[0], '2026-10-01T09:00:00Z');
    render(<ReceivedPackagesPanel received={received({ accepted: [pkg] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const first = () => screen.getAllByTestId('received-ask')[0];
    expect(first().textContent).toMatch(/You took this on/);
    fireEvent.click(within(first()).getByRole('button', { name: 'Let it go' }));
    expect(takenAsks.all()).toEqual([]);
    expect(within(first()).queryByRole('button')).toBeNull();
  });

  it('offers nothing to take on an ask the sender says is done', () => {
    render(<ReceivedPackagesPanel received={received({ accepted: [accepted({ objectives: ASKS })] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const done = screen.getAllByTestId('received-ask')[1];
    expect(done.textContent).toContain('Done, the sender says');
    expect(within(done).queryByRole('button')).toBeNull();
  });

  it('keeps the raw metadata behind Details', () => {
    render(<ReceivedPackagesPanel received={received()} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    expect(detail.textContent).not.toContain('relatedReportCount');
    const details = within(detail).getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(detail.textContent).toContain('relatedReportCount: 3');
  });

  it('offers reviews of a received package, addressed by where it was published and the version received (plan item 5.1)', async () => {
    const pkg = accepted({}, 'evt-reviewed');
    pkg.event.tags = [['d', 'starcom_mission_package_m9']];
    render(<ReceivedPackagesPanel received={received({ accepted: [pkg] })} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('received-package-reviews')).toBeTruthy();
    expect(reviewsAsked.at(-1)).toEqual({
      kind: 30079, author: SIGNER, coordinate: `30079:${SIGNER}:starcom_mission_package_m9`, eventId: 'evt-reviewed', relay: 'wss://record.cosmiccodex.app',
    });
  });
});
