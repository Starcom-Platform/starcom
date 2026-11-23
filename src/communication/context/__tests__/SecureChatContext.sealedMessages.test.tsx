/**
 * A direct message someone seals to this key opens in their window (plan
 * item 2.7, slice a). Nothing received direct messages before: only the team
 * tab subscribed, and only to its own channel. The sealed inbox opens the
 * wrap; this is the window side.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureChatProvider } from '../SecureChatContext';
import { useSecureChat } from '../useSecureChat';
import { AdvancedSecurityService } from '../../../security/core/AdvancedSecurityService';
import { emitSealedChat, type SealedChatMessage } from '../../../services/chat/sealedChat';
import { learnName } from '../../../services/identity/names';
import { contactForKey } from '../../contactForKey';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';

const PRIYA = 'c'.repeat(64);
const wrapper = ({ children }: { children: React.ReactNode }) => <SecureChatProvider>{children}</SecureChatProvider>;
const message = (over: Partial<SealedChatMessage>): SealedChatMessage => ({
  id: 'm1', senderId: PRIYA, recipients: ['a'.repeat(64)], content: 'Berth 4 again tonight?', timestamp: 1790520000000,
  postQuantum: true, decryptionFailed: false, ...over,
});

afterEach(() => { vi.restoreAllMocks(); });

describe('a sealed direct message arriving', () => {
  it("opens its sender's window, by name, with the message in it, once however often it arrives", async () => {
    vi.spyOn(AdvancedSecurityService.getInstance(), 'validateContact').mockResolvedValue({ isValid: true, confidence: 0.95, warnings: [], requiredActions: [] });
    const { secureChatIntegration } = await import('../../../services/SecureChatIntegrationService');
    const used = vi.spyOn(secureChatIntegration, 'markChatUsed');
    learnName(PRIYA, 'Priya', 'team');
    const { result } = renderHook(() => useSecureChat(), { wrapper });

    act(() => {
      emitSealedChat(message({}));
      emitSealedChat(message({ id: 'm2', content: 'Cranes from 02:00.' }));
      emitSealedChat(message({}));
    });

    await waitFor(() => expect(result.current.state.activeWindows.get(`dm-${PRIYA}`)?.messages).toHaveLength(2));
    const window = result.current.state.activeWindows.get(`dm-${PRIYA}`)!;
    expect(result.current.state.activeWindows.size).toBe(1);
    expect(window.contact.displayName).toBe('Priya');
    // A window a message opened is not the person using chat: their key announces nothing for it (MF15).
    expect(used).not.toHaveBeenCalled();
    // Not a contact: nobody checked who holds this key, and the window does not say anyone did (plan item 9.9).
    expect(window.contact.verifiedIdentity).toMatchObject({ verificationMethod: 'none', verifiedBy: '' });
    expect(window.contact).not.toHaveProperty('trustScore');
    expect(window.messages.map((m) => [m.content, m.isOutgoing, m.senderPubkey, m.isEncrypted, m.postQuantum])).toEqual([
      ['Berth 4 again tonight?', false, PRIYA, true, true],
      ['Cranes from 02:00.', false, PRIYA, true, true],
    ]);
  });

  it('leaves a team message to the team, and marks one that could not be decrypted as not encrypted', async () => {
    vi.spyOn(AdvancedSecurityService.getInstance(), 'validateContact').mockResolvedValue({ isValid: true, confidence: 0.95, warnings: [], requiredActions: [] });
    const CHEN = 'e'.repeat(64);
    const { result } = renderHook(() => useSecureChat(), { wrapper });
    act(() => {
      emitSealedChat(message({ id: 't1', senderId: CHEN, team: 'wss://relay.newark.example', content: 'For the team.' }));
      emitSealedChat(message({ id: 'f1', senderId: 'd'.repeat(64), content: '[Encrypted message could not be decrypted]', decryptionFailed: true, postQuantum: false }));
    });
    await waitFor(() => expect(result.current.state.activeWindows.get(`dm-${'d'.repeat(64)}`)?.messages).toHaveLength(1));
    expect(result.current.state.activeWindows.has(`dm-${CHEN}`)).toBe(false);
    expect(result.current.state.activeWindows.get(`dm-${'d'.repeat(64)}`)!.messages[0]).toMatchObject({ isEncrypted: false, postQuantum: false });
  });

  it("does not open a window for what was said before, but shows it when that person's window is opened", async () => {
    vi.spyOn(AdvancedSecurityService.getInstance(), 'validateContact').mockResolvedValue({ isValid: true, confidence: 0.95, warnings: [], requiredActions: [] });
    // Priya's two messages arrived while the first test's chat was open.
    const { result } = renderHook(() => useSecureChat(), { wrapper });
    await new Promise((r) => setTimeout(r, 200));
    expect(result.current.state.activeWindows.has(`dm-${PRIYA}`)).toBe(false);

    await act(async () => { await result.current.openSecureChat(contactForKey(PRIYA, 'Priya', { vouched: true })); });
    await waitFor(() => expect(result.current.state.activeWindows.get(`dm-${PRIYA}`)?.messages.map((m) => m.content))
      .toEqual(['Berth 4 again tonight?', 'Cranes from 02:00.']));
  });

  it('shows what you sent to someone, after a reload, in their window, as yours', async () => {
    vi.spyOn(AdvancedSecurityService.getInstance(), 'validateContact').mockResolvedValue({ isValid: true, confidence: 0.95, warnings: [], requiredActions: [] });
    const ME = nostrIdentityService.ensureLocalIdentity('a test');
    const DAN = 'f'.repeat(64);
    act(() => { emitSealedChat(message({ id: 'mine-1', senderId: ME, recipients: [DAN], content: 'On my way.' })); });
    const { result } = renderHook(() => useSecureChat(), { wrapper });
    await act(async () => { await result.current.openSecureChat(contactForKey(DAN, 'Dan', { vouched: true })); });
    await waitFor(() => expect(result.current.state.activeWindows.get(`dm-${DAN}`)?.messages).toHaveLength(1));
    expect(result.current.state.activeWindows.get(`dm-${DAN}`)!.messages[0]).toMatchObject({ content: 'On my way.', isOutgoing: true });
  });
});
