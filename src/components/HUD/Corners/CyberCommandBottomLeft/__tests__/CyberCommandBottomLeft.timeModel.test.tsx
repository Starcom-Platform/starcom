/**
 * time model: the paused badge shows a window you can read.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): a time
 * shown in a view that spans more than a day carries its date. Measured in the
 * running app on 2026-09-13: paused at 21:24Z, the badge read `09:24Z – 09:24Z`,
 * a 24-hour window shown as two identical times.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { DockHost } from '../../../../Dock/DockHost';
import { TemporalProvider, useTemporalState } from '../../../../../context/TemporalContext';
import CyberCommandBottomLeft from '../CyberCommandBottomLeft';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

/** The badge's window, as its start and end. */
const windowEnds = () => {
  const badge = document.querySelector('[data-testid="globe-temporal-position"]');
  const text = badge?.children[1]?.textContent ?? '';
  return text.split(/\s[–-]\s/);
};

const pauseAt = (iso: string) => {
  render(
    <DockHost>
      <TemporalProvider>
        <CyberCommandBottomLeft />
        <Handle />
      </TemporalProvider>
    </DockHost>,
  );
  act(() => temporal!.setCurrentTime(Date.parse(iso)));
};

describe('time model: CyberCommandBottomLeft', () => {
  beforeEach(() => {
    localStorage.clear();
    temporal = null;
  });

  it('D-E: shows where a window spanning days starts and ends', () => {
    pauseAt('2026-07-27T21:24:00Z');
    const [start, end] = windowEnds();
    expect(start).toBeTruthy();
    expect(start).not.toBe(end);
  });
});
