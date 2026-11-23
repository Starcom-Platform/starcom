/**
 * The property is containment; the message is secondary.
 *
 * One of seven application surfaces had any boundary before this. A throw in
 * any of the others replaced the whole tree, nav included, so there was no way
 * back except a reload.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import ApplicationErrorBoundary from '../ApplicationErrorBoundary';

const Exploding: React.FC = () => { throw new Error('adapter blew up'); };

describe('ApplicationErrorBoundary', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('renders children untouched when nothing throws', () => {
    render(<ApplicationErrorBoundary appName="NetRunner"><p>the app</p></ApplicationErrorBoundary>);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it('keeps a failure inside the boundary, leaving siblings alive', () => {
    render(
      <div>
        <ApplicationErrorBoundary appName="NetRunner"><Exploding /></ApplicationErrorBoundary>
        <nav>the navigation bar</nav>
      </div>,
    );
    // The whole point: the way out survives.
    expect(screen.getByText('the navigation bar')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('names the application that failed, not "something went wrong"', () => {
    render(<ApplicationErrorBoundary appName="NetRunner"><Exploding /></ApplicationErrorBoundary>);
    expect(screen.getByText(/NETRUNNER DID NOT START/i)).toBeInTheDocument();
    expect(screen.getByText(/adapter blew up/)).toBeInTheDocument();
  });

  it('says the other applications still work, which is what the operator needs', () => {
    render(<ApplicationErrorBoundary appName="Cases"><Exploding /></ApplicationErrorBoundary>);
    expect(screen.getByText(/Every other application is unaffected/i)).toBeInTheDocument();
  });

  it('a new key gives a fresh boundary, so one bad screen does not poison the next', () => {
    const { rerender } = render(
      <ApplicationErrorBoundary key="netrunner" appName="NetRunner"><Exploding /></ApplicationErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Navigating elsewhere must not inherit the failure. A boundary latches;
    // without the key this would still be showing NetRunner's error.
    rerender(
      <ApplicationErrorBoundary key="cases" appName="Cases"><p>cases loaded</p></ApplicationErrorBoundary>,
    );
    expect(screen.getByText('cases loaded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
