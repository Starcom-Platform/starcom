/**
 * A record an upgrade may have made Public is kept or changed from the queue
 * itself (plan item 9.6, decision G3): one list, reviewed once.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AttentionPanel from '../AttentionPanel';

const item = {
  id: 'upgraded-public:case:c-1', subject: 'Harbour cranes', subjectKind: 'unknown', reason: 'made-public-by-upgrade',
  producedBy: 'upgraded-public', caseId: 'c-1', distributionOf: { kind: 'case', id: 'c-1', locked: false },
  firstSeen: '2026-09-09T00:00:00.000Z', lastSeen: '2026-09-09T00:00:00.000Z', severity: 0.6, state: 'new',
  explanation: 'This case, made 3 Sep 2026 10:00Z, is Public.', evidenceProvenance: 'unknown',
};
const snapshot = (items: unknown[]) => ({ items, hiddenByBudget: 0, actionableCount: items.length, failures: [], quiet: false }) as never;

describe('AttentionPanel — a record an upgrade may have made Public', () => {
  it('keeps it Public by marking the item resolved', () => {
    const onSetState = vi.fn();
    render(<AttentionPanel snapshot={snapshot([item])} onSetState={onSetState} onSetDistribution={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep Public' }));
    expect(onSetState).toHaveBeenCalledWith('upgraded-public:case:c-1', 'resolved');
  });

  it('changes it to Limited or Private', () => {
    const onSetDistribution = vi.fn();
    render(<AttentionPanel snapshot={snapshot([item])} onSetState={vi.fn()} onSetDistribution={onSetDistribution} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make it Limited' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make it Private' }));
    expect(onSetDistribution.mock.calls).toEqual([[item, 'limited'], [item, 'private']]);
  });

  it('offers no change for a mission whose package is locked, only keeping it and opening it', () => {
    const locked = { ...item, id: 'upgraded-public:mission:m-1', caseId: '', missionId: 'm-1', distributionOf: { kind: 'mission', id: 'm-1', locked: true } };
    render(<AttentionPanel snapshot={snapshot([locked])} onSetState={vi.fn()} onSetDistribution={vi.fn()} onOpenMission={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Keep Public' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open the mission/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make it Limited' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make it Private' })).toBeNull();
  });

  it('says why a change was refused', () => {
    render(<AttentionPanel snapshot={snapshot([item])} onSetState={vi.fn()} onSetDistribution={vi.fn()} itemRefusals={{ [item.id]: 'Not changed, still Public: the case is no longer here' }} />);
    expect(screen.getByRole('alert').textContent).toBe('Not changed, still Public: the case is no longer here');
  });

  it('offers these choices on no other item', () => {
    const other = { ...item, id: 'x', reason: 'requirement-went-stale', distributionOf: undefined };
    render(<AttentionPanel snapshot={snapshot([other])} onSetState={vi.fn()} onSetDistribution={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Keep Public' })).toBeNull();
  });
});
