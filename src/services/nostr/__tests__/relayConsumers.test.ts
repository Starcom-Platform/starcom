/**
 * Every relay consumer draws its relays from publishTargets (plan item 0.3),
 * so what an operator configures reaches it.
 *
 * guard-hardcoded-relays keeps a consumer from importing a relay set around
 * the module. These check that each one uses what the module gives it: chat,
 * the chat provider, chat's emergency relays, the team health check, the
 * globe's intel intake and federation each read the registry directly, and
 * none of them answered to configuration.
 *
 * Each case sets the configuration, then loads the consumer fresh, because
 * several are singletons that read their relays as they load. Same jsdom,
 * crypto.subtle and fake-indexeddb setup as the SecureChatIntegrationService
 * suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EXTRA_PUBLIC_RELAYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';

vi.mock('../../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));
vi.mock('../../crypto/PQCKeyPublisher', () => ({
  fetchPrekeyBundles: vi.fn(async () => []),
  publishPrekeyBundle: vi.fn(async () => undefined),
}));

const TEAM_RELAY = 'wss://team.relay.example';
const KEYS = [
  'VITE_NOSTR_CHAT_RELAYS', 'VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE',
  'VITE_NOSTR_INTEL_RELAYS', 'VITE_NOSTR_FINDING_RELAYS',
];

const chatOnlyOnTheTeamRelay = () => {
  process.env.VITE_NOSTR_CHAT_RELAYS = TEAM_RELAY;
  process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
};

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  for (const key of KEYS) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('relay consumers', () => {
  it('chat publishes and reads where chat is configured', async () => {
    chatOnlyOnTheTeamRelay();
    const { default: nostrService } = await import('../../nostrService');
    expect((nostrService as unknown as { relays: string[] }).relays).toEqual([TEAM_RELAY]);
  });

  it('so does the Nostr chat provider', async () => {
    chatOnlyOnTheTeamRelay();
    const { defaultChatProviderConfigs } = await import('../../../lib/chat/ChatProviderFactory');
    expect(defaultChatProviderConfigs.nostr.options?.endpoints).toEqual([TEAM_RELAY]);
  });

  it('emergency mode adds no public relay once chat is kept to configured relays', async () => {
    chatOnlyOnTheTeamRelay();
    const { SecureChatIntegrationService } = await import('../../SecureChatIntegrationService');
    const service = SecureChatIntegrationService.getInstance();
    const nostr = (service as unknown as { nostrService: { addRelay: (url: string) => Promise<boolean> } }).nostrService;
    const added = vi.spyOn(nostr, 'addRelay').mockResolvedValue(true);

    await service.activateEmergencyMode();
    expect(added).not.toHaveBeenCalled();
  });

  it('and adds the extra public relays when nothing rules them out', async () => {
    const { SecureChatIntegrationService } = await import('../../SecureChatIntegrationService');
    const service = SecureChatIntegrationService.getInstance();
    const nostr = (service as unknown as { nostrService: { addRelay: (url: string) => Promise<boolean> } }).nostrService;
    const added = vi.spyOn(nostr, 'addRelay').mockResolvedValue(true);

    await service.activateEmergencyMode();
    expect(added.mock.calls.map(([url]) => url)).toEqual([...EXTRA_PUBLIC_RELAYS]);
  });

  it('the team health check probes the relays chat uses', async () => {
    chatOnlyOnTheTeamRelay();
    const dialled: string[] = [];
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        dialled.push(url);
        setTimeout(() => this.onerror?.(), 0);
      }
      close() { /* nothing opened */ }
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { realTimeTeamService } = await import('../../RealTimeTeamService');

    await realTimeTeamService.checkInfrastructureHealth();
    expect(dialled).toEqual([TEAM_RELAY]);
  });

  it('the globe reads a configured intel relay beside its own, as .env.example says it does', async () => {
    process.env.VITE_NOSTR_INTEL_RELAYS = TEAM_RELAY;
    const { NostrStarcomIntelIngest } = await import('../../intel/NostrStarcomIntelIngest');
    const reading = new NostrStarcomIntelIngest().getRelayStatus().map((r) => r.url);
    expect(reading).toContain(TEAM_RELAY);
    expect(reading).toContain(THE_RECORD_RELAY);
  });

  it('federation reads findings where findings are configured', async () => {
    process.env.VITE_NOSTR_FINDING_RELAYS = TEAM_RELAY;
    const { FederationIngestService } = await import('../../intel/federation/FederationIngestService');
    const reading = (new FederationIngestService() as unknown as { relays: string[] }).relays;
    expect(reading).toContain(TEAM_RELAY);
    expect(reading).toContain(THE_RECORD_RELAY);
  });
});
