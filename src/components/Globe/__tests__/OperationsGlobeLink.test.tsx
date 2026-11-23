/**
 * A campaign or an operation clicked on the globe opens in Operations (decision D-RS, RS25): the Missions app's tab,
 * the item opened; the note panel does not show it too.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';

const nav = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: (...args: unknown[]) => { nav.calls.push(args); } }),
}));

import { OperationsGlobeLink } from '../OperationsGlobeLink';
import { openGlobeNotes, getGlobeNoteState, closeGlobeNotes } from '../../../features/globe/noteDetail/globeNoteStore';

const note = (id: string) => ({ id, kind: 'Operation', title: 'Count the Geminids', text: '', timeMs: null, sources: [] });

beforeEach(() => { nav.calls.length = 0; closeGlobeNotes(); });

describe('OperationsGlobeLink', () => {
  it('opens an operation in the Missions app\'s Operations tab, and closes the note', () => {
    render(<OperationsGlobeLink />);
    act(() => openGlobeNotes({ heading: 'California', panel: 'operations', notes: [note('30084:b:operation-1')] }));
    expect(nav.calls).toEqual([['teamworkspace', undefined, { initialTab: 'operations', openRoster: '30084:b:operation-1' }]]);
    expect(getGlobeNoteState().open).toBeNull();
  });

  it('leaves every other note to the note panel', () => {
    render(<OperationsGlobeLink />);
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note('n1')] }));
    expect(nav.calls).toEqual([]);
    expect(getGlobeNoteState().open).not.toBeNull();
  });
});
