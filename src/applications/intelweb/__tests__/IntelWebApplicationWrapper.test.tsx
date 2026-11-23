/**
 * IntelWebApplicationWrapper now fetches real IntelReportUI records from the
 * canonical services/intel substrate instead of always building a vault out
 * of two hardcoded demo reports. IntelWebApplication itself (graph/sidebars)
 * is mocked out — this test only covers the fetch/map/build/empty-state
 * wiring, not the downstream app's rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const { listReports, onChange, changed } = vi.hoisted(() => {
  const changed: { listener: ((reports: unknown[]) => void) | null } = { listener: null };
  return { listReports: vi.fn(), onChange: vi.fn((listener: (reports: unknown[]) => void) => { changed.listener = listener; return () => { changed.listener = null; }; }), changed };
});

vi.mock('../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports, onChange }
}));

const { navigateToApp } = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

vi.mock('../IntelWebApplication', () => ({
  IntelWebApplication: ({ initialVault, arrivals }: { initialVault?: { fileIndex: Map<string, unknown> }; arrivals?: { count: number; onAdd: () => void } | null }) => (
    <div data-testid="intel-web-app">
      files: {initialVault ? initialVault.fileIndex.size : 0}
      {arrivals && <button type="button" onClick={arrivals.onAdd}>{arrivals.count} arrived</button>}
    </div>
  )
}));

import { IntelWebApplicationWrapper } from '../IntelWebApplicationWrapper';

function makeReport(overrides: Partial<IntelReportUI> = {}): IntelReportUI {
  return {
    id: 'r1',
    title: 'Report One',
    content: 'Body',
    author: 'analyst_001',
    category: 'analysis',
    tags: ['test'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'APPROVED',
    ...overrides
  };
}

describe('IntelWebApplicationWrapper', () => {
  beforeEach(() => {
    listReports.mockReset();
    navigateToApp.mockReset();
  });

  it('builds a real vault from whatever has actually been published, and renders IntelWebApplication', async () => {
    listReports.mockResolvedValue([makeReport({ id: 'r1' }), makeReport({ id: 'r2', title: 'Report Two' })]);

    render(<IntelWebApplicationWrapper />);

    await waitFor(() => expect(screen.getByTestId('intel-web-app')).toBeInTheDocument());
    // Both reports become report/*.md files in the vault — real data flowed through, not fabricated demo content.
    expect(screen.getByTestId('intel-web-app').textContent).toContain('files: 2');
  });

  it('adds what links the reports: here, the country both state (D-IW, step 1)', async () => {
    listReports.mockResolvedValue([
      makeReport({ id: 'r1', jurisdictions: ['ye'] }),
      makeReport({ id: 'r2', title: 'Report Two', jurisdictions: ['ye'] }),
    ]);

    render(<IntelWebApplicationWrapper />);

    await waitFor(() => expect(screen.getByTestId('intel-web-app')).toBeInTheDocument());
    // The two reports and Yemen.
    expect(screen.getByTestId('intel-web-app').textContent).toContain('files: 3');
  });

  it('shows an honest empty state instead of fabricating demo content when nothing has been published yet', async () => {
    listReports.mockResolvedValue([]);

    render(<IntelWebApplicationWrapper />);

    await waitFor(() => expect(screen.getByText(/No intel reports yet/i)).toBeInTheDocument());
    expect(screen.queryByTestId('intel-web-app')).not.toBeInTheDocument();
  });

  it('surfaces a real error rather than silently falling back to demo data', async () => {
    listReports.mockRejectedValue(new Error('substrate unavailable'));

    render(<IntelWebApplicationWrapper />);

    await waitFor(() => expect(screen.getByText(/Error: substrate unavailable/i)).toBeInTheDocument());
  });

  // Plan item 1.5. The empty state said "Publish one from NetRunner, IntelAnalyzer,
  // or the Intel Dashboard" with nothing to press. The vault is built from every
  // local report, drafts included, so writing one is enough, and the words now
  // lead somewhere.
  it('says a written report is enough, and goes where it points', async () => {
    listReports.mockResolvedValue([]);
    render(<IntelWebApplicationWrapper />);

    await waitFor(() => expect(screen.getByText(/No intel reports yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/Publish one/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Write a report' }));
    expect(navigateToApp).toHaveBeenLastCalledWith('inteldashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Collect with NetRunner' }));
    expect(navigateToApp).toHaveBeenLastCalledWith('netrunner');
  });

  /*
   * IW3: reports that arrive while IntelWeb is open are counted, and added when the reader asks, so the
   * layout never moves under them. It read the stored reports once, when it opened.
   */
  describe('reports arriving while it is open', () => {
    it('counts the new ones and adds them when asked', async () => {
      listReports.mockResolvedValue([makeReport({ id: 'r1' }), makeReport({ id: 'r2', title: 'Report Two' })]);
      render(<IntelWebApplicationWrapper />);
      await waitFor(() => expect(screen.getByTestId('intel-web-app')).toHaveTextContent('files: 2'));
      expect(screen.queryByRole('button', { name: /arrived/ })).toBeNull();

      act(() => changed.listener?.([makeReport({ id: 'r1' }), makeReport({ id: 'r2', title: 'Report Two' }), makeReport({ id: 'r3', title: 'Report Three' })]));
      expect(screen.getByRole('button', { name: '1 arrived' })).toBeInTheDocument();
      // Not added until asked.
      expect(screen.getByTestId('intel-web-app')).toHaveTextContent('files: 2');

      fireEvent.click(screen.getByRole('button', { name: '1 arrived' }));
      await waitFor(() => expect(screen.getByTestId('intel-web-app')).toHaveTextContent('files: 3'));
      expect(screen.queryByRole('button', { name: /arrived/ })).toBeNull();
    });

    it('offers them on the empty page too, where IntelWeb opened before any arrived', async () => {
      listReports.mockResolvedValue([]);
      render(<IntelWebApplicationWrapper />);
      await waitFor(() => expect(screen.getByTestId('intelweb-empty')).toBeInTheDocument());
      act(() => changed.listener?.([makeReport({ id: 'r1' }), makeReport({ id: 'r2', title: 'Report Two' })]));
      fireEvent.click(screen.getByRole('button', { name: '2 new notes since this opened · Add them' }));
      await waitFor(() => expect(screen.getByTestId('intel-web-app')).toHaveTextContent('files: 2'));
    });

    it('offers nothing when the same reports are said again', async () => {
      listReports.mockResolvedValue([makeReport({ id: 'r1' })]);
      render(<IntelWebApplicationWrapper />);
      await waitFor(() => expect(screen.getByTestId('intel-web-app')).toBeInTheDocument());
      act(() => changed.listener?.([makeReport({ id: 'r1' })]));
      expect(screen.queryByRole('button', { name: /arrived/ })).toBeNull();
    });
  });
});

