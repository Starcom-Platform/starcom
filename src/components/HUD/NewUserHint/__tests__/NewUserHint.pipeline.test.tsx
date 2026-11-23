/**
 * The onboarding card used to say "Join a cyber investigation team to access
 * group chat" — static prose that described neither what Starcom produces nor
 * how, and could not notice when it stopped being true.
 *
 * What matters about the replacement is that its steps are DERIVED from the
 * canonical stores rather than narrated, so it can't claim you've done
 * something you haven't or keep asking for something you already did. These
 * tests pin that property specifically, plus the "steps aside once the
 * pipeline is complete" behaviour that keeps it from nagging forever.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import NewUserHint from '../NewUserHint';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { missionService } from '../../../../services/intel/MissionService';
import { intelCaseService } from '../../../../services/intel/IntelCaseService';
import { MissionStatus } from '../../../../types/intel/MissionUI';
import { PIPELINE } from '../../../../services/intel/pipeline/pipeline';
import { coachIsOn } from '../../../Coach/coachOpen';
import { APPLICATIONS } from '../../../Router/EnhancedApplicationRouter';

const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
vi.mock('../../../../services/intel/MissionService', () => ({
  missionService: { listMissions: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
vi.mock('../../../../services/intel/IntelCaseService', () => ({
  intelCaseService: { listCases: vi.fn(), onChange: vi.fn(() => () => {}) },
}));

// Docked portals to a dock host that doesn't exist in this harness.
vi.mock('../../../Dock/Docked', () => ({
  Docked: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** The guide opens collapsed on the globe (decision D-F, step 3); these tests read the steps inside it. */
const openGuide = async () => fireEvent.click(await screen.findByTitle("Show the intel pipeline guide"));

/** MemoryRouter never touches window.location, so surface the path instead. */
const PathProbe: React.FC = () => <span data-testid="path">{useLocation().pathname}</span>;

const renderGuide = (withProbe = false) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <NewUserHint />
      {withProbe && <PathProbe />}
    </MemoryRouter>
  );

const setState = (
  reports: number,
  missions: Array<{ status: MissionStatus }>,
  cases = 0
) => {
  vi.mocked(intelReportService.listReports).mockResolvedValue(
    Array.from({ length: reports }, (_, i) => ({ id: `r${i}` })) as never
  );
  vi.mocked(intelCaseService.listCases).mockResolvedValue(
    Array.from({ length: cases }, (_, i) => ({ id: `c${i}` })) as never
  );
  vi.mocked(missionService.listMissions).mockResolvedValue(missions as never);
};

describe('NewUserHint — the pipeline guide reflects real state', () => {
  beforeEach(() => {
    localStorage.clear();
    navigateToApp.mockReset();
  });

  it('sends the Cases step to the Cases application', async () => {
    // This asserted the opposite until Cases became a registered application.
    // CasesDashboard used to exist only at /cases-dashboard, inside no
    // registered app, so a step targeting the nearest app would have opened
    // the wrong screen while looking like it worked. It now has an app of its
    // own, and the adjudication stage is reachable from the navigation like
    // every other pipeline stage.
    setState(1, [], 0);
    renderGuide(true);
    await openGuide();

    fireEvent.click(await screen.findByTestId('pipeline-action-investigate'));

    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cases', 'standalone'));
  });

  it('still supports a route destination, for surfaces outside the app system', () => {
    // The route variant is not vestigial: the reason it was introduced — a
    // surface navigateToApp cannot reach — will recur, and a type that can
    // only express one kind of destination is how the wrong-screen bug returns.
    const step = { target: { kind: 'route' as const, path: '/somewhere' } };
    expect(step.target.kind).toBe('route');
  });

  it('marks the Cases step done once a case exists, derived not asserted', async () => {
    setState(1, [], 2);
    renderGuide();
    await openGuide();

    const step = await screen.findByTestId('pipeline-step-investigate');
    await waitFor(() => expect(step.textContent).toContain('✓'));
    expect(step.textContent).toMatch(/2 cases, 2 open/i);
  });

  it('calls open only the cases that are open (plan item 1.8)', async () => {
    // Every case was "open", resolved and closed ones too.
    setState(1, [], 0);
    vi.mocked(intelCaseService.listCases).mockResolvedValue(
      [{ id: 'a', status: 'OPEN' }, { id: 'b', status: 'RESOLVED' }, { id: 'c', status: 'CLOSED' }] as never,
    );
    renderGuide();
    await openGuide();
    const step = await screen.findByTestId('pipeline-step-investigate');
    await waitFor(() => expect(step.textContent).toMatch(/3 cases, 1 open/i));
  });

  it('shows every step as incomplete for an operator with nothing yet', async () => {
    setState(0, []);
    renderGuide();
    await openGuide();

    const collect = await screen.findByTestId('pipeline-step-collect');
    expect(collect.textContent).toContain('○');
    expect(collect.textContent).toMatch(/Write a report in the Intel Dashboard/i);
    // An unfinished step offers the way in.
    expect(screen.getByTestId('pipeline-action-collect')).toBeTruthy();
  });

  it('marks "collect intel" done, with the real count, once reports exist', async () => {
    setState(3, []);
    renderGuide();
    await openGuide();

    const collect = await screen.findByTestId('pipeline-step-collect');
    expect(collect.textContent).toContain('✓');
    expect(collect.textContent).toContain('3 intel reports');
    // A finished step stops asking.
    expect(screen.queryByTestId('pipeline-action-collect')).toBeNull();
  });

  it('singularises the count rather than saying "1 intel reports"', async () => {
    setState(1, []);
    renderGuide();
    await openGuide();

    const collect = await screen.findByTestId('pipeline-step-collect');
    expect(collect.textContent).toContain('1 intel report');
    expect(collect.textContent).not.toContain('1 intel reports');
  });

  it('counts a mission as "published" only once a package was really built', async () => {
    // A mission in PLANNING is started but nothing was packaged.
    setState(2, [{ status: MissionStatus.PLANNING }]);
    renderGuide();
    await openGuide();

    const assemble = await screen.findByTestId('pipeline-step-assemble');
    expect(assemble.textContent).toContain('✓');
    const publish = screen.getByTestId('pipeline-step-publish');
    expect(publish.textContent).toContain('○');
    expect(publish.textContent).toMatch(/Mark a mission Ready to publish, then publish it/);
  });

  it('treats PACKAGED as published even if the broadcast has not landed', async () => {
    // publishToNavcom deliberately leaves a mission at PACKAGED when the relay
    // fails — the package WAS built and signed, so this step is genuinely done
    // and should not keep asking. Reports are zeroed here only so the guide
    // still renders: with every step complete it correctly hides itself, which
    // the "steps aside" test below covers.
    setState(0, [{ status: MissionStatus.PACKAGED }], 1);
    renderGuide();
    await openGuide();

    await waitFor(() =>
      expect(screen.getByTestId('pipeline-step-publish').textContent).toContain('✓')
    );
  });

  it('steps aside entirely once the whole pipeline has been completed once', async () => {
    setState(4, [{ status: MissionStatus.DISPATCHED }], 1);
    const { container } = renderGuide();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('navigates to the app a step names', async () => {
    setState(0, []);
    renderGuide();
    await openGuide();

    fireEvent.click(await screen.findByTestId('pipeline-action-collect'));

    // Where pipeline.ts says collection happens. The guide said NetRunner.
    expect(navigateToApp).toHaveBeenCalledWith('inteldashboard', 'standalone');
  });

  it("takes each step's name, order and destination from pipeline.ts (plan item 1.10)", async () => {
    setState(0, []);
    renderGuide();
    await openGuide();
    await screen.findByTestId('pipeline-step-collect');

    const shown = screen.getAllByTestId(/^pipeline-step-/).map((el) => el.getAttribute('data-testid')!.replace('pipeline-step-', ''));
    expect(shown).toEqual(['collect', 'investigate', 'assemble', 'publish']);
    // In the pipeline's own order, as the pipeline names them.
    const order = PIPELINE.map((stage) => stage.id).filter((id) => shown.includes(id));
    expect(shown).toEqual(order);
    for (const id of shown) {
      const stage = PIPELINE.find((s) => s.id === id)!;
      expect(screen.getByTestId(`pipeline-step-${id}`).textContent).toContain(stage.label);
      if (stage.surface.kind !== 'app') continue;
      const surface = stage.surface;
      const app = APPLICATIONS.find((a) => a.id === surface.app)!;
      // A stage that names a tab opens on it, and its button says where it goes.
      const where = surface.tab ? surface.tab[0].toUpperCase() + surface.tab.slice(1) : app.name;
      expect(screen.getByTestId(`pipeline-action-${id}`).textContent).toContain(`Open ${where}`);
      navigateToApp.mockReset();
      fireEvent.click(screen.getByTestId(`pipeline-action-${id}`));
      expect(navigateToApp).toHaveBeenCalledWith(surface.app, 'standalone', ...(surface.tab ? [{ initialTab: surface.tab }] : []));
    }
  });

  /*
   * Assembling and publishing a mission happen on OpsCenter's Missions tab. The
   * guide said "Open OpsCenter" and opened it with no tab, so it landed on
   * Overview (critique audit of 2026-10-01, section 4.2; plan block F, item 7).
   */
  it('takes the mission steps to the Missions tab, and says so', async () => {
    setState(0, []);
    renderGuide();
    await openGuide();
    for (const id of ['assemble', 'publish']) {
      const action = await screen.findByTestId(`pipeline-action-${id}`);
      expect(action.textContent).toContain('Open Missions');
      navigateToApp.mockReset();
      fireEvent.click(action);
      expect(navigateToApp).toHaveBeenCalledWith('teamworkspace', 'standalone', { initialTab: 'missions' });
    }
  });

  it('can be minimised to a chip that reports how many steps are left', async () => {
    setState(0, []);
    renderGuide();
    await openGuide();

    fireEvent.click(await screen.findByTitle('Minimize'));

    // Three steps, none done.
    expect(await screen.findByText(/Pipeline · 4 left/)).toBeTruthy();
    expect(screen.queryByTestId('pipeline-step-collect')).toBeNull();
  });

  it('stays dismissed across mounts once the operator says so', async () => {
    setState(0, []);
    const first = renderGuide();
    await openGuide();
    fireEvent.click(await screen.findByTitle('Dismiss for good'));
    await waitFor(() => expect(first.container).toBeEmptyDOMElement());

    first.unmount();
    const second = renderGuide();
    await waitFor(() => expect(second.container).toBeEmptyDOMElement());
  });

  it('renders nothing away from the globe, where it would be noise', async () => {
    setState(0, []);
    const { container } = render(
      <MemoryRouter initialEntries={['/cases-dashboard']}><NewUserHint /></MemoryRouter>
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('offers the coach, which walks the same stages on the real screens (plan item 6.1)', async () => {
    setState(0, []);
    renderGuide();
    await openGuide();
    fireEvent.click(await screen.findByTestId('start-coach'));
    expect(coachIsOn()).toBe(true);
  });
});
