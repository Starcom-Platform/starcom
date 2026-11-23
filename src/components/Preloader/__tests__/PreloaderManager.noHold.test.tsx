/**
 * The splash goes when the page has loaded, with no minimum (plan item 8.3).
 * It held every visit for 2.5 seconds whatever had loaded: a fixed wait made
 * to look like work.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import PreloaderManager from '../PreloaderManager';

describe('PreloaderManager', () => {
  afterEach(() => vi.useRealTimers());

  it('hands over once the document has loaded, after only its fade', () => {
    vi.useFakeTimers();
    render(<PreloaderManager><div>app</div></PreloaderManager>);
    expect(screen.getByTestId('app-preloader')).toBeTruthy();
    // jsdom's document has loaded; the fade is 800 ms.
    act(() => { vi.advanceTimersByTime(850); });
    expect(screen.queryByTestId('app-preloader')).toBeNull();
  });

  it('is given no minimum by the app', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/minimumDisplayTime/);
  });
});
