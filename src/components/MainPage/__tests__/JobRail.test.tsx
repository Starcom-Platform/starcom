/**
 * The job rail (BD13, BD14; interface-upgrade.md, "A job rail"): a tile a job,
 * with its glyph, its name, its state in a word, its queue and its progress;
 * opened, its detail and only the controls its work really has.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { JobRail } from '../JobRail';
import { jobs } from '../../../services/jobs/jobRegistry';

afterEach(() => act(() => jobs.clearForTest()));

describe('JobRail', () => {
  it('shows nothing when nothing runs', () => {
    const { container } = render(<JobRail />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a tile a job, with its glyph, its name and its state in a word', () => {
    render(<JobRail />);
    act(() => { jobs.start({ kind: 'publish', label: 'Publish Mission Package' }); });
    act(() => { jobs.start({ kind: 'findings-publish', label: 'Publishing findings', queued: 3 }); });
    const tiles = screen.getAllByRole('listitem');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].querySelector('svg[data-symbol]')!.getAttribute('data-symbol')).toBe('job:publish');
    expect(within(tiles[0]).getByRole('button').getAttribute('aria-label')).toBe('Publish Mission Package: running');
    expect(tiles[1].textContent).toContain('×3');
  });

  it('draws progress where the job knows it', () => {
    render(<JobRail />);
    act(() => { jobs.start({ kind: 'bundle-import', label: 'Importing' }).update({ progress: { done: 1, total: 4 } }); });
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
  });

  it('opens to its detail and offers only the controls its work has', () => {
    const cancel = vi.fn();
    const hold = vi.fn();
    render(<JobRail />);
    act(() => { jobs.start({ kind: 'findings-publish', label: 'Publishing findings', detail: '3 findings waiting to send', cancel, hold, resume: () => {} }); });
    act(() => { jobs.start({ kind: 'publish', label: 'Publish case position' }); });
    const [outbox, publish] = screen.getAllByRole('listitem');
    fireEvent.click(within(outbox).getByRole('button', { name: /Publishing findings/ }));
    expect(outbox.textContent).toContain('3 findings waiting to send');
    fireEvent.click(within(outbox).getByRole('button', { name: 'Hold' }));
    fireEvent.click(within(outbox).getByRole('button', { name: 'Cancel' }));
    expect(hold).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(within(outbox).queryByRole('button', { name: 'Resume' })).toBeNull();
    fireEvent.click(within(publish).getByRole('button', { name: /Publish case position/ }));
    expect(within(publish).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(publish).queryByRole('button', { name: 'Hold' })).toBeNull();
  });

  it('offers Resume and not Hold while a job is held', () => {
    render(<JobRail />);
    act(() => { jobs.start({ kind: 'findings-publish', label: 'Publishing findings', hold: () => {}, resume: () => {} }).update({ state: 'held' }); });
    fireEvent.click(screen.getByRole('button', { name: 'Publishing findings: held' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull();
  });

  it('says how a job ended', () => {
    render(<JobRail />);
    act(() => { jobs.start({ kind: 'publish', label: 'Publish finding' }).fail('no relay took it'); });
    expect(screen.getByRole('button', { name: 'Publish finding: failed' })).toBeTruthy();
  });
});
