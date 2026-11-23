/**
 * Collection could not see what investigation had asked for.
 *
 * Verified in a browser before this existed: raise a requirement on a case,
 * open NetRunner, and it appeared nowhere. So what got collected was bounded by
 * what an analyst happened to remember — the ceiling on throughput, and one no
 * amount of faster scanning raises.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { getCases, listReports } = vi.hoisted(() => ({ getCases: vi.fn(), listReports: vi.fn() }));
vi.mock('../../../../../core/intel/adapters/caseManagerAdapter', () => ({ caseManagerAdapter: { getCases } }));
vi.mock('../../../../../services/intel/IntelReportService', () => ({ intelReportService: { listReports } }));

import RequirementsQueue from '../RequirementsQueue';

const requirement = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  question: 'Who registered the staging domain?',
  because: 'decides whether this is the same operator',
  answeredBy: [],
  raisedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('RequirementsQueue', () => {
  beforeEach(() => {
    getCases.mockReset().mockResolvedValue([]);
    listReports.mockReset().mockResolvedValue([]);
  });

  it('shows the question and the decision waiting on it', async () => {
    getCases.mockResolvedValue([{ id: 'c1', title: 'OP-BLACKOUT', requirements: [requirement()] }]);
    render(<RequirementsQueue />);

    expect(await screen.findByText(/Who registered the staging domain/)).toBeInTheDocument();
    // A collector choosing what to chase next needs to know what turns on it.
    expect(screen.getByText(/decides whether this is the same operator/)).toBeInTheDocument();
    expect(screen.getByText(/OP-BLACKOUT/)).toBeInTheDocument();
  });

  it('says "no deadline set" rather than leaving it blank', async () => {
    getCases.mockResolvedValue([{ id: 'c1', title: 'OP', requirements: [requirement()] }]);
    render(<RequirementsQueue />);
    // Absence must not be readable as comfort: no deadline is not plenty of time.
    expect(await screen.findByText(/no deadline set/i)).toBeInTheDocument();
  });

  it('separates what is linked from what actually counts as evidence', async () => {
    getCases.mockResolvedValue([{
      id: 'c1', title: 'OP',
      requirements: [requirement({ answeredBy: ['r1', 'r2'] })],
    }]);
    // Two drafts attached to a question have answered nothing.
    listReports.mockResolvedValue([
      { id: 'r1', status: 'DRAFT' },
      { id: 'r2', status: 'DRAFT' },
    ]);
    render(<RequirementsQueue />);
    expect(await screen.findByText(/0\/2 count as evidence/)).toBeInTheDocument();
  });

  it('renders nothing when nothing is outstanding, since silence is the right size', async () => {
    getCases.mockResolvedValue([{ id: 'c1', title: 'OP', requirements: [] }]);
    const { container } = render(<RequirementsQueue />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when the store cannot be read, rather than claiming nothing is needed', async () => {
    getCases.mockRejectedValue(new Error('store unavailable'));
    const { container } = render(<RequirementsQueue />);
    // An empty queue and an unreadable one are different claims about the work.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
