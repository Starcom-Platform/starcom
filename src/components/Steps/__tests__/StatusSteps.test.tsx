/**
 * The one stepper a report, a case and a mission move through (plan item
 * 1.7): where the record stands, in words, and the moves open from there.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import StatusSteps from '../StatusSteps';

describe('StatusSteps', () => {
  it('says where the record stands and what that means, in words', () => {
    render(<StatusSteps kind="mission" status="PLANNING" onMove={vi.fn()} testId="steps" />);
    const steps = screen.getByTestId('steps');
    expect(within(steps).getByText('Planning').closest('[aria-current="step"]')).not.toBeNull();
    expect(within(steps).getByText('Ready to publish')).toBeTruthy();
    expect(steps.textContent).not.toMatch(/PLANNING|READY_FOR_PACKAGE|Move to/);
  });

  it('on a path of six, names the current step beside what it means, for phones, where the marks are drawn alone', () => {
    render(<StatusSteps kind="mission" status="DISPATCHED" onMove={vi.fn()} testId="steps" />);
    expect(screen.getByTestId('steps').querySelector('[data-compact]')).not.toBeNull();
    expect(screen.getByTestId('steps-current').textContent).toBe('Dispatched. ');
    const css = readFileSync(join(__dirname, '../StatusSteps.module.css'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 600px)'));
    expect(phone).toMatch(/\.stepper\[data-compact\] :global\(\.MuiStepLabel-labelContainer\) \{[^}]*clip-path: inset\(50%\)/);
    expect(phone).toMatch(/\.compactName \{ display: inline; \}/);
    expect(css.slice(0, css.indexOf('@media (max-width: 600px)'))).toMatch(/\.compactName \{ display: none; \}/);
  });

  it('keeps the names under the marks on a shorter path, and names the step once', () => {
    render(<StatusSteps kind="case" status="OPEN" onMove={vi.fn()} testId="steps" />);
    expect(screen.getByTestId('steps').querySelector('[data-compact]')).toBeNull();
    expect(screen.queryByTestId('steps-current')).toBeNull();
  });

  it('offers the moves open from there, and makes the one chosen', () => {
    const onMove = vi.fn();
    render(<StatusSteps kind="report" status="DRAFT" onMove={onMove} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Submit for review', 'Archive']);
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(onMove).toHaveBeenCalledWith('SUBMITTED');
  });

  it('says why a move cannot be made yet, beside it', () => {
    render(<StatusSteps kind="report" status="REVIEWED" onMove={vi.fn()} blocked={{ APPROVED: 'Someone other than its author approves it.' }} />);
    const approve = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByText(/Someone other than its author approves it\./)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Review again' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a status off the way forward for what it is', () => {
    render(<StatusSteps kind="case" status="PENDING" onMove={vi.fn()} />);
    expect(screen.getByText(/On hold/)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Resume work', 'Close']);
  });
});

describe('StatusSteps on a dark panel', () => {
  // The report editor is a dark panel outside any dark theme, and the steps'
  // names came out dark grey on black.
  const luminance = (css: string) => {
    const [r, g, b] = (css.match(/[\d.]+/g) ?? []).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  it('names its steps in a light colour', () => {
    render(<StatusSteps kind="report" status="REVIEWED" onMove={vi.fn()} onDark />);
    const name = screen.getByText('Submitted for review');
    expect(luminance(getComputedStyle(name).color)).toBeGreaterThan(0.6);
  });
});

describe('StatusSteps for a record that skipped a step', () => {
  // A case closed without resolving showed "Resolved" as done: every step
  // before the current one on the way forward was marked passed.
  it('marks done only the steps the record is known to have passed', () => {
    render(<StatusSteps kind="case" status="CLOSED" passed={['NEW', 'OPEN', 'CLOSED']} onMove={vi.fn()} testId="steps" />);
    const done = (name: string) => screen.getByText(name).classList.contains('Mui-completed');
    expect(done('Open')).toBe(true);
    expect(done('Being worked')).toBe(false);
    expect(done('Resolved')).toBe(false);
  });

  it('marks every earlier step done when nothing says otherwise', () => {
    render(<StatusSteps kind="mission" status="READY_FOR_PACKAGE" onMove={vi.fn()} />);
    expect(screen.getByText('Planning').classList.contains('Mui-completed')).toBe(true);
  });
});

// BD24: passed steps a green check, where it stands a cyan ring (selected, not
// a status), the steps ahead hollow grey.
describe('StatusSteps marks', () => {
  const marks = (steps: HTMLElement) => [...steps.querySelectorAll('[data-step]')].map((m) => m.getAttribute('data-step'));

  it('marks each step passed, current or ahead', () => {
    render(<StatusSteps kind="mission" status="READY_FOR_PACKAGE" onMove={vi.fn()} testId="steps" />);
    // Closed is the last step since D-MX MX12.
    expect(marks(screen.getByTestId('steps'))).toEqual(['passed', 'passed', 'current', 'ahead', 'ahead', 'ahead']);
  });

  it('marks a skipped step ahead, not passed', () => {
    render(<StatusSteps kind="case" status="CLOSED" passed={['NEW', 'OPEN', 'CLOSED']} onMove={vi.fn()} testId="steps" />);
    expect(marks(screen.getByTestId('steps'))).toEqual(['passed', 'passed', 'ahead', 'ahead', 'current']);
  });

  it('draws them from the tokens: green, the selected cyan, grey', () => {
    const css = readFileSync(join(__dirname, '..', 'StatusSteps.module.css'), 'utf8');
    const rule = (step: string) => css.match(new RegExp(`\\[data-step='${step}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('passed')).toMatch(/var\(--sc-ok\)/);
    expect(rule('current')).toMatch(/var\(--sc-accent\)/);
    expect(rule('ahead')).toMatch(/var\(--sc-text-muted\)/);
  });
});

