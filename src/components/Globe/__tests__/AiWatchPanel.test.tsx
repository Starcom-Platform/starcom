/**
 * AI Watch's panel (decision D-AW, AW3 and AW4): every note in the sections on, by section, the ones
 * naming no place among them, each with its stance as a shape and a word, its headline linked to its
 * source, and where it is drawn.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { readAiWatchNote, type AiWatchItem } from '../../../services/aiWatch/aiWatch';
import { AiWatchPanel } from '../AiWatchPanel';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/ai-watch/terminator_watch_live_2026-10-12.json'), 'utf8'));
const NOTES = LIVE.map((e) => readAiWatchNote(e)).filter((r): r is AiWatchItem & { retracted: boolean } => !('refused' in r));
const ALL = { AiIncidents: true, AiFrontier: true, AiWar: true, AiSafety: true };
const status = { loaded: true, error: null };

describe('AiWatchPanel', () => {
  it('lists every note by section, the unplaced among them', () => {
    render(<AiWatchPanel notes={NOTES} active={ALL} drawnAt={new Map()} status={status} />);
    expect(within(screen.getByTestId('ai-watch-section-AiFrontier')).getAllByTestId('ai-watch-note')).toHaveLength(16);
    expect(within(screen.getByTestId('ai-watch-section-AiIncidents')).getAllByTestId('ai-watch-note')).toHaveLength(12);
    expect(screen.getAllByTestId('ai-watch-drawn-at').every((el) => el.textContent === 'Names no place: listed here only')).toBe(true);
  });

  it("says each note's stance as a shape and a word, and links its headline to its source (AW4)", () => {
    const qbit = NOTES.find((n) => n.source === 'qbitai')!;
    render(<AiWatchPanel notes={[qbit]} active={ALL} drawnAt={new Map([[qbit.id, 'India']])} status={status} />);
    expect(screen.getByTestId('ai-watch-stance').textContent).toBe('◆ ugly');
    expect(screen.getByRole('link', { name: qbit.title }).getAttribute('href')).toBe(qbit.url);
    expect(screen.getByText(/QbitAI \(量子位\) \(China\) · 12 Oct 2026/)).toBeTruthy();
    expect(screen.getByTestId('ai-watch-drawn-at').textContent).toBe('On the globe: India');
  });

  it('shows only the sections on', () => {
    render(<AiWatchPanel notes={NOTES} active={{ ...ALL, AiFrontier: false }} drawnAt={new Map()} status={status} />);
    expect(screen.queryByTestId('ai-watch-section-AiFrontier')).toBeNull();
  });

  it('says when The Record could not be read', () => {
    render(<AiWatchPanel notes={[]} active={ALL} drawnAt={new Map()} status={{ loaded: false, error: 'The Record could not be read: connection failed' }} />);
    expect(screen.getByRole('status').textContent).toBe('The Record could not be read: connection failed');
  });
});
