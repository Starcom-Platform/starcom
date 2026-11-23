/**
 * The callsign prompt (decision D-MX, MX7): opened only on request, since what
 * it sets is published as the author of what you sign; it saves the callsign,
 * refuses a key with the reason, and leaves the private name alone.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import CallsignRoot from '../CallsignRoot';
import { openCallsignPrompt } from '../callsignPrompt';
import { publishedCallsign, publishesAsAgent, setPublishesAsAgent } from '../../../services/identity/callsign';
import { ownName, setOwnName } from '../../../services/identity/names';

beforeEach(() => { localStorage.clear(); });

describe('CallsignRoot', () => {
  it('shows nothing until asked for', () => {
    render(<CallsignRoot />);
    expect(screen.queryByTestId('callsign-prompt')).toBeNull();
  });

  it('saves the callsign it is given, and says it is published', () => {
    render(<CallsignRoot />);
    act(() => openCallsignPrompt());
    expect(screen.getByText(/Published as the author of what you sign/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Callsign'), { target: { value: 'Night Owl' } });
    fireEvent.click(screen.getByText('Save'));
    expect(publishedCallsign()).toBe('Night Owl');
    expect(screen.queryByTestId('callsign-prompt')).toBeNull();
  });

  it('refuses a key and says why, keeping the card open', () => {
    render(<CallsignRoot />);
    act(() => openCallsignPrompt());
    fireEvent.change(screen.getByLabelText('Callsign'), { target: { value: nip19.npubEncode(getPublicKey(generateSecretKey())) } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be a key/);
    expect(publishedCallsign()).toBeNull();
    expect(screen.getByTestId('callsign-prompt')).toBeTruthy();
  });

  it("says whether this key is an agent's, and saves it with the callsign (MX14)", () => {
    render(<CallsignRoot />);
    act(() => openCallsignPrompt());
    const box = screen.getByLabelText(/This key is an agent's/) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(publishesAsAgent()).toBe(false);
    fireEvent.click(screen.getByText('Save'));
    expect(publishesAsAgent()).toBe(true);
  });

  it('shows the agent setting as it is when opened again', () => {
    setPublishesAsAgent(true);
    render(<CallsignRoot />);
    act(() => openCallsignPrompt());
    expect((screen.getByLabelText(/This key is an agent's/) as HTMLInputElement).checked).toBe(true);
  });

  it('never touches the private name', () => {
    setOwnName('Priya Raman');
    render(<CallsignRoot />);
    act(() => openCallsignPrompt());
    fireEvent.change(screen.getByLabelText('Callsign'), { target: { value: 'Kestrel' } });
    fireEvent.click(screen.getByText('Save'));
    expect(ownName()).toBe('Priya Raman');
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
