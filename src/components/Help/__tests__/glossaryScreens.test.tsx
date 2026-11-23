/**
 * The glossary on screen (plan item 3.2): a "?" beside a word opens it at
 * that word, with the word's one line on hover; it can be searched, each
 * entry leads to the next worth reading, and the header's command box finds
 * a word by any of its names.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GlossaryRoot from '../GlossaryRoot';
import WhatIs from '../WhatIs';
import { glossaryCommands } from '../glossaryCommands';
import { openGlossary } from '../glossaryOpen';
import { glossaryEntry } from '../../../services/help/glossary';

describe('the glossary on screen', () => {
  it('opens at the word its "?" stands beside, with the one line on hover', async () => {
    render(<><p>Relay address <WhatIs term="relay" /></p><GlossaryRoot /></>);
    const button = screen.getByTestId('what-is-relay');
    expect(button.getAttribute('title')).toBe(glossaryEntry('relay')!.short);
    fireEvent.click(button);
    const entry = await screen.findByTestId('glossary-entry');
    expect(within(entry).getByRole('heading', { name: 'Relay' })).toBeTruthy();
    expect(entry.textContent).toContain('asks who you are');
  });

  it('draws no "?" for a word it does not have', () => {
    const { container } = render(<WhatIs term="flux-capacitor" />);
    expect(container.innerHTML).toBe('');
  });

  it('finds a word, says when nothing matches, and leads from one word to the next', async () => {
    render(<GlossaryRoot />);
    React.act(() => openGlossary('verdict'));
    const dialog = await screen.findByTestId('glossary');
    fireEvent.change(within(dialog).getByLabelText(/^Find a word/), { target: { value: 'geohash' } });
    expect(within(dialog).getByTestId('glossary-term-geohash')).toBeTruthy();
    expect(within(dialog).queryByTestId('glossary-term-relay')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Find a word/), { target: { value: 'flux' } });
    expect(within(dialog).getByText(/No word here matches "flux"/)).toBeTruthy();

    fireEvent.click(within(within(dialog).getByTestId('glossary-entry')).getByRole('button', { name: 'Case position' }));
    expect(within(within(dialog).getByTestId('glossary-entry')).getByRole('heading', { name: 'Case position' })).toBeTruthy();
  });

  it('is in the command box as /glossary, and as each word, found by any of its names', async () => {
    render(<GlossaryRoot />);
    const commands = glossaryCommands();
    expect(commands.find((c) => c.title === '/glossary')).toBeTruthy();
    const matches = (q: string) => commands.filter((c) => [c.title, c.description, 'keywords' in c ? c.keywords : ''].join(' ').toLowerCase().includes(q));
    // "signer" is in no title or line: only among the word's other names.
    expect(matches('signer').map((c) => c.title)).toEqual(['? Key and npub']);
    React.act(() => matches('signer')[0].action());
    expect(within(await screen.findByTestId('glossary-entry')).getByRole('heading', { name: 'Key and npub' })).toBeTruthy();
  });
});
