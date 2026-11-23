/**
 * Handing a case or a mission to someone as a file, and taking one in (plan
 * item 2.4, slice c). The bundle services are stand-ins here;
 * bundleRoundTrip.test.ts carries a real one between two workspaces.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const makeBundleOf = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/intel/bundles/collectBundle', () => ({ makeBundleOf }));
const readBundle = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/exchange/bundle', () => ({ readBundle }));
const importing = vi.hoisted(() => ({ previewImport: vi.fn(), applyImport: vi.fn(), previewCopy: vi.fn(), applyCopy: vi.fn() }));
vi.mock('../../../../services/intel/bundles/importBundle', () => importing);
const openWorkCopy = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/intel/copy/workCopy', () => ({ COPY_FORMAT: 'starcom.copy', openWorkCopy, makeWorkCopy: vi.fn() }));
const reviewBundleSend = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/publishing/bundles', () => ({ reviewBundleSend }));
const inbox = vi.hoisted(() => ({ inboxSize: vi.fn(), receivedBundles: vi.fn(), dismissBundle: vi.fn(), subscribeInbox: vi.fn(() => () => {}) }));
vi.mock('../../../../services/intel/bundles/bundleInbox', () => inbox);

import BundleExportButton from '../BundleExportButton';
import ImportBundleDialog from '../ImportBundleDialog';
import { jobs } from '../../../../services/jobs/jobRegistry';
import ReceivedFromLine from '../ReceivedFromLine';
import SendBundleButton from '../SendBundleButton';
import ReceivedBundlesButton from '../ReceivedBundlesButton';
import { realTimeTeamService } from '../../../../services/RealTimeTeamService';
import { nip19 } from 'nostr-tools';

const PRIYA = 'c'.repeat(64);
const opened = { from: PRIYA, fromName: 'Priya', madeAt: '2026-09-27T14:00:00.000Z', subject: { type: 'case', id: 'intelcase-1', title: 'Night loading at berth 4', number: 'CASE-2026-77QX-B342' }, envelopes: [], links: [], absent: [], withheld: [] };
const preview = {
  from: PRIYA, fromName: 'Priya', madeAt: opened.madeAt, subject: opened.subject,
  rows: [
    { type: 'case', id: 'intelcase-1', title: 'Night loading at berth 4', number: 'CASE-2026-77QX-B342', action: 'add' },
    { type: 'report', id: 'intel-1', title: 'Berth 4 cranes at night', action: 'update', note: 'Their copy is newer than yours.' },
    { type: 'report', id: 'intel-2', title: 'Berth 4 idle at 03:00', action: 'keep', note: 'Yours is newer here.' },
  ],
  absent: [{ from: 'intelcase-1', to: 'intelcase-elsewhere', rel: 'related-case' }],
  withheld: [] as Array<{ type: string; id: string }>,
};

const chooseFile = (text: string) => {
  const input = screen.getByLabelText(/^(Bundle file|Copy of your work)/) as HTMLInputElement;
  const file = new File([text], 'CASE-2026-77QX-B342.starcom-bundle.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(input, { target: { files: [file] } });
};

beforeEach(() => {
  [makeBundleOf, readBundle, importing.previewImport, importing.applyImport, importing.previewCopy, importing.applyCopy, openWorkCopy, reviewBundleSend, inbox.inboxSize, inbox.receivedBundles, inbox.dismissBundle].forEach((f) => f.mockReset());
  vi.restoreAllMocks();
  inbox.inboxSize.mockResolvedValue(0);
  readBundle.mockResolvedValue({ bundle: opened });
  importing.previewImport.mockReturnValue(preview);
  importing.applyImport.mockResolvedValue({ added: 1, updated: 1, kept: 1 });
});

describe('Export as file', () => {
  it('bundles the record, signed, and saves it under its number', async () => {
    makeBundleOf.mockResolvedValue({ file: { format: 'starcom.bundle', version: 1 }, withheld: [] });
    const created = vi.fn(() => 'blob:bundle');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-2026-77QX-B342" distribution="limited" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(makeBundleOf).toHaveBeenCalledWith({ type: 'case', id: 'intelcase-1' });
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).download).toBe('CASE-2026-77QX-B342.starcom-bundle.json');
    expect(screen.getByRole('button', { name: 'Export as file' }).getAttribute('title')).toMatch(/not encrypted/);
  });

  it('says why when it cannot bundle, and saves nothing', async () => {
    makeBundleOf.mockRejectedValue(new Error('"Night loading" is protected, and its description cannot be read on this machine.'));
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-2026-77QX-B342" distribution="limited" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be read on this machine/);
  });

  // Plan item 9.13: export follows the same rule as sending.
  it('refuses a Private case in words, and saves nothing', async () => {
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-2026-77QX-B342" distribution="private" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This case is Private: it stays in this workspace, and is never sent or exported to anyone else. To hand it on, change who may receive it first. To keep a copy for yourself, use Export all my work under Your key.',
    );
    expect(makeBundleOf).not.toHaveBeenCalled();
  });

  it('asks who may receive an undecided case first, keeps the choice, and then saves the file', async () => {
    makeBundleOf.mockResolvedValue({ file: { format: 'starcom.bundle', version: 1 }, withheld: [] });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:bundle'), revokeObjectURL: vi.fn() });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const choose = vi.fn(async () => {});
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-2026-77QX-B342" distribution={undefined} onChooseDistribution={choose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    const asking = await screen.findByTestId('export-bundle-ask');
    expect(makeBundleOf).not.toHaveBeenCalled();
    fireEvent.click(within(asking).getByLabelText(/^Limited/));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(choose).toHaveBeenCalledWith('limited');
    expect(makeBundleOf).toHaveBeenCalledWith({ type: 'case', id: 'intelcase-1' });
  });

  it('exports nothing when the choice is Private, and says it stays here', async () => {
    const choose = vi.fn(async () => {});
    render(<BundleExportButton subject={{ type: 'mission', id: 'mission-1' }} number="MSN-1" distribution={undefined} onChooseDistribution={choose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    fireEvent.click(within(await screen.findByTestId('export-bundle-ask')).getByLabelText(/^Private/));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^This mission is Private: it stays in this workspace/);
    expect(choose).toHaveBeenCalledWith('private');
    expect(makeBundleOf).not.toHaveBeenCalled();
  });

  it('says when the choice could not be kept, and saves nothing', async () => {
    const choose = vi.fn(async () => { throw new Error('the change did not save'); });
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-1" distribution={undefined} onChooseDistribution={choose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    fireEvent.click(within(await screen.findByTestId('export-bundle-ask')).getByLabelText(/^Limited/));
    expect((await screen.findByRole('alert')).textContent).toBe('Who may receive it was not saved: the change did not save');
    expect(makeBundleOf).not.toHaveBeenCalled();
  });

  it('says which Private records stayed out of the file', async () => {
    makeBundleOf.mockResolvedValue({
      file: { format: 'starcom.bundle', version: 1 },
      withheld: [{ type: 'report', id: 'intel-2', title: 'Berth 4 idle at 03:00' }, { type: 'item', id: 'intelitem-9', title: 'Informant photo' }],
    });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:bundle'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<BundleExportButton subject={{ type: 'case', id: 'intelcase-1' }} number="CASE-1" distribution="public" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export as file' }));
    expect((await screen.findByTestId('export-bundle-stays')).textContent).toBe(
      'Saved. 2 Private records stay here, and are not in the file: report "Berth 4 idle at 03:00", intel item "Informant photo".',
    );
  });
});

describe('Import a bundle', () => {
  it('shows who sent it and what would happen to each record, before importing anything', async () => {
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.bundle"}');
    const table = await screen.findByTestId('bundle-preview');
    expect(screen.getByTestId('bundle-from').textContent).toMatch(/Priya/);
    expect(within(table).getByTestId('bundle-row-intelcase-1').textContent).toMatch(/Add.*CASE-2026-77QX-B342.*Night loading at berth 4/s);
    expect(within(table).getByTestId('bundle-row-intel-1').textContent).toMatch(/Update.*newer than yours/s);
    expect(within(table).getByTestId('bundle-row-intel-2').textContent).toMatch(/Keep.*newer here/s);
    expect(screen.getByTestId('bundle-absent').textContent).toMatch(/links to 1 record it does not carry/);
    expect(importing.applyImport).not.toHaveBeenCalled();
  });

  it('imports on the word, says what it did, and then offers to open what arrived', async () => {
    const imported = vi.fn();
    const opens = vi.fn();
    render(<ImportBundleDialog open onClose={() => {}} onImported={imported} onOpen={opens} />);
    chooseFile('{"format":"starcom.bundle"}');
    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 records' }));
    expect((await screen.findByTestId('bundle-imported')).textContent).toMatch(/Added 1, updated 1, kept 1/);
    expect(importing.applyImport).toHaveBeenCalledWith(opened);
    expect(imported).toHaveBeenCalledWith(opened.subject);
    expect(opens).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the case' }));
    expect(opens).toHaveBeenCalledWith(opened.subject);
    // On the job rail while it applied, and done with what it did (BD13).
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'bundle-import', state: 'done', detail: 'added 1, updated 1, kept 1' })]);
    jobs.clearForTest();
  });

  it('says which records its sender kept Private, apart from those still to arrive', async () => {
    importing.previewImport.mockReturnValue({ ...preview, withheld: [{ type: 'report', id: 'intel-ledger' }, { type: 'item', id: 'intelitem-9' }] });
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.bundle"}');
    expect((await screen.findByTestId('bundle-withheld')).textContent).toBe('It cites 2 records its sender keeps Private, which were not sent.');
    expect(screen.getByTestId('bundle-absent').textContent).toMatch(/links to 1 record it does not carry/);
  });

  it('says nothing was kept back when nothing was', async () => {
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.bundle"}');
    await screen.findByTestId('bundle-preview');
    expect(screen.queryByTestId('bundle-withheld')).toBeNull();
  });

  it('offers nothing to import when every copy held is as new', async () => {
    importing.previewImport.mockReturnValue({ ...preview, rows: preview.rows.map((r) => ({ ...r, action: 'keep' })) });
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.bundle"}');
    expect((await screen.findByRole('button', { name: /Nothing to import/ })).hasAttribute('disabled')).toBe(true);
  });

  it('refuses an altered bundle in words, and imports nothing', async () => {
    readBundle.mockResolvedValue({ refused: '"Berth 4 cranes at night" was changed after the bundle was signed. Ask for it again.' });
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.bundle"}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/changed after the bundle was signed/);
    expect(screen.queryByTestId('bundle-preview')).toBeNull();
  });

  it('says a file that is not JSON is not a bundle', async () => {
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('this is not json');
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a Starcom bundle/);
    expect(readBundle).not.toHaveBeenCalled();
  });
});

describe('A copy of your own work (plan item 9.13b)', () => {
  const copy = { owner: PRIYA, madeAt: '2026-09-30T08:00:00.000Z', envelopes: [] };

  it('opens a copy sealed to your key, and imports it without calling it received', async () => {
    openWorkCopy.mockResolvedValue({ copy });
    importing.previewCopy.mockReturnValue({ owner: PRIYA, madeAt: copy.madeAt, rows: preview.rows });
    importing.applyCopy.mockResolvedValue({ added: 2, updated: 0, kept: 1 });
    render(<ImportBundleDialog open onClose={() => {}} expecting="copy" />);
    expect(screen.getByText('Open a copy of your work')).toBeTruthy();
    chooseFile('{"format":"starcom.copy"}');
    expect((await screen.findByTestId('copy-from')).textContent).toMatch(
      /^A copy of your own work, made 30 Sep 2026.*\. Sealed to your key, and nothing in it was changed since\.$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 records' }));
    expect((await screen.findByTestId('bundle-imported')).textContent).toMatch(/Added 2, updated 0, kept 1/);
    expect(importing.applyCopy).toHaveBeenCalledWith(copy);
    expect(importing.applyImport).not.toHaveBeenCalled();
    expect(readBundle).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Open the/ })).toBeNull();
  });

  it('opens a copy chosen in Import bundle as a copy too', async () => {
    openWorkCopy.mockResolvedValue({ copy });
    importing.previewCopy.mockReturnValue({ owner: PRIYA, madeAt: copy.madeAt, rows: preview.rows });
    render(<ImportBundleDialog open onClose={() => {}} />);
    chooseFile('{"format":"starcom.copy"}');
    expect(await screen.findByTestId('copy-from')).toBeTruthy();
    expect(readBundle).not.toHaveBeenCalled();
  });

  it('says why a copy will not open, and imports nothing', async () => {
    openWorkCopy.mockResolvedValue({ refused: 'This copy is sealed to another key, npub1abcdefghi…uvwxyz. Open it where that key is, or bring that key here under Your key.' });
    render(<ImportBundleDialog open onClose={() => {}} expecting="copy" />);
    chooseFile('{"format":"starcom.copy"}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/sealed to another key/);
    expect(screen.queryByTestId('bundle-preview')).toBeNull();
  });
});

describe('who a record came from', () => {
  it('says so by name and date, and says nothing for a record made here', () => {
    const { rerender } = render(<ReceivedFromLine receivedFrom={{ pubkey: PRIYA, sentAt: '2026-09-27T14:00:00.000Z' }} />);
    expect(screen.getByTestId('received-from').textContent).toMatch(/^From .+, 27 Sep 2026/);
    rerender(<ReceivedFromLine receivedFrom={undefined} />);
    expect(screen.queryByTestId('received-from')).toBeNull();
  });

  it('says when its sender kept records it cites Private', () => {
    const { rerender } = render(<ReceivedFromLine receivedFrom={{ pubkey: PRIYA, sentAt: '2026-09-27T14:00:00.000Z', withheld: ['intel-ledger'] }} />);
    expect(screen.getByTestId('received-from').textContent).toMatch(/27 Sep 2026.*\. It cites 1 record they keep Private, which was not sent\.$/);
    rerender(<ReceivedFromLine receivedFrom={{ pubkey: PRIYA, sentAt: '2026-09-27T14:00:00.000Z', withheld: ['intel-ledger', 'intelitem-9'] }} />);
    expect(screen.getByTestId('received-from').textContent).toMatch(/\. It cites 2 records they keep Private, which were not sent\.$/);
  });
});

describe('Send to…', () => {
  const AISHA = 'b'.repeat(64);
  const CHEN = 'd'.repeat(64);
  beforeEach(() => {
    vi.spyOn(realTimeTeamService, 'getTeams').mockReturnValue([{ id: 't1', name: 'Newark desk', members: [{ pubkey: AISHA }] }] as never);
  });

  it('offers the people on your teams and on the record, and sends through the review to those chosen', async () => {
    reviewBundleSend.mockResolvedValue({ status: 'sent', result: { reached: [AISHA, CHEN], notReached: [] } });
    render(<SendBundleButton subject={{ type: 'case', id: 'intelcase-1' }} people={[CHEN]} distribution="limited" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }));
    const dialog = await screen.findByTestId('send-bundle-dialog');
    fireEvent.click(within(dialog).getByTestId(`send-to-${AISHA}`).querySelector('input')!);
    fireEvent.click(within(dialog).getByTestId(`send-to-${CHEN}`).querySelector('input')!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review and send to 2 people' }));
    expect((await within(dialog).findByTestId('send-bundle-result')).textContent).toMatch(/Sent to 2 people/);
    expect(reviewBundleSend).toHaveBeenCalledWith({ type: 'case', id: 'intelcase-1' }, [AISHA, CHEN]);
  });

  it('takes a pasted npub, and says when what was pasted is not one', async () => {
    reviewBundleSend.mockResolvedValue({ status: 'sent', result: { reached: [CHEN], notReached: [] } });
    render(<SendBundleButton subject={{ type: 'mission', id: 'mission-1' }} distribution="public" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }));
    const dialog = await screen.findByTestId('send-bundle-dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Someone else/), { target: { value: 'npub1nonsense' } });
    expect(within(dialog).getByText('Not an npub or a public key.')).toBeTruthy();
    // A secret key is never taken as someone to send to, and is named for what it is.
    fireEvent.change(within(dialog).getByLabelText(/^Someone else/), { target: { value: nip19.nsecEncode(new Uint8Array(32).fill(7)) } });
    expect(within(dialog).getByText(/That is a secret key/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Someone else/), { target: { value: nip19.npubEncode(CHEN) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review and send to 1 person' }));
    await waitFor(() => expect(reviewBundleSend).toHaveBeenCalledWith({ type: 'mission', id: 'mission-1' }, [CHEN]));
  });

  it('says who was not reached and why, and says a refusal in words', async () => {
    reviewBundleSend.mockResolvedValueOnce({ status: 'sent', result: { reached: [], notReached: [{ pubkey: AISHA, reason: 'No relay took it.' }] } });
    render(<SendBundleButton subject={{ type: 'case', id: 'intelcase-1' }} distribution="limited" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }));
    const dialog = await screen.findByTestId('send-bundle-dialog');
    fireEvent.click(within(dialog).getByTestId(`send-to-${AISHA}`).querySelector('input')!);
    fireEvent.click(within(dialog).getByRole('button', { name: /Review and send/ }));
    expect((await within(dialog).findByTestId('send-bundle-result')).textContent).toMatch(/Not sent to 1: No relay took it/);

    reviewBundleSend.mockResolvedValueOnce({ status: 'refused', reason: 'There is no relay to send it over. Export it as a file instead.' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Review and send/ }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Export it as a file/);
  });
});

describe('Send to… honours distribution (plan item 9.13)', () => {
  const AISHA = 'b'.repeat(64);
  beforeEach(() => {
    vi.spyOn(realTimeTeamService, 'getTeams').mockReturnValue([{ id: 't1', name: 'Newark desk', members: [{ pubkey: AISHA }] }] as never);
  });
  const open = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }));
    return screen.findByTestId('send-bundle-dialog');
  };

  it('says a Private case stays here, and offers nobody to send it to', async () => {
    render(<SendBundleButton subject={{ type: 'case', id: 'intelcase-1' }} distribution="private" />);
    const dialog = await open();
    expect(within(dialog).getByTestId('send-bundle-stays').textContent).toBe(
      'This case is Private: it stays in this workspace, and is never sent or exported to anyone else. To hand it on, change who may receive it first.',
    );
    expect(within(dialog).queryByTestId(`send-to-${AISHA}`)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Review and send/ })).toBeNull();
    expect(reviewBundleSend).not.toHaveBeenCalled();
  });

  it('asks who may receive an undecided case first, keeps the choice, and then offers people', async () => {
    const choose = vi.fn(async () => {});
    const { rerender } = render(<SendBundleButton subject={{ type: 'case', id: 'intelcase-1' }} distribution={undefined} onChooseDistribution={choose} />);
    const dialog = await open();
    const asking = within(dialog).getByTestId('send-bundle-ask');
    expect(within(dialog).queryByTestId(`send-to-${AISHA}`)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Review and send/ })).toBeNull();
    fireEvent.click(within(asking).getByLabelText(/^Limited/));
    await waitFor(() => expect(choose).toHaveBeenCalledWith('limited'));
    rerender(<SendBundleButton subject={{ type: 'case', id: 'intelcase-1' }} distribution="limited" onChooseDistribution={choose} />);
    expect(within(dialog).queryByTestId('send-bundle-ask')).toBeNull();
    expect(within(dialog).getByTestId(`send-to-${AISHA}`)).toBeTruthy();
  });

  it('says when the choice could not be kept', async () => {
    const choose = vi.fn(async () => { throw new Error('This mission is locked from Ready to publish on.'); });
    render(<SendBundleButton subject={{ type: 'mission', id: 'mission-1' }} distribution={undefined} onChooseDistribution={choose} />);
    const dialog = await open();
    fireEvent.click(within(within(dialog).getByTestId('send-bundle-ask')).getByLabelText(/^Public/));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Who may receive it was not saved: This mission is locked from Ready to publish on.');
  });

  it('cannot choose for a mission whose package is locked, and says to move it back to Planning', async () => {
    const choose = vi.fn(async () => {});
    render(<SendBundleButton subject={{ type: 'mission', id: 'mission-1' }} distribution={undefined} onChooseDistribution={choose}
      distributionLocked="Its package is locked, so move it back to Planning to choose." />);
    const dialog = await open();
    const asking = within(dialog).getByTestId('send-bundle-ask');
    expect((within(asking).getByLabelText(/^Limited/) as HTMLInputElement).disabled).toBe(true);
    expect(asking.textContent).toMatch(/Its package is locked, so move it back to Planning to choose\./);
    expect(asking.textContent).not.toMatch(/Choose one\./);
  });
});

describe('Received', () => {
  const ready = { bundleId: 'm1', state: 'ready', sender: PRIYA, bundle: opened, wrapIds: ['w1', 'w2'] };

  it('counts what is waiting without opening it, and opens it on request', async () => {
    inbox.inboxSize.mockResolvedValue(3);
    inbox.receivedBundles.mockResolvedValue({
      bundles: [ready, { bundleId: 'm2', state: 'waiting', sender: PRIYA, have: 1, of: 2, wrapIds: ['w3'] }],
      unreadable: [],
    });
    render(<ReceivedBundlesButton />);
    expect(await screen.findByText('3')).toBeTruthy();
    expect(inbox.receivedBundles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('received-bundles'));
    const dialog = await screen.findByTestId('received-bundles-dialog');
    expect((await within(dialog).findByTestId('received-ready')).textContent).toMatch(/CASE-2026-77QX-B342.*Night loading at berth 4.*From/s);
    expect(within(dialog).getByTestId('received-waiting').textContent).toMatch(/Still arriving: 1 of 2 parts/);
  });

  it('hands a whole one to the import preview, and clears it from the inbox once imported', async () => {
    inbox.receivedBundles.mockResolvedValue({ bundles: [ready], unreadable: [] });
    render(<ReceivedBundlesButton />);
    fireEvent.click(screen.getByTestId('received-bundles'));
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    const importDialog = await screen.findByTestId('import-bundle-dialog');
    expect(within(importDialog).queryByLabelText(/^Bundle file/)).toBeNull();
    expect(within(importDialog).getByTestId('bundle-preview')).toBeTruthy();
    fireEvent.click(within(importDialog).getByRole('button', { name: 'Import 2 records' }));
    await waitFor(() => expect(inbox.dismissBundle).toHaveBeenCalledWith(ready));
    expect(importing.applyImport).toHaveBeenCalledWith(opened);
  });

  it('says what could not be opened, and why', async () => {
    inbox.receivedBundles.mockResolvedValue({ bundles: [], unreadable: ['Your signing extension cannot encrypt (NIP-44), so it cannot seal or open a bundle sent over a relay.'] });
    render(<ReceivedBundlesButton />);
    fireEvent.click(screen.getByTestId('received-bundles'));
    expect((await screen.findByText(/could not be opened/)).textContent).toMatch(/cannot encrypt \(NIP-44\)/);
  });
});
