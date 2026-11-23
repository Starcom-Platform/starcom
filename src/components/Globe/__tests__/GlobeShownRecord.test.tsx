/**
 * The panel that names the Case or Mission on the globe and says what of it is
 * not drawn.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobeShownRecord } from '../GlobeShownRecord';
import type { ShownRecord } from '../Hooks/useShownRecord';
import type { LinkedRecordPlacement } from '../../../services/intel/globe/linkedRecordPlacement';
import { linkedRecordsNotDrawn, nothingLinked } from '../../../services/epistemic/epistemicLanguage';

const pin = (id: string) => ({
  pubkey: id, title: id, content: '', author: 'a', timestamp: 0, latitude: 1, longitude: 2, tags: [],
});
const CASE = { kind: 'case' as const, id: 'case-1' };
const MISSION = { kind: 'mission' as const, id: 'mission-1' };
const NOTHING = { linkedCount: 0, markers: [], notDrawn: { count: 0, byReason: {} } };

const ready = (
  placement: Partial<LinkedRecordPlacement>,
  over: { target?: typeof CASE | typeof MISSION; label?: string; caseCount?: number } = {},
): ShownRecord => ({
  status: 'ready',
  target: CASE,
  label: 'CASE-0001 · Relay traffic',
  placement: {
    linkedCount: 4,
    markers: [pin('a'), pin('b')],
    notDrawn: { count: 2, byReason: { 'no-coordinates': 1, 'not-found': 1 } },
    cameraTarget: null,
    ...placement,
  },
  ...over,
});

const show = (shown: ShownRecord, onShowAll = vi.fn()) =>
  render(<GlobeShownRecord shown={shown} onShowAll={onShowAll} />);

describe('GlobeShownRecord', () => {
  it('renders nothing when nothing is shown', () => {
    const { container } = show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });

  it('names the case, counts what is drawn, and warns about the rest with its reasons', () => {
    show(ready({}));
    expect(screen.getByRole('region', { name: 'Case shown on the globe' })).toBeTruthy();
    expect(screen.getByText('CASE-0001 · Relay traffic')).toBeTruthy();
    expect(screen.getByText('2 of 4 linked records drawn')).toBeTruthy();
    const warning = screen.getByText(linkedRecordsNotDrawn({ 'no-coordinates': 1, 'not-found': 1 }).text);
    expect(warning.getAttribute('data-tone')).toBe('warn');
  });

  it('adds no warning when every linked record is drawn', () => {
    show(ready({ linkedCount: 2, notDrawn: { count: 0, byReason: {} } }));
    expect(screen.getByText('2 of 2 linked records drawn')).toBeTruthy();
    expect(screen.queryByText(/not drawn/)).toBeNull();
  });

  it('tells a case with nothing linked apart from one whose records could not be drawn', () => {
    show(ready(NOTHING));
    expect(screen.getByText(nothingLinked('case').text)).toBeTruthy();
    expect(screen.queryByText(/0 of 0/)).toBeNull();
  });

  it('names a mission as a mission, and tells a mission whose cases link nothing apart from one with nothing linked', () => {
    const withCases = show(ready(NOTHING, { target: MISSION, label: 'MSN-0001 · Night watch', caseCount: 2 }));
    expect(screen.getByRole('region', { name: 'Mission shown on the globe' })).toBeTruthy();
    expect(screen.getByText(nothingLinked('mission-cases').text)).toBeTruthy();
    withCases.unmount();

    show(ready(NOTHING, { target: MISSION, label: 'MSN-0002 · Empty', caseCount: 0 }));
    expect(screen.getByText(nothingLinked('mission').text)).toBeTruthy();
  });

  it('says a missing record, an unreadable one and one still loading differently, by kind', () => {
    const missing = show({ status: 'missing', target: MISSION });
    expect(screen.getByText('This mission no longer exists, so nothing is drawn for it.')).toBeTruthy();
    missing.unmount();
    const failed = show({ status: 'failed', target: CASE });
    expect(screen.getByText("This case's linked records could not be read, so none are drawn.")).toBeTruthy();
    failed.unmount();
    show({ status: 'loading', target: CASE });
    expect(screen.getByText("Reading this case's linked records…")).toBeTruthy();
  });

  it('goes back to every report', () => {
    const onShowAll = vi.fn();
    show(ready({}), onShowAll);
    fireEvent.click(screen.getByRole('button', { name: 'Show all reports' }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
