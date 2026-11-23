// @vitest-environment node
/**
 * Step 3.3.1 — Group Chat (NIP-28) Tests
 *
 * Verifies:
 * 3.3.1.1 — NostrChatAdapter has kind 40-44 event handlers
 * 3.3.1.2 — SecureChatContext exposes channel list management
 * 3.3.1.3 — SecureChatWindow has channel sidebar UI
 * 3.3.1.4 — nostrService has all NIP-28 kind methods
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relPath), 'utf-8');
}

describe('Step 3.3.1 — Group Chat NIP-28', () => {
  // 3.3.1.1 — NostrChatAdapter kind 40-44 handlers
  describe('NostrChatAdapter NIP-28 methods', () => {
    it('getChannels delegates to nostrService.getTeamChannels', () => {
      const src = readSrc('lib/chat/adapters/NostrChatAdapter.ts');
      expect(src).toContain('nostrService.getTeamChannels()');
    });

    it('updateChannel delegates to nostrService.updateChannelMetadata (kind 41)', () => {
      const src = readSrc('lib/chat/adapters/NostrChatAdapter.ts');
      expect(src).toContain('nostrService.updateChannelMetadata');
    });

    it('muteChannel stores locally (kind 44 support)', () => {
      const src = readSrc('lib/chat/adapters/NostrChatAdapter.ts');
      expect(src).toContain('mutedChannels.add');
    });

    it('createChannel delegates to nostrService.createTeamChannel (kind 40)', () => {
      const src = readSrc('lib/chat/adapters/NostrChatAdapter.ts');
      expect(src).toContain('nostrService.createTeamChannel');
    });
  });

  // 3.3.1.2 — SecureChatContext channel management
  describe('SecureChatContext channel management', () => {
    it('exposes channels, activeChannelId, createChannel, switchChannel, refreshChannels', () => {
      const src = readSrc('communication/context/SecureChatContext.tsx');
      expect(src).toContain('channels: EnhancedChatChannel[]');
      expect(src).toContain('activeChannelId: string | null');
      expect(src).toContain('createChannel');
      expect(src).toContain('switchChannel');
      expect(src).toContain('refreshChannels');
    });

    it('createChannel calls chatProvider.createChannel and refreshes', () => {
      const src = readSrc('communication/context/SecureChatContext.tsx');
      expect(src).toContain("chatProvider.createChannel(name, 'group', participants)");
      expect(src).toContain('await refreshChannels()');
    });
  });

  // 3.3.1.3 — SecureChatWindow channel sidebar
  describe('SecureChatWindow channel sidebar', () => {
    it('renders channel sidebar toggle button', () => {
      const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
      expect(src).toContain('showChannelSidebar');
      expect(src).toContain('channelSidebar');
    });

    it('renders the channel list, and in place of creating one says channels are not sealed (legal question E1)', () => {
      const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
      expect(src).toContain('channelList');
      expect(src).toContain('channels-not-sealed');
      expect(src).not.toContain('New channel name');
    });

    it('shows active channel highlight', () => {
      const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
      expect(src).toContain('activeChannel');
      expect(src).toContain('activeChannelId');
    });
  });

  // 3.3.1.4 — nostrService NIP-28 complete kind coverage
  describe('nostrService NIP-28 methods', () => {
    it('has updateChannelMetadata (kind 41)', () => {
      const src = readSrc('services/nostrService.ts');
      expect(src).toContain('updateChannelMetadata');
      expect(src).toContain('nip28.channelMetadataEvent');
    });

    it('has hideChannelMessage (kind 43)', () => {
      const src = readSrc('services/nostrService.ts');
      expect(src).toContain('hideChannelMessage');
      expect(src).toContain('nip28.channelHideMessageEvent');
    });

    it('has muteChannelUser (kind 44)', () => {
      const src = readSrc('services/nostrService.ts');
      expect(src).toContain('muteChannelUser');
      expect(src).toContain('nip28.channelMuteUserEvent');
    });

    it('has createTeamChannel (kind 40) and sendMessage (kind 42)', () => {
      const src = readSrc('services/nostrService.ts');
      expect(src).toContain('nip28.channelCreateEvent');
      expect(src).toContain('nip28.channelMessageEvent');
    });
  });
});
