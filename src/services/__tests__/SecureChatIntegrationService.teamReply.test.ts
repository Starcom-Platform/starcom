/**
 * A reply written in a team's conversation in the chat window goes sealed to each member, as the team's own chat
 * sends it (plan item 2.7). It took the channel branch before: out to public relays in plain text (audit finding 13).
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));
vi.mock('../crypto/PQCKeyPublisher', () => ({ fetchPrekeyBundles: vi.fn(async () => []), publishPrekeyBundle: vi.fn(async () => undefined) }));
const { sendTeamMessage } = vi.hoisted(() => ({ sendTeamMessage: vi.fn() }));
vi.mock('../chat/teamChat', () => ({
  sendTeamMessage,
  teamChatKey: (team: { relayUrl?: string }) => (team.relayUrl ? team.relayUrl.replace(/^wss:\/\//, '') : null),
}));

import { SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { realTimeTeamService } from '../RealTimeTeamService';
import type { CyberTeam } from '../../types/cyberInvestigation';

const TEAM = { id: 'local-7', name: 'Harbour watch', relayUrl: 'wss://relay.harbour.example', members: [] } as unknown as CyberTeam;

describe('a reply in a team conversation', () => {
  const service = SecureChatIntegrationService.getInstance();
  const nostrService = (service as unknown as { nostrService: { sendMessage: (...a: unknown[]) => Promise<boolean> } }).nostrService;

  afterEach(() => { vi.restoreAllMocks(); sendTeamMessage.mockReset(); });

  it('goes sealed to each member of that team, and never as a channel message', async () => {
    await service.connect();
    vi.spyOn(realTimeTeamService, 'getTeams').mockReturnValue([TEAM]);
    const plain = vi.spyOn(nostrService, 'sendMessage').mockResolvedValue(true);
    sendTeamMessage.mockResolvedValue({ id: 'm1', reached: ['b'.repeat(64)], notReached: [], postQuantum: true });

    const sent = await service.sendMessage('team-relay.harbour.example', 'Two cranes down at berth 7.');

    expect(sendTeamMessage).toHaveBeenCalledWith(TEAM, 'Two cranes down at berth 7.');
    expect(plain).not.toHaveBeenCalled();
    expect(sent).toMatchObject({ messageId: 'm1', encrypted: true, postQuantum: true, status: 'sent' });
  });

  it('is not sent when that team is not on this device, or when it reached nobody, and says why', async () => {
    await service.connect();
    vi.spyOn(realTimeTeamService, 'getTeams').mockReturnValue([]);
    await expect(service.sendMessage('team-relay.harbour.example', 'Hello')).rejects.toThrow(/that team is not on this device/);
    vi.spyOn(realTimeTeamService, 'getTeams').mockReturnValue([TEAM]);
    sendTeamMessage.mockResolvedValue({ id: 'm2', reached: [], notReached: [{ pubkey: 'b'.repeat(64), reason: 'no inbox' }], postQuantum: false });
    await expect(service.sendMessage('team-relay.harbour.example', 'Hello')).rejects.toThrow('The message was not sent: no inbox');
  });
});
