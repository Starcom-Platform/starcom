/** The one timeline PsiOps and RLSH share (decision D-PW, step 2): drawn from the kit's own fixtures. */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WindowTimeline } from '../WindowTimeline';
import { readWindow } from '../../../services/psiWatch/windowProfile';

const KIT = resolve(__dirname, '../../../services/psiWatch/kit-v0/fixtures');
const fixture = (path: string) => JSON.parse(readFileSync(resolve(KIT, path), 'utf8')).event as { tags: string[][]; created_at: number };
const moon = fixture('psi/psi_sky_event.aspect.moon.json');
const station = fixture('psi/psi_sky_event.station.json');
const MOON = readWindow(moon.tags)!;

describe('WindowTimeline', () => {
  it("names the window's opening, exact moment and end in UTC, and the weight under the cursor", () => {
    render(<WindowTimeline window={MOON} title="Moon and Mars at change (square)" hue="#C2E83A" now={MOON.anchor} cursor={MOON.anchor} />);
    expect(screen.getByRole('slider', { name: 'The window of Moon and Mars at change (square), from 26 Oct 21:10Z to 27 Oct 07:24Z' })).toBeTruthy();
    expect(screen.getByText('Exact').parentElement!.textContent).toBe('Exact 27 Oct 02:18Z');
    expect(screen.getByText('Weight at the cursor: 1.00')).toBeTruthy();
    expect(screen.getByTestId('window-timeline-cursor')).toBeTruthy();
  });

  it('says when the cursor is outside the window, and draws no cursor there', () => {
    render(<WindowTimeline window={MOON} title="Moon and Mars" hue="#C2E83A" now={MOON.from} cursor={MOON.from - 3600} />);
    expect(screen.getByText('The cursor is outside this window.')).toBeTruthy();
    expect(screen.queryByTestId('window-timeline-cursor')).toBeNull();
  });

  it('shows its state and its age', () => {
    render(
      <WindowTimeline window={MOON} title="Moon and Mars" hue="#C2E83A" stateLabel="Ahead" updatedAt={moon.created_at}
        now={moon.created_at + 2 * 3600 + 5} cursor={MOON.from} />,
    );
    expect(screen.getByText('Ahead')).toBeTruthy();
    expect(screen.getByText('Updated 2 hours ago')).toBeTruthy();
  });

  it('draws a station as a band, with no curve and no weight', () => {
    const window = readWindow(station.tags)!;
    render(<WindowTimeline window={window} title="Station" hue="#C2E83A" now={window.anchor} cursor={window.anchor} />);
    expect(screen.getByText('This window has no curve: it is drawn as a band.')).toBeTruthy();
  });

  it('moves the shared cursor by keys, a hundredth of the window at a time, and to either end', () => {
    const onSeek = vi.fn();
    render(<WindowTimeline window={MOON} title="Moon and Mars" hue="#C2E83A" now={MOON.anchor} cursor={MOON.anchor} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(MOON.anchor + Math.round((MOON.until - MOON.from) / 100));
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onSeek).toHaveBeenLastCalledWith(MOON.from);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek).toHaveBeenLastCalledWith(MOON.until);
  });
});
