import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GlobeIntelLayer } from '../../../services/intel/globe/globeIntelLayer';
import type { GlobeIntelMarkersResult } from '../Hooks/useGlobeIntelMarkers';

const state = vi.hoisted(() => ({ value: {} as GlobeIntelMarkersResult }));
vi.mock('../Hooks/useGlobeIntelMarkers', () => ({
  useGlobeIntelMarkers: () => state.value,
}));

// Mocked for the same reason as the markers hook: the real one reads the live
// ingest singleton, and these tests are the specification for the WORDING.
const refused = vi.hoisted(() => ({ value: { count: 0, reasons: {} as Record<string, number> } }));
vi.mock('../Hooks/useRefusedIntel', () => ({
  useRefusedIntel: () => refused.value,
}));

// Same reason again: the real hook reads two live services. The counting it
// does is openWorkOnEvidence, tested directly against that pure function.
const openWork = vi.hoisted(() => ({
  value: { byReportId: new Map<string, number>(), missionsNotDrawn: 0, objectivesNotDrawn: 0 },
}));
vi.mock('../Hooks/useOpenWork', () => ({
  useOpenWork: () => openWork.value,
}));

import { GlobeIntelStatus } from '../GlobeIntelStatus';

const layer = (over: Partial<GlobeIntelLayer> = {}): GlobeIntelLayer => ({
  id: 'intelFindings', version: 1, marks: [{ id: 'm1' } as never], links: [],
  unplaceable: { count: 0, reasons: {} },
  coincidentMarkIds: [],
  provenance: { derivedFrom: 'correlation-engine', algorithmVersion: 1, computedAt: '2026-08-21T00:00:00Z', blindSpots: [] },
  degraded: false, integrity: null, emptyReason: null, truncated: null,
  ...over,
});

const set = (over: Partial<GlobeIntelMarkersResult> & { layer?: GlobeIntelLayer | null }) => {
  const { layer: single, ...rest } = over;
  state.value = {
    markers: [], arcs: [],
    layers: single === null ? [] : [single ?? layer()],
    expiredLayers: [],
    ageMs: 0, stale: false, expired: false, hiddenByTimeWindow: 0,
    ...rest,
  } as GlobeIntelMarkersResult;
};

beforeEach(() => {
  set({});
  refused.value = { count: 0, reasons: {} };
  openWork.value = { byReportId: new Map(), missionsNotDrawn: 0, objectivesNotDrawn: 0 };
});

describe('GlobeIntelStatus', () => {
  it('renders nothing when no analysis has been published', () => {
    set({ layer: null });
    const { container } = render(<GlobeIntelStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is nothing to disclose', () => {
    // The badge's presence must itself be information. A permanent "all good"
    // chip trains people to stop reading this corner of the screen.
    const { container } = render(<GlobeIntelStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many marks were withheld when the budget truncated', () => {
    set({ layer: layer({ truncated: { shown: 5000, total: 12000, budgetOverrun: false } }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/Showing 5000 of 12000 marks/)).toBeInTheDocument();
    expect(screen.getByText(/contradictions never dropped/)).toBeInTheDocument();
  });

  it('reports a budget overrun differently from ordinary truncation', () => {
    set({ layer: layer({ truncated: { shown: 8000, total: 9000, budgetOverrun: true } }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/contradictions only, all kept/)).toBeInTheDocument();
  });

  it('distinguishes withheld-because-expired from found-nothing', () => {
    set({
      layer: null, expired: true, stale: true, ageMs: 3 * 3_600_000,
      expiredLayers: [{ id: 'intelFindings', ageMs: 3 * 3_600_000 }],
    });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/3.0h old/)).toBeInTheDocument();
    expect(screen.getByText(/Not "nothing found"/)).toBeInTheDocument();
  });

  it('names WHICH layer expired, so one stale source does not indict the others', () => {
    set({
      layer: layer(), expired: true,
      expiredLayers: [{ id: 'publishedClaims', ageMs: 5 * 3_600_000 }],
    });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/publishedClaims withheld/)).toBeInTheDocument();
  });

  it('names unplaceable findings and why', () => {
    set({ layer: layer({ unplaceable: { count: 4, reasons: { 'missing or out-of-range coordinates': 4 } } }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/4 findings not drawn — 4 missing or out-of-range coordinates/)).toBeInTheDocument();
  });

  it('warns that a sparse globe during an outage is not a quiet world', () => {
    set({ layer: layer({ degraded: true, provenance: { ...layer().provenance, blindSpots: ['UCDP', 'GDACS'] } }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/UCDP, GDACS unreachable/)).toBeInTheDocument();
  });

  it('discloses fabricated input behind the marks', () => {
    set({ layer: layer({ integrity: { totalObservations: 100, mockCount: 30, realRatio: 0.7 } }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/30% of the input behind these marks is fabricated/)).toBeInTheDocument();
  });

  it('says nothing about integrity when all input is real', () => {
    set({ layer: layer({ integrity: { totalObservations: 100, mockCount: 0, realRatio: 1 } }) });
    const { container } = render(<GlobeIntelStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains an empty globe rather than leaving it ambiguous', () => {
    set({ layer: layer({ marks: [], emptyReason: 'nothing-qualified' }) });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/nothing qualified/)).toBeInTheDocument();
  });

  it('reports marks hidden by the operator time cursor', () => {
    set({ hiddenByTimeWindow: 12 });
    render(<GlobeIntelStatus />);
    expect(screen.getByText(/12 marks outside the current time window/)).toBeInTheDocument();
  });

  it('says what arrived and was not drawn, by cause', () => {
    refused.value = { count: 3, reasons: { 'with no location': 2, 'that could not be read': 1 } };
    render(<GlobeIntelStatus />);
    expect(screen.getByText(
      '3 events arrived and were not drawn — 2 with no location; 1 that could not be read.',
    )).toBeTruthy();
  });

  it('speaks when the globe is empty and events were refused', () => {
    // The one case where an empty globe is actively misleading: somebody
    // published and the silence made it look like nobody had.
    set({ layer: null });
    refused.value = { count: 1, reasons: { 'with no location': 1 } };
    render(<GlobeIntelStatus />);
    expect(screen.getByText('1 event arrived and was not drawn — 1 with no location.')).toBeTruthy();
  });

  it('stays silent when nothing was published and nothing was refused', () => {
    set({ layer: null });
    const { container } = render(<GlobeIntelStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says unclaimed work in terms of the evidence it rests on', () => {
    openWork.value = {
      byReportId: new Map([['r1', 2], ['r2', 1]]),
      missionsNotDrawn: 0, objectivesNotDrawn: 0,
    };
    render(<GlobeIntelStatus />);
    // Never "work here": an objective has no location, and a mission has none
    // either. The evidence is the only thing on this globe with a position.
    expect(screen.getByText('3 open objectives rest on 2 reports drawn here.')).toBeTruthy();
  });

  it('reports work it cannot draw separately, never folded into the visible figure', () => {
    openWork.value = {
      byReportId: new Map([['r1', 2]]),
      missionsNotDrawn: 1, objectivesNotDrawn: 4,
    };
    render(<GlobeIntelStatus />);
    expect(screen.getByText('2 open objectives rest on 1 report drawn here.')).toBeTruthy();
    expect(screen.getByText(
      "4 open objectives in 1 mission aren't linked to a place.",
    )).toBeTruthy();
  });

  it('speaks when the globe is empty and work rests on nothing drawable', () => {
    set({ layer: null });
    openWork.value = { byReportId: new Map(), missionsNotDrawn: 2, objectivesNotDrawn: 5 };
    render(<GlobeIntelStatus />);
    expect(screen.getByText(
      "5 open objectives in 2 missions aren't linked to a place.",
    )).toBeTruthy();
  });

  it('says how many shapes are drawn from a simplified outline', () => {
    const withOutline = (id: string, kept: number, source: number) => ({
      pubkey: id, title: 't', content: '', tags: [], latitude: 1, longitude: 2,
      timestamp: 0, author: 'a',
      outline: { kind: 'polygon' as const, parts: [[[1, 2], [3, 4]]], keptVertices: kept, sourceVertices: source },
    });
    render(<GlobeIntelStatus reportMarkers={[
      withOutline('r1', 64, 900),
      withOutline('r2', 10, 10),
    ] as never} />);
    // A simplified boundary looks exactly like an exact one, so the count is
    // the only thing distinguishing them.
    expect(screen.getByText('1 of 2 shapes drawn from a simplified outline.')).toBeTruthy();
  });

  it('says nothing about outlines when every shape is the shape published', () => {
    const exact = {
      pubkey: 'r1', title: 't', content: '', tags: [], latitude: 1, longitude: 2,
      timestamp: 0, author: 'a',
      outline: { kind: 'polygon' as const, parts: [[[1, 2], [3, 4]]], keptVertices: 10, sourceVertices: 10 },
    };
    render(<GlobeIntelStatus reportMarkers={[exact] as never} />);
    expect(screen.queryByText(/simplified outline/)).toBeNull();
  });

  it('speaks when a simplified shape is all there is to say', () => {
    // The case an end-to-end run found and these tests did not: no findings
    // layer, no refusals, no open work — just a drawn shape that is not the
    // shape published. The default fixture always has a layer, so every other
    // test here passed straight over it.
    set({ layer: null });
    const simplified = {
      pubkey: 'r1', title: 't', content: '', tags: [], latitude: 1, longitude: 2,
      timestamp: 0, author: 'a',
      outline: { kind: 'polygon' as const, parts: [[[1, 2], [3, 4]]], keptVertices: 64, sourceVertices: 121 },
    };
    render(<GlobeIntelStatus reportMarkers={[simplified] as never} />);
    expect(screen.getByText('1 of 1 shape drawn from a simplified outline.')).toBeTruthy();
  });
});

/**
 * A territory named and not drawn.
 *
 * regionMarksFor has produced an `unmatched` list since it was written and
 * nothing read it, so a report whose only stated place was `us-tx` was absent
 * from the globe with no mark, no count and no sentence — which a reader
 * cannot tell apart from nobody having published anything about Texas.
 *
 * It matters because a peer's board states jurisdictions at three depths
 * (`us`, `us-tx`, `us-tx-leander`) and this dataset holds 242 COUNTRIES.
 */
describe('GlobeIntelStatus: jurisdictions with no boundary here', () => {
  beforeEach(() => {
    set({ markers: [], layer: null });
  });

  it('says which ones were named and not drawn', () => {
    render(<GlobeIntelStatus reportMarkers={[]} unmatchedTerritories={['us-tx']} />);
    expect(screen.getByText(/us-tx/)).toBeTruthy();
  });

  it('stays silent when every named territory was drawn', () => {
    // A note that fires on zero trains the reader to ignore the panel.
    render(<GlobeIntelStatus reportMarkers={[]} unmatchedTerritories={[]} />);
    expect(screen.queryByText(/named and not drawn/)).toBeNull();
  });
});
