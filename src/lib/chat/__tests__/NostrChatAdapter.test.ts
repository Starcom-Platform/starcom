/**
 * NostrChatAdapter.test.ts
 * 
 * Tests for the NostrChatAdapter class.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NostrChatAdapter } from '../adapters/NostrChatAdapter';
import { ChatMessage, ChatChannel, ChatUser } from '../ChatInterface';
import { ChatErrorType, createChatError } from '../utils/ChatErrorHandling';

// Mock return values factored out so beforeEach can re-arm them every test — the global
// setup's afterEach calls vi.restoreAllMocks(), which strips these off after the first
// test that runs, so relying on the vi.hoisted() initial values beyond test #1 is a trap.
const mockChannel = () => ({
  id: 'new-channel-id',
  name: 'Test Channel',
  description: 'Test description',
  createdAt: Date.now(),
  participants: []
});
const mockChannelMessages = () => [
  {
    id: 'msg-1',
    senderDID: 'test-user',
    senderName: 'Test User',
    content: 'Existing message',
    timestamp: Date.now(),
    channelId: 'test-channel',
    messageType: 'text'
  }
];

const { mockNostrService } = vi.hoisted(() => ({
  mockNostrService: {
    initialize: vi.fn(),
    getPublicKey: vi.fn(),
    // The adapter ensures an identity when it connects rather than reading one that
    // was assumed to exist at load.
    ensureIdentity: vi.fn(),
    addRelay: vi.fn(),
    createTeamChannel: vi.fn(),
    joinTeamChannel: vi.fn(),
    sendMessage: vi.fn(),
    getChannelMessages: vi.fn(),
    getTeamChannels: vi.fn()
  }
}));

// Mock nostrService
vi.mock('../../../services/nostrService', () => {
  return { default: mockNostrService };
});

describe('NostrChatAdapter', () => {
  let adapter: NostrChatAdapter;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Re-arm every implementation/return value — see the comment above mockChannel.
    mockNostrService.initialize.mockResolvedValue(undefined);
    mockNostrService.getPublicKey.mockReturnValue('deadbeef1234');
    mockNostrService.ensureIdentity.mockReturnValue('deadbeef1234');
    mockNostrService.addRelay.mockResolvedValue(true);
    mockNostrService.createTeamChannel.mockResolvedValue(mockChannel());
    mockNostrService.joinTeamChannel.mockResolvedValue(true);
    mockNostrService.sendMessage.mockResolvedValue(true);
    mockNostrService.getChannelMessages.mockReturnValue(mockChannelMessages());
    mockNostrService.getTeamChannels.mockReturnValue([]);

    // Create adapter instance
    adapter = new NostrChatAdapter({
      userId: 'test-user',
      userName: 'Test User'
    });
  });
  
  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });
  
  it('should create an instance', () => {
    expect(adapter).toBeInstanceOf(NostrChatAdapter);
  });
  
  it('should connect successfully', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(mockNostrService.initialize).toHaveBeenCalled();
  });

  it('connects and joins a channel without throwing when no userDID/userId is supplied, deriving one from the Nostr keypair instead (Phase 3 de-fake pass)', async () => {
    const anonAdapter = new NostrChatAdapter({});
    await expect(anonAdapter.connect()).resolves.not.toThrow();
    expect(anonAdapter.isConnected()).toBe(true);

    await expect(anonAdapter.joinChannel('test-channel')).resolves.not.toThrow();
    expect(mockNostrService.joinTeamChannel).toHaveBeenCalledWith('test-channel', 'did:nostr:deadbeef1234');

    await anonAdapter.disconnect();
  });
  
  it('should create a channel', async () => {
    await adapter.connect();
    
    const channel = await adapter.createChannel('Test Channel', 'team', []);
    expect(channel).toBeDefined();
    expect(channel.id).toBe('new-channel-id');
    expect(mockNostrService.createTeamChannel).toHaveBeenCalled();
  });
  
  it('should join a channel', async () => {
    await adapter.connect();
    
    await adapter.joinChannel('test-channel');
    expect(mockNostrService.joinTeamChannel).toHaveBeenCalledWith('test-channel', 'test-user');
  });
  
  it('should send a message', async () => {
    await adapter.connect();
    
    const message = await adapter.sendMessage('test-channel', 'Hello World');
    expect(message).toBeDefined();
    expect(message.content).toBe('Hello World');
    expect(mockNostrService.sendMessage).toHaveBeenCalledWith('test-channel', 'Hello World');
  });
  
  it('should get messages', async () => {
    await adapter.connect();
    
    const messages = await adapter.getMessages('test-channel');
    expect(messages).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
  });
  
  it('should get channels', async () => {
    await adapter.connect();
    
    const channels = await adapter.getChannels();
    expect(channels).toBeDefined();
    expect(channels).toEqual([]);
  });
});
