/**
 * "You can still copy the invite" — and now you can.
 *
 * ─── A PROMISE THE INTERFACE MADE AND COULD NOT KEEP ───────────────────────
 *
 * Offline, the modal shows: "Offline: links may need connectivity. You can
 * still copy the invite." There was no way to. Request Access opened the
 * survey in a new window — the one action guaranteed to fail offline — and an
 * "Invite copied" toast, with role="status" and aria-live="polite", sat in the
 * modal with its state never set to true anywhere in the codebase.
 *
 * Found in a triage of handlers built and never wired. It was the only one of
 * those that was unfinished rather than superseded: no clipboard call, no copy
 * button and no onCopy existed anywhere in SupportDrive.
 *
 * ─── WHAT IS DELIBERATELY UNCHANGED ────────────────────────────────────────
 *
 * Online behaviour. Request Access still opens the survey and closes the
 * modal. Only the offline path copies, because that is the path the notice
 * describes and the one where opening a window cannot work.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SupportFunnelRoot from '../SupportFunnelRoot';
import { openSupportFunnel } from '../supportFunnelEvents';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: 'cybercommand', navigateToApp: vi.fn() }),
}));

const SURVEY_URL = 'https://app.formbricks.com/s/cmlhj2oar01rdti011yl3hu2u';

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
};

const openAndRequest = async () => {
  render(<SupportFunnelRoot />);
  act(() => openSupportFunnel());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
  });
};

describe('Request Access, offline', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('VITE_SUPPORT_FUNNEL_ENABLED', 'true');
    writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    open = vi.spyOn(window, 'open').mockReturnValue(null);
    setOnline(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('copies the invite link, as the offline notice says it will', async () => {
    await openAndRequest();
    expect(writeText).toHaveBeenCalledWith(SURVEY_URL);
  });

  it('confirms it, in the live region that was already there', async () => {
    await openAndRequest();
    expect(screen.getByRole('status').textContent).toMatch(/invite copied/i);
  });

  it('does not open a window that cannot load', async () => {
    await openAndRequest();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the modal open, because the confirmation lives inside it', async () => {
    await openAndRequest();
    expect(screen.getByRole('button', { name: /close support modal/i })).toBeTruthy();
  });

  it('does not claim success when the clipboard refuses', async () => {
    // Permission denied, or an insecure context. The toast would be a lie.
    writeText.mockRejectedValueOnce(new Error('denied'));
    await openAndRequest();
    expect(screen.queryByText(/invite copied/i)).toBeNull();
  });
});

describe('Request Access, online — unchanged', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('VITE_SUPPORT_FUNNEL_ENABLED', 'true');
    setOnline(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('still opens the survey rather than copying', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window);

    await openAndRequest();

    expect(open).toHaveBeenCalledWith(SURVEY_URL, '_blank', 'noopener');
    expect(writeText).not.toHaveBeenCalled();
  });
});
