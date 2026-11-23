/**
 * Which readouts the strip under the header carries on each screen (decision D-F,
 * step 3.4).
 *
 * It carried all fourteen on every screen: a person reading Cases was told the
 * Solana link was up, the chain's block height, the route mode and the auth posture,
 * none of which is about the case in front of them. The ones that bear on no screen
 * move into the status panel the strip opens; these are the ones a screen keeps.
 */
import { describe, it, expect } from 'vitest';
import { signalsForScreen } from '../marqueeSignalsForScreen';
import type { PrimaryMarqueeSignal } from '../usePrimaryMarqueeData';

/** The full set, in the order the strip builds it. */
const ALL: PrimaryMarqueeSignal[] = [
  'timestamp', 'mission-lane', 'presentation-mode', 'network-posture', 'network-telemetry',
  'auth-posture', 'nostr-relays', 'nostr-ingest-counters', 'nostr-throughput-window',
  'geoint-quality-ratio', 'operator-diagnostics', 'intel-workflow-counters',
  'intel-workflow-archive', 'navigation-depth',
].map((id) => ({ id, label: id.toUpperCase(), value: 'x' }));

const idsFor = (app: string | null) => signalsForScreen(app, ALL).map((s) => s.id);

describe('signalsForScreen', () => {
  it('gives the globe the ingest it is drawing, and the time', () => {
    expect(idsFor('cybercommand')).toEqual([
      'timestamp',
      'nostr-relays',
      'nostr-ingest-counters',
      'nostr-throughput-window',
      'geoint-quality-ratio',
    ]);
  });

  it('gives the intel screens their own counters', () => {
    for (const app of ['inteldashboard', 'intelanalyzer', 'intelweb']) {
      expect(idsFor(app), app).toEqual(['timestamp', 'intel-workflow-counters', 'intel-workflow-archive']);
    }
  });

  it('gives the other screens nothing but their title', () => {
    for (const app of ['cases', 'netrunner', 'teamworkspace', 'marketexchange']) {
      expect(idsFor(app), app).toEqual([]);
    }
  });

  it('gives a screen it does not know nothing, rather than guessing', () => {
    expect(idsFor('something-new')).toEqual([]);
    expect(idsFor(null)).toEqual([]);
  });

  it('keeps the strip’s own order, whatever order it names them in', () => {
    const shuffled = [...ALL].reverse();
    expect(signalsForScreen('cybercommand', shuffled).map((s) => s.id)).toEqual([
      'geoint-quality-ratio',
      'nostr-throughput-window',
      'nostr-ingest-counters',
      'nostr-relays',
      'timestamp',
    ]);
  });

  it('names only readouts the strip actually builds', () => {
    // A typo here would silently drop a readout from a screen.
    const known = new Set(ALL.map((s) => s.id));
    for (const app of ['cybercommand', 'inteldashboard', 'intelanalyzer', 'intelweb', 'cases']) {
      for (const id of idsFor(app)) expect(known.has(id), `${app}: ${id}`).toBe(true);
    }
  });
});
