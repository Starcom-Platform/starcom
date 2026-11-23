/**
 * Hero Watch's panel (decision D-HW, step 6): the week's summary in its own words, relief by country
 * linked to its sources, and what the globe cannot draw, a field mission never without its limits.
 * Text from the notes is text: bold and links, nothing else read as markup.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { FieldMission, ReliefOperation, ReliefPresence, WeekSummary } from '../../../services/heroWatch/heroWatch';
import type { ReliefCountry } from '../../../services/heroWatch/heroWatchRelief';

vi.mock('../../Dock/Docked', () => ({ Docked: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { HeroWatchPanel } from '../HeroWatchPanel';

const base = { pubkey: 'pk', eventId: 'e', createdAt: 1, validFrom: 1, validUntil: 2, content: '' };
const summary: WeekSummary = {
  ...base, id: 's', d: 'hero-watch-2026-w41', kind: 'summary', week: '2026-w41', title: 'Hero Watch: the week to 8 October',
  content: '**Lifeboats**\nRNLI crews launched 135 times. Source: https://data-rnli.opendata.arcgis.com\n— Posted by Mecha Jono, an AI agent.',
};
const op: ReliefOperation = {
  ...base, id: 'op', d: 'hero-watch-appeal-1', kind: 'operation', section: 'Relief', title: 'Ethiopian Red Cross Society: Ethiopia Drought Response',
  source: 'IFRC GO', url: 'https://go.ifrc.org/countries/65', jurisdiction: 'et', appealType: 'DREF', amountChf: 749_972, end: Date.UTC(2027, 3, 1) / 1000,
};
const presence: ReliefPresence = {
  ...base, id: 'pr', d: 'hero-watch-presence-et', kind: 'presence', section: 'Relief', title: '144 organisations respond in Ethiopia, by OCHA\'s count',
  source: 'OCHA, via HDX', url: 'https://data.humdata.org/dataset/ethiopia-operational-presence', license: 'CC BY', jurisdiction: 'et', organisations: 144, sectors: [],
};
const ethiopia: ReliefCountry = { code: 'ET', name: 'Ethiopia', operations: [op], presence };
const unplacedMission: FieldMission = {
  ...base, id: 'fm', d: 'field-public_comment', kind: 'field_mission', section: 'FieldMissions', title: 'Comment on federal rules before they close',
  family: 'public_comment', state: 'open', description: '', validUntil: Date.UTC(2026, 9, 9) / 1000, harmReduction: false,
  objectives: [{ id: 'a', ask: 'Read the rule.', effortMinutes: 20 }, { id: 'b', ask: 'Comment.', effortMinutes: 30 }],
  limits: 'Write in your own words: agencies discount identical form letters.',
};

describe('HeroWatchPanel', () => {
  it('folds the week\'s summary to its title, and gives its words with bold and links', () => {
    render(<HeroWatchPanel summary={summary} relief={[]} listed={{ relief: [], missions: [] }} showRelief showMissions />);
    const week = screen.getByTestId('hero-watch-summary');
    expect(week.querySelector('summary')!.textContent).toBe('The week: Hero Watch: the week to 8 October');
    expect(within(week).getByText('Lifeboats').tagName).toBe('STRONG');
    expect(week.textContent).not.toContain('**');
    expect(within(week).getByRole('link', { name: 'https://data-rnli.opendata.arcgis.com' })).toHaveAttribute('href', 'https://data-rnli.opendata.arcgis.com');
  });

  it('lists relief by country, each operation and count linked to its source', () => {
    render(<HeroWatchPanel summary={null} relief={[ethiopia]} listed={{ relief: [], missions: [] }} showRelief showMissions />);
    const relief = screen.getByTestId('hero-watch-relief');
    expect(relief.querySelector('summary')!.textContent).toBe('Relief (1)');
    expect(relief.textContent).toContain('Ethiopia · 1 op · 144 orgs');
    expect(within(relief).getByRole('link', { name: op.title })).toHaveAttribute('href', 'https://go.ifrc.org/countries/65');
    expect(relief.textContent).toContain('IFRC GO · DREF · until 31 Mar 2027');
    expect(within(relief).getByRole('link', { name: presence.title })).toHaveAttribute('href', presence.url);
    expect(relief.textContent).toContain('OCHA, via HDX · CC BY');
  });

  it('lists the field missions it cannot place, each with its limits', () => {
    render(<HeroWatchPanel summary={null} relief={[]} listed={{ relief: [], missions: [unplacedMission] }} showRelief showMissions />);
    const item = screen.getByTestId('hero-watch-listed-mission');
    expect(item.textContent).toContain('Comment on federal rules before they close');
    expect(item.textContent).toContain('2 asks · open to 8 Oct 2026');
    expect(item.textContent).toContain('Its limits: Write in your own words: agencies discount identical form letters.');
  });

  it('shows only the sections that are on', () => {
    render(<HeroWatchPanel summary={null} relief={[ethiopia]} listed={{ relief: [op], missions: [unplacedMission] }} showRelief={false} showMissions={false} />);
    expect(screen.queryByTestId('hero-watch-relief')).toBeNull();
    expect(screen.queryByTestId('hero-watch-unplaced-missions')).toBeNull();
    expect(screen.queryByTestId('hero-watch-unplaced-relief')).toBeNull();
    expect(screen.getByTestId('hero-watch-panel').textContent).toBe('Hero Watch');
  });

  it('shrinks to the room its corner has and scrolls inside, as a fitting slot asks', () => {
    render(<HeroWatchPanel summary={summary} relief={[ethiopia]} listed={{ relief: [], missions: [] }} showRelief showMissions />);
    const panel = screen.getByTestId('hero-watch-panel');
    expect(parseFloat(panel.style.minHeight)).toBe(0);
    expect(panel.style.overflowY).toBe('auto');
  });
});

describe('a note\'s words', () => {
  it('are text: markup in them is shown, never run, and only http(s) addresses are links', () => {
    const hostile = { ...summary, content: '<img src=x onerror="alert(1)"> javascript:alert(1) **ok**' };
    render(<HeroWatchPanel summary={hostile} relief={[]} listed={{ relief: [], missions: [] }} showRelief showMissions />);
    const week = screen.getByTestId('hero-watch-summary');
    expect(week.querySelector('img')).toBeNull();
    expect(week.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(week.querySelectorAll('a')).toHaveLength(0);
    expect(week.querySelector('strong')!.textContent).toBe('ok');
    // Words that begin with another scheme stay words.
    const scheme = { ...summary, id: 's2', content: 'javascript:alert(1) is not an address' };
    render(<HeroWatchPanel summary={scheme} relief={[]} listed={{ relief: [], missions: [] }} showRelief showMissions />);
    expect(screen.getAllByTestId('hero-watch-summary')[1].querySelectorAll('a')).toHaveLength(0);
  });
});
