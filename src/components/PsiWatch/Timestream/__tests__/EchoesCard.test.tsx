/**
 * The Echoes card (decision D-PW, PW47, PW53, PW69): a status while the returns are found, then how many there are
 * and how many fall in the set's record; a bar clicked isolates its return and puts the cursor there; All undoes it;
 * Close ends the Echo.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EchoesCard from '../EchoesCard';
import { getEcho, setEcho, useEcho, type Echo } from '../../../../services/psiWatch/timestream/echoes';
import { readEventSet } from '../../../../services/psiWatch/timestream/eventSets';
import type { PsiSkyEvent } from '../../../../services/psiWatch/psiEvents';

const DAY = 86_400_000;
const set = readEventSet({
  set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
  rows: 3, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 11, 31), zones: [],
  t: [Date.UTC(1992, 1, 1) / 1000, DAY / 1000, 60 * DAY / 1000],
})!;
const event = { address: 'sky', title: 'Moon and Mars at change (square)', sky: { class: 'aspect', sub: 'harmonic' }, bodies: ['Moon', 'Mars'], exact: 0 } as unknown as PsiSkyEvent;
const base: Echo = { address: 'w', title: 'Moon and Mars at change (square)', event, beforeMs: DAY, afterMs: DAY, returns: null, isolated: null };
const Shown: React.FC<{ onSeek: (ms: number) => void }> = ({ onSeek }) => {
  const echo = useEcho();
  return echo ? <EchoesCard echo={echo} set={set} setId="quakes" onSeek={onSeek} /> : null;
};

describe('EchoesCard', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); act(() => setEcho(null)); });

  it('says it is finding the returns, then counts them and the ones in the record', () => {
    act(() => setEcho(base));
    render(<Shown onSeek={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Finding its returns');
    act(() => setEcho({ ...base, returns: [Date.UTC(1990, 0, 1), Date.UTC(1992, 1, 2), Date.UTC(1992, 3, 2)] }));
    expect(screen.getByTestId('psi-timestream-echoes').textContent).toContain('3 returns since 1990 · 2 within the record: Earthquakes M5.5+');
  });

  it('isolates the return a bar stands for, seeks it, shows All again, and closes', () => {
    const onSeek = vi.fn();
    act(() => setEcho({ ...base, returns: [Date.UTC(1992, 1, 2), Date.UTC(1992, 3, 2)] }));
    render(<Shown onSeek={onSeek} />);
    const chart = screen.getByTestId('psi-timestream-echoes-chart');
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 48, right: 280, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { fireEvent.click(chart, { clientX: 200 }); });
    expect(getEcho()!.isolated).toBe(Date.UTC(1992, 3, 2));
    expect(onSeek).toHaveBeenLastCalledWith(Date.UTC(1992, 3, 2));
    expect(screen.getByTestId('psi-timestream-echoes-reading').textContent).toContain('Return of');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'All returns' })); });
    expect(getEcho()!.isolated).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    expect(getEcho()).toBeNull();
  });
});
