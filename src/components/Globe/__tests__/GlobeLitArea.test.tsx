/**
 * The area outlined on the globe with no report naming it (BA24): found in the
 * search, or lit by a card about it. Named, with the way to clear it, for as
 * long as it is lit.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlobeLitArea } from '../GlobeLitArea';
import { getLitArea, resetLitAreaForTests, setLitArea } from '../../../features/globe/areas/litArea';

afterEach(() => resetLitAreaForTests());

describe('the area outlined on the globe', () => {
  it('nothing while none is', () => {
    const { container } = render(<GlobeLitArea />);
    expect(container.textContent).toBe('');
  });

  it('named, as a reader would say it, with the way to clear it', () => {
    render(<GlobeLitArea />);
    act(() => setLitArea('union:eu'));
    expect(screen.getByRole('status').textContent).toContain('the European Union');
    fireEvent.click(screen.getByRole('button', { name: 'Clear the outline' }));
    expect(getLitArea()).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('follows what is lit', () => {
    render(<GlobeLitArea />);
    act(() => setLitArea('continent:africa'));
    expect(screen.getByRole('status').textContent).toContain('Africa');
    act(() => setLitArea('zone:sahel'));
    expect(screen.getByRole('status').textContent).toContain('the Sahel');
  });
});
