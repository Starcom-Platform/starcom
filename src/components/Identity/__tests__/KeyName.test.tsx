/**
 * <KeyName> (plan item 2.1, story S2): a person by name wherever a key used to
 * show, with the key itself one hover away so a name never hides whose it is.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import KeyName from '../KeyName';
import { forgetNames, learnName, setOwnName } from '../../../services/identity/names';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { markAgentKey, resetAgentKeys } from '../../../services/identity/agentKeys';

const AISHA = 'b'.repeat(64);
const ME = 'a'.repeat(64);

beforeEach(() => {
  forgetNames();
  vi.restoreAllMocks();
  vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
});

describe('KeyName', () => {
  // An AI agent's key, as it says itself, is labelled wherever it is named (the legal review; EU AI Act Art. 50).
  it('labels a key that says it is an AI agent\'s, and no other', () => {
    resetAgentKeys();
    const { unmount } = render(<KeyName pubkey={AISHA} />);
    expect(screen.queryByTestId('key-name-agent')).toBeNull();
    unmount();
    act(() => { markAgentKey(AISHA); });
    render(<KeyName pubkey={AISHA} />);
    expect(screen.getByTestId('key-name-agent').textContent).toBe(' · AI agent');
    expect(screen.getByTestId('key-name-agent').getAttribute('title')).toBe('Its own posts or profile say this key is an AI agent\'s. Starcom does not detect it.');
    resetAgentKeys();
  });

  it('shows a short npub for a key nobody has named, and the whole npub on hover', () => {
    render(<KeyName pubkey={AISHA} />);
    const npub = nip19.npubEncode(AISHA);
    const shown = screen.getByTestId('key-name');
    expect(shown.textContent).toBe(`${npub.slice(0, 14)}…${npub.slice(-6)}`);
    expect(shown.getAttribute('title')).toContain(npub);
  });

  it('shows the name learned for a key, still with the npub on hover', () => {
    learnName(AISHA, 'Aisha Knight', 'team');
    render(<KeyName pubkey={AISHA} />);
    expect(screen.getByTestId('key-name').textContent).toBe('Aisha Knight');
    expect(screen.getByTestId('key-name').getAttribute('title')).toContain(nip19.npubEncode(AISHA));
  });

  it('says a key is yours, by your name once you have one', () => {
    const { rerender } = render(<KeyName pubkey={ME} />);
    expect(screen.getByTestId('key-name').textContent).toBe('you');

    act(() => { setOwnName('Priya Raman'); });
    rerender(<KeyName pubkey={ME} />);
    expect(screen.getByTestId('key-name').textContent).toBe('Priya Raman (you)');
  });

  it('changes when a name is learned, without being told to', () => {
    render(<KeyName pubkey={AISHA} />);
    act(() => { learnName(AISHA, 'Aisha Knight', 'team'); });
    expect(screen.getByTestId('key-name').textContent).toBe('Aisha Knight');
  });

  it('says nobody is recorded for an empty actor, rather than inventing one', () => {
    render(<KeyName pubkey="" />);
    expect(screen.getByTestId('key-name').textContent).toBe('nobody recorded');
  });

  it('shows something that is not a key as it was written', () => {
    render(<KeyName pubkey="netrunner-bot-7" />);
    expect(screen.getByTestId('key-name').textContent).toBe('netrunner-bot-7');
  });

  it('uses a name the screen already holds for the key, when none has been learned', () => {
    render(<KeyName pubkey={AISHA} hint="Aisha K." />);
    expect(screen.getByTestId('key-name').textContent).toBe('Aisha K.');
  });

  it('prefers a learned name to the hint', () => {
    learnName(AISHA, 'Aisha Knight', 'team');
    render(<KeyName pubkey={AISHA} hint="Aisha K." />);
    expect(screen.getByTestId('key-name').textContent).toBe('Aisha Knight');
  });

  it('shows the short key beside the name where which key matters', () => {
    act(() => { setOwnName('Priya Raman'); });
    render(<KeyName pubkey={ME} showKey />);
    const npub = nip19.npubEncode(ME);
    expect(screen.getByTestId('key-name').textContent).toBe(`Priya Raman (you) · ${npub.slice(0, 14)}…${npub.slice(-6)}`);
  });
});
