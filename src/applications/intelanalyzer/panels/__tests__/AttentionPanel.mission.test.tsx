/**
 * An objective given to you opens its mission from the attention queue (plan
 * item 2.5), and names the mission rather than a case it has none of.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AttentionPanel from '../AttentionPanel';

const item = {
  id: 'given-objective:mission-1:o1', subject: 'Photograph the cranes', subjectKind: 'unknown', reason: 'objective-given-to-you',
  producedBy: 'given-objective', caseId: '', missionId: 'mission-1', firstSeen: '2026-09-28T00:00:00Z', lastSeen: '2026-09-28T00:00:00Z',
  severity: 0.5, state: 'new', explanation: 'MSN-2026-A3JV-998A Watch berth 4: "Photograph the cranes" is yours.', evidenceProvenance: 'unknown',
};

describe('AttentionPanel — an objective given to you', () => {
  it('opens its mission, and does not name a case', () => {
    const onOpenMission = vi.fn();
    render(<AttentionPanel snapshot={{ items: [item], hiddenByBudget: 0, actionableCount: 1, failures: [], quiet: false } as never} onSetState={vi.fn()} onOpenMission={onOpenMission} />);
    fireEvent.click(screen.getByRole('button', { name: /Open the mission/ }));
    expect(onOpenMission).toHaveBeenCalledWith('mission-1');
    expect(screen.queryByText(/· case\b/)).toBeNull();
  });
});

describe('AttentionPanel — an ask you took on from a package', () => {
  const ask = {
    ...item, id: 'taken-ask:k:m-1:o-1', reason: 'ask-you-took-on', producedBy: 'taken-ask', missionId: undefined,
    explanation: 'You took this on from "Coastal survey handoff", a package signed by Harbour Watch.',
  };

  it('names no case and no mission, having neither (plan item 2.6)', () => {
    render(<AttentionPanel snapshot={{ items: [ask], hiddenByBudget: 0, actionableCount: 1, failures: [], quiet: false } as never} onSetState={vi.fn()} onOpenMission={vi.fn()} />);
    expect(screen.getByText('ask-you-took-on')).toBeTruthy();
    expect(screen.queryByText(/· case\b/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Open the mission/ })).toBeNull();
  });

  it('still names the case of an item about one', () => {
    const aboutCase = { ...ask, reason: 'requirement-went-stale', caseId: 'case-7' };
    render(<AttentionPanel snapshot={{ items: [aboutCase], hiddenByBudget: 0, actionableCount: 1, failures: [], quiet: false } as never} onSetState={vi.fn()} />);
    expect(screen.getByText('requirement-went-stale · case case-7')).toBeTruthy();
  });
});
