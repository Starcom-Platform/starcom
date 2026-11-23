import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { FindingAttestation } from '../../../../services/intel/findings/attestation';

const state = vi.hoisted(() => ({
  register: [] as FindingAttestation[],
  psc: [] as FindingAttestation[],
  registerCalls: 0,
  pscCalls: 0,
}));
vi.mock('../../../../services/intel/structural/registerSource', () => ({
  loadStructuralFindings: () => { state.registerCalls++; return Promise.resolve(state.register); },
}));
vi.mock('../../../../services/intel/structural/pscSource', () => ({
  loadControlFindings: () => { state.pscCalls++; return Promise.resolve(state.psc); },
}));

/** The panel loads on first expand, so every assertion has to open it. */
const open = () => fireEvent.click(screen.getByText('Register structure'));

// "Queued" is what the outbox holds (plan item 9.4): a real outbox, in memory.
vi.mock('../../../../services/intel/outbox/PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/intel/outbox/PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../../../../services/intel/outbox/OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import StructuralFindingsPanel from '../StructuralFindingsPanel';
import { publishOutbox } from '../../../../services/intel/outbox/PublishOutbox';
import { signFinding } from '../../../../services/intel/findings/signFinding';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const finding = (over: Partial<FindingAttestation['claim']> = {}, snapshot = '2026-08-01'): FindingAttestation => ({
  schemaVersion: 2,
  claim: { subjectRef: '124 CITY ROAD, EC1V 2NX', subjectKind: 'place', attribute: 'companiesAtRegisteredAddress', value: 17948, ...over },
  method: {
    algorithm: 'address-enumeration', algorithmVersion: 1,
    parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
    sourceCount: 1,
    enumeratedBoundary: 'Every company in EC1V, complete snapshot 2026-08-01 (all 7 parts).',
    observedFrom: `${snapshot}T00:00:00.000Z`, observedTo: `${snapshot}T00:00:00.000Z`,
    timePrecisionMs: 86_400_000, criteria: 'counted from a complete enumeration',
  },
  publishedAt: '2026-08-22T00:00:00.000Z',
});

describe('StructuralFindingsPanel', () => {
  beforeEach(() => { state.register = []; state.psc = []; state.registerCalls = 0; state.pscCalls = 0; });

  it('does NOT fetch ~9MB of registers until asked to', () => {
    // Eager loading made every visitor pay for an analysis most never open,
    // and the bundle budget cannot see it — it measures the entry script
    // graph, and these are runtime fetches.
    render(<StructuralFindingsPanel />);

    expect(state.registerCalls).toBe(0);
    expect(state.pscCalls).toBe(0);
  });

  it('fetches once on first expand, and not again on the second', () => {
    render(<StructuralFindingsPanel />);
    open();
    open();
    open();

    expect(state.registerCalls).toBe(1);
    expect(state.pscCalls).toBe(1);
  });

  it('distinguishes an unread register from an empty one', async () => {
    // The same blank box otherwise, and a reader cannot tell which happened.
    render(<StructuralFindingsPanel />);
    open();

    expect(await screen.findByText(/No structural findings/)).toBeTruthy();
  });

  it('renders a batch claim as a date and a count, not "[object Object]"', async () => {
    // The claim model types `value` as unknown because what a claim asserts
    // varies. A renderer assuming scalar shipped "[object Object] companies".
    state.register = [finding({ attribute: 'largestSameDayIncorporationBatch', value: { date: '2025-07-18', count: 19 } })];

    render(<StructuralFindingsPanel />);
    open();

    expect(await screen.findByText(/19 companies on 2025-07-18/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('[object Object]');
  });

  it('shows both assets, and one failing does not suppress the other', async () => {
    state.register = [finding()];
    state.psc = [finding({ subjectRef: '07168188', subjectKind: 'organization', attribute: 'companiesControlledAsCorporatePsc', value: 2823 })];

    render(<StructuralFindingsPanel />);
    open();

    expect(await screen.findByText(/17948 companies/)).toBeTruthy();
    expect(await screen.findByText(/2823 companies/)).toBeTruthy();
  });

  it('SAYS SO when it shows fewer findings than it has', async () => {
    // A shorter list that does not admit it is shorter is a false claim about
    // how much was found. The PSC register really does yield thousands.
    state.psc = Array.from({ length: 120 }, (_, i) =>
      finding({ subjectRef: `0716818${i}`, subjectKind: 'organization', attribute: 'companiesControlledAsCorporatePsc', value: 1000 - i }));

    render(<StructuralFindingsPanel />);
    open();

    expect(await screen.findByText(/not\s+shown/)).toBeTruthy();
    expect(screen.getByText(/of 120 findings/)).toBeTruthy();
  });

  it('shows the LARGEST findings, not the ones from the newest snapshot', async () => {
    /**
     * Weight is a trust measure and every one of these is a complete census,
     * so weight only distinguishes snapshot dates. Ordering by it showed fifty
     * Norwegian addresses whose largest census was 660 while hiding the
     * largest in the corpus — 86,035 companies at one London address — because
     * its register had been snapshotted three weeks earlier.
     */
    state.register = [
      // The big one, from the STALER snapshot: lower weight, far larger.
      finding({ subjectRef: 'THE BIG ONE', value: 86035 }, '2026-08-01'),
      ...Array.from({ length: 60 }, (_, i) =>
        finding({ subjectRef: `SMALL ${i}`, value: 100 + i }, '2026-08-22')),
    ];

    render(<StructuralFindingsPanel />);
    open();

    expect(await screen.findByText(/86035 companies/)).toBeTruthy();
  });

  it('gives each kind of claim its own room, so one cannot crowd out the rest', async () => {
    // Magnitudes are not comparable across shapes: 86,035 companies at an
    // address and 17 foreign-parented holders are both large for what they are.
    state.register = Array.from({ length: 60 }, (_, i) =>
      finding({ subjectRef: `ADDR ${i}`, value: 5000 + i }));
    state.psc = [finding({
      subjectRef: '07168188', subjectKind: 'organization',
      attribute: 'companiesControlledAsCorporatePsc', value: 12,
    })];

    render(<StructuralFindingsPanel />);
    open();

    // The single small PSC finding survives against sixty much larger ones.
    expect(await screen.findByText(/12 companies/)).toBeTruthy();
  });

  it('states up front that individuals are never counted', async () => {
    state.register = [finding()];
    render(<StructuralFindingsPanel />);
    expect(await screen.findByText(/Individuals are never counted/)).toBeTruthy();
  });

  it('reads "Queued" for a finding waiting in the outbox, as it does after a reload (plan item 9.4)', async () => {
    state.register = [finding()];
    await publishOutbox.enqueue(signFinding(finding() as never, ml_dsa65.keygen().secretKey));
    render(<StructuralFindingsPanel />);
    open();
    expect(await screen.findByText('Queued — not yet public')).toBeTruthy();
  });
});
