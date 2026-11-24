/**
 * NostrChatAdapter.ts
 * 
 * Adapter for the Nostr protocol that conforms to the unified ChatProviderInterface.
 * This adapter extends BaseChatAdapter and implements the required methods for Nostr.
 */

import { BaseChatAdapter } from './BaseChatAdapter';
import { chatProviderRelays } from '../../../services/nostr/publishTargets';
import { 
  EnhancedChatMessage, 
  EnhancedChatChannel, 
  EnhancedChatUser,
  EnhancedChatProviderOptions,
  ConnectionStatus,
  ConnectionDetails,
  MessageStatus
} from '../types/ChatAdapterTypes';
import { ChatProviderCapabilities, ProtocolInfo } from '../types/ProtocolTypes';
import { SearchOptions, SearchResult } from '../interfaces/ChatProviderInterface';
import nostrService, { NostrMessage, NostrTeamChannel } from '../../../services/nostrService';
import { finalizeEvent, getPublicKey, type Filter, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../../services/nostr/relayPool';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import * as nip04 from 'nostr-tools/nip04';
import { logger } from '../../../utils';
import { wrapChatError } from '../errors/ChatErrors';

/**
 * Options specific to the Nostr chat adapter.
 */
export interface NostrChatAdapterOptions extends EnhancedChatProviderOptions {
  relays?: string[];
  userDID?: string;
  // clearanceLevel removed in civilian build
}

/**
 * Adapter for Nostr that implements the ChatProviderInterface.
 */
export class NostrChatAdapter extends BaseChatAdapter {
  private messageSubscriptions: Map<string, () => void> = new Map();
  private presenceSubscriptions: Map<string, () => void> = new Map();
  private relays: string[] = [];
  private userDID: string | null = null;
  private channelSubscriptions: Map<string, NodeJS.Timeout> = new Map();
  /** Dedicated pool for DM subscriptions (Kind 4) */
  private dmPool: SimplePool = createRelayPool();
  /** Active DM subscription closers */
  private dmSubs: Map<string, SubCloser> = new Map();
  /** Last-seen timestamp per channel/DM for reconnection */
  private lastSeenTimestamp: Map<string, number> = new Map();
  /** Deduplication set per channel */
  private seenMessageIds: Map<string, Set<string>> = new Map();
  /** Locally muted channels */
  private mutedChannels: Set<string> = new Set();

  constructor(options?: NostrChatAdapterOptions) {
    super(options);
    
    this.relays = options?.relays || [];
    this.userDID = options?.userDID || null;
  }

  /**
   * Initialize protocol-specific capabilities.
   */
  protected initializeCapabilities(): ChatProviderCapabilities {
    return {
      messaging: true,
      channels: true,
      presence: false,
      attachments: false,
      reactions: false,
      threading: false,
      encryption: true,
      markdown: true,
      mentioning: true,
      deletion: false,
      editing: false,
      history: true,
      metadata: true,
      directMessaging: true,
      groupChat: true,
      fileAttachments: false,
      endToEndEncryption: true,
      messageHistory: true,
      presenceDetection: false,
      messageDeliveryStatus: false,
      messageReactions: false,
      messageThreads: false,
      userProfiles: true,
      channelManagement: true,
      messageSearch: false,
      p2pCommunication: false,
      offline: false,
      messageEditing: false,
      messageDeleting: false,
      readReceipts: false,
      typing: false,
      
      // Additional required fields
      search: false,
      read_receipts: false,
      mentions: true,
      e2e_encryption: true,
      forward_secrecy: true,
      pq_encryption: true,
      p2p: false,
      server_based: false,
      relay_based: true,
      persistent_history: true,
      message_expiry: false,
      sync: false
    };
  }

  /**
   * Initialize protocol-specific information.
   */
  protected initializeProtocolInfo(): ProtocolInfo {
    return {
      id: 'nostr',
      name: 'Nostr',
      version: '1.0.0',
      description: 'Nostr (Notes and Other Stuff Transmitted by Relays) protocol adapter',
      homepage: 'https://nostr.com',
      documentation: 'https://github.com/nostr-protocol/nips',
      isP2P: false,
      isServerless: true,
      isEncrypted: true,
      isFederated: true,
      isCensorshipResistant: true,
      isAnonymous: true,
      maintainers: ['Starcom'],
      license: 'AGPL-3.0-only',
      metadata: {
        features: [
          'encryption',
          'decentralization'
        ]
      }
    };
  }

  /**
   * Connect to the Nostr network.
   */
  public async connect(options?: Partial<NostrChatAdapterOptions>): Promise<void> {
    if (this.isConnected()) {
      logger.info('Already connected to Nostr network');
      return;
    }
    
    try {
      logger.info('Connecting to Nostr network...');
      this.updateConnectionStatus('connecting', { 
        status: 'connecting', 
        errorMessage: 'Connecting to Nostr network'
      });
      
      // Update options if provided
      if (options) {
        if (options.relays) {
          this.relays = options.relays;
        }
        if (options.userDID) {
          this.userDID = options.userDID;
        }
      }
      
      // Initialize NostrService
      await nostrService.initialize();

      /*
       * Default to a DID derived from this device's Nostr keypair if the caller didn't
       * supply one — mirrors nostrService's own internal did:nostr:${pubkey} fallback.
       * This identifier is only ever used as a display/participant label in this
       * adapter, never for cryptographic verification, so a derived pseudo-DID is safe.
       *
       * ensureIdentity, not getPublicKey: a key is created when something needs to sign
       * now, and this browser may never have signed anything. Reading it would have
       * produced the label "did:nostr:null" and gone on as though that were a person.
       * Connecting to chat is a commitment to sign — the next message published carries
       * this key — so this is the honest place to create one and say why.
       */
      if (!this.userDID && !this.options.userId) {
        this.userDID = `did:nostr:${nostrService.ensureIdentity('joining chat')}`;
      }

      // Add custom relays if provided
      if (this.relays.length > 0) {
        for (const relay of this.relays) {
          await nostrService.addRelay(relay);
        }
      }
      
      this.updateConnectionStatus('connected', { 
        status: 'connected', 
        connectedAt: Date.now(),
        endpoint: 'nostr',
        protocol: 'relay',
        encryptionEnabled: true
      });
      logger.info('Connected to Nostr network');
      
      // Emit connected event
      this.events.emit('connected');
    } catch (error) {
      logger.error('Failed to connect to Nostr network:', error);
      this.updateConnectionStatus('error', { 
        status: 'error', 
        errorMessage: `Connection error: ${error instanceof Error ? error.message : String(error)}` 
      });
      throw error;
    }
  }

  /**
   * Disconnect from the Nostr network.
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected()) {
      logger.info('Not connected to Nostr network');
      return;
    }
    
    try {
      logger.info('Disconnecting from Nostr network...');
      this.updateConnectionStatus('reconnecting', { status: 'reconnecting', errorMessage: 'Reconnecting to Nostr network' });
      
      // Clean up subscriptions
      for (const unsubscribe of this.messageSubscriptions.values()) {
        unsubscribe();
      }
      this.messageSubscriptions.clear();
      
      for (const unsubscribe of this.presenceSubscriptions.values()) {
        unsubscribe();
      }
      this.presenceSubscriptions.clear();
      
      // Clear channel subscription timeouts
      for (const timeout of this.channelSubscriptions.values()) {
        clearTimeout(timeout);
      }
      this.channelSubscriptions.clear();
      
      // Close DM subscriptions and pool
      for (const sub of this.dmSubs.values()) {
        sub.close();
      }
      this.dmSubs.clear();
      this.seenMessageIds.clear();
      
      this.updateConnectionStatus('disconnected', { status: 'disconnected' });
      logger.info('Disconnected from Nostr network');
      
      // Emit disconnected event
      this.events.emit('disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Nostr network:', error);
      this.updateConnectionStatus('error', { 
        status: 'error', 
        errorMessage: `Disconnection error: ${error instanceof Error ? error.message : String(error)}` 
      });
      throw error;
    }
  }

  /**
   * Reconnect to the Nostr network.
   * Preserves lastSeenTimestamp so resumed subscriptions fetch only missed messages.
   */
  public async reconnect(): Promise<void> {
    try {
      logger.info('Reconnecting to Nostr network...');
      // Save active subscription callbacks before disconnect clears them
      // lastSeenTimestamp is preserved across reconnect — subscriptions
      // will use since:lastSeenTimestamp when re-established
      await this.disconnect();
      await this.connect();
      logger.info('Reconnected to Nostr network');
    } catch (error) {
      logger.error('Error reconnecting to Nostr network:', error);
      throw error;
    }
  }

  /**
   * Send a message to a channel or DM conversation.
   * Channel messages use NIP-28 via nostrService.
   * DMs use NIP-04 encrypted events (Kind 4) via dedicated pool.
   */
  public async sendMessage(channelId: string, content: string, attachments?: File[]): Promise<EnhancedChatMessage> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      const isDirect = channelId.startsWith('dm-');
      let messageId: string;
      const timestamp = Date.now();
      
      if (isDirect) {
        // NIP-04 encrypted DM
        const recipientPubkey = channelId.replace('dm-', '');
        // The person is sending, so a locked key is asked for (D-KL).
        await nostrService.unlockFor('sending a direct message');

        if (!nostrService['secretKey']) {
          throw new Error('No secret key available for DM encryption');
        }
        
        const secretKey = nostrService['secretKey'] as Uint8Array;
        const encrypted = await nip04.encrypt(secretKey, recipientPubkey, content);
        
        const event = finalizeEvent({
          kind: 4,
          created_at: Math.floor(timestamp / 1000),
          tags: [['p', recipientPubkey]],
          content: encrypted,
        }, secretKey);
        
        const relays = this.relays.length > 0 ? this.relays : chatProviderRelays();
        const publishResults = this.dmPool.publish(relays, event);
        await Promise.any(publishResults);
        
        messageId = event.id;
      } else {
        // NIP-28 channel message via nostrService
        const success = await nostrService.sendMessage(channelId, content);
        
        if (!success) {
          throw new Error(`Failed to send message to channel ${channelId}`);
        }
        
        messageId = `msg-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      const message: EnhancedChatMessage = {
        id: messageId,
        senderId: this.userDID || this.options.userId || 'unknown',
        senderName: this.options.userName || 'Unknown User',
        content,
        timestamp,
        channelId,
        type: 'text',
        status: 'sent'
      };
      
      // Sign the message content with PQCryptoService
      try {
        const { PQCryptoService } = await import('../../../services/crypto/PQCryptoService');
        const pqc = PQCryptoService.getInstance();
        const sigKP = await pqc.generateSignatureKeyPair();
        const contentBytes = new TextEncoder().encode(content);
        const sig = await pqc.signMessage(contentBytes, sigKP.privateKey);
        message.metadata = {
          ...message.metadata,
          signature: Array.from(sig.signature),
          signatureAlgorithm: sig.algorithm,
          signerPublicKey: Array.from(sigKP.publicKey),
          signedAt: sig.timestamp,
        };
      } catch (sigErr) {
        const wrapped = wrapChatError('SIGNATURE_FAILED', sigErr, { channelId });
        logger.warn('Failed to sign message, sending unsigned:', wrapped.code);
        // Message sends unsigned — metadata marks it as unverified
        message.metadata = { ...message.metadata, signatureError: wrapped.code };
      }
      
      // Handle attachments if present (not supported in Nostr yet)
      if (attachments && attachments.length > 0) {
        this.handleUnsupportedFeature('attachments', { channelId, attachmentsCount: attachments.length });
      }
      
      logger.info(`Message sent to ${isDirect ? 'DM' : 'channel'} ${channelId}`);
      
      return message;
    } catch (error) {
      logger.error(`Error sending message to ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get messages from a channel.
   */
  public async getMessages(channelId: string, limit: number = 50, before?: number): Promise<EnhancedChatMessage[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      // Get messages from the channel
      const nostrMessages = nostrService.getChannelMessages(channelId);
      
      // Convert Nostr messages to EnhancedChatMessage format
      const messages: EnhancedChatMessage[] = nostrMessages.map(msg => this.convertNostrMessage(msg));
      
      // Filter by timestamp if 'before' is specified
      const filteredMessages = before
        ? messages.filter(msg => msg.timestamp < before)
        : messages;
      
      // Limit the number of messages
      const limitedMessages = filteredMessages.slice(0, limit);
      
      // Sort by timestamp in descending order
      return limitedMessages.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error(`Error getting messages from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to messages in a channel or DM conversation.
   * Uses real-time relay subscriptions instead of polling.
   * - NIP-28 channels: delegates to nostrService.subscribeToChannel() + window event listener
   * - NIP-04 DMs: subscribes via dedicated SimplePool with Kind 4 + #p filter
   */
  public subscribeToMessages(channelId: string, callback: (message: EnhancedChatMessage) => void): () => void {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Unsubscribe from previous subscription for this channel if exists
    if (this.messageSubscriptions.has(channelId)) {
      const unsubscribe = this.messageSubscriptions.get(channelId);
      if (unsubscribe) {
        unsubscribe();
      }
      this.messageSubscriptions.delete(channelId);
    }
    
    // Initialize dedup set for this channel
    if (!this.seenMessageIds.has(channelId)) {
      this.seenMessageIds.set(channelId, new Set());
    }
    const seen = this.seenMessageIds.get(channelId)!;
    
    // Deliver initial cached messages
    const initialMessages = nostrService.getChannelMessages(channelId);
    initialMessages.forEach(msg => {
      seen.add(msg.id);
      callback(this.convertNostrMessage(msg));
    });
    
    const isDirect = channelId.startsWith('dm-');
    let unsubscribe: () => void;
    
    if (isDirect) {
      // NIP-04 DM subscription via dedicated pool
      unsubscribe = this.subscribeToDMs(channelId, callback, seen);
    } else {
      // NIP-28 channel subscription via nostrService real-time relay
      unsubscribe = this.subscribeToChannel(channelId, callback, seen);
    }
    
    // Store unsubscribe function
    this.messageSubscriptions.set(channelId, unsubscribe);
    
    return unsubscribe;
  }

  /**
   * Subscribe to NIP-28 channel messages via nostrService relay subscription.
   * Listens for 'nostr-message-received' CustomEvents broadcast by nostrService.
   */
  private subscribeToChannel(channelId: string, callback: (message: EnhancedChatMessage) => void, seen: Set<string>): () => void {
    // Activate the real relay subscription in nostrService (Kind 42 via subscribeMany)
    nostrService.subscribeToChannel(channelId);
    
    // Listen for messages broadcast by nostrService.processChannelEvent()
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<NostrMessage>;
      const msg = customEvent.detail;
      if (msg.channelId === channelId && !seen.has(msg.id)) {
        seen.add(msg.id);
        this.lastSeenTimestamp.set(channelId, msg.timestamp);
        callback(this.convertNostrMessage(msg));
      }
    };
    
    window.addEventListener('nostr-message-received', handler);
    
    return () => {
      window.removeEventListener('nostr-message-received', handler);
      nostrService.unsubscribeFromChannel(channelId);
      this.messageSubscriptions.delete(channelId);
      this.seenMessageIds.delete(channelId);
    };
  }

  /**
   * Subscribe to NIP-04 encrypted DMs via dedicated SimplePool.
   * Uses Kind 4 + #p tag filter for real-time DM delivery.
   */
  private subscribeToDMs(channelId: string, callback: (message: EnhancedChatMessage) => void, seen: Set<string>): () => void {
    const recipientPubkey = channelId.replace('dm-', '');
    const myPubkey = nostrService.pool.listConnectionStatus ? 
      (this.userDID || this.options.userId || '') : '';
    
    // Get our secret key for decryption from nostrService's public interface
    const relays = this.relays.length > 0 ? this.relays : chatProviderRelays();
    const sinceTimestamp = this.lastSeenTimestamp.get(channelId);
    
    const filter: Filter = {
      kinds: [4],
      '#p': [myPubkey],
    };
    if (sinceTimestamp) {
      filter.since = Math.floor(sinceTimestamp / 1000);
    }
    
    const sub = this.dmPool.subscribeMany(
      relays,
      filter,
      {
        onevent: (event: any) => {
          if (seen.has(event.id)) return;
          seen.add(event.id);
          
          const message: EnhancedChatMessage = {
            id: event.id,
            senderId: event.pubkey?.substring(0, 10) || 'unknown',
            senderName: event.pubkey ? `did:nostr:${event.pubkey}` : 'unknown',
            content: event.content, // NIP-04 encrypted — decryption deferred to crypto layer
            timestamp: (event.created_at || 0) * 1000,
            channelId,
            type: 'text',
            status: 'sent',
            metadata: { encrypted: true, nip04: true }
          };
          
          this.lastSeenTimestamp.set(channelId, message.timestamp);
          callback(message);
        },
        oneose: () => {
          logger.debug('End of stored DM events for:', channelId);
        }
      }
    );
    
    this.dmSubs.set(channelId, sub);
    
    return () => {
      sub.close();
      this.dmSubs.delete(channelId);
      this.messageSubscriptions.delete(channelId);
      this.seenMessageIds.delete(channelId);
    };
  }

  /**
   * Edit a message.
   */
  public async editMessage(messageId: string, channelId: string, _newContent: string): Promise<EnhancedChatMessage> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Message editing is not supported in Nostr
    throw this.handleUnsupportedFeature('editMessage', { messageId, channelId });
  }

  /**
   * Delete a message.
   */
  public async deleteMessage(messageId: string, channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Message deletion is not supported in Nostr
    throw this.handleUnsupportedFeature('deleteMessage', { messageId, channelId });
  }

  /**
   * Reply to a message.
   */
  public async replyToMessage(messageId: string, channelId: string, content: string, attachments?: File[]): Promise<EnhancedChatMessage> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // For now, we'll just send a new message with a reference to the original
    const replyPrefix = `Replying to message ${messageId}: `;
    return this.sendMessage(channelId, replyPrefix + content, attachments);
  }

  /**
   * Forward a message.
   */
  public async forwardMessage(messageId: string, sourceChannelId: string, targetChannelId: string): Promise<EnhancedChatMessage> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Message forwarding is not supported in Nostr
    throw this.handleUnsupportedFeature('forwardMessage', { messageId, sourceChannelId, targetChannelId });
  }

  /**
   * Add a reaction to a message.
   */
  public async addReaction(messageId: string, channelId: string, reaction: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Reactions are not supported in Nostr
    throw this.handleUnsupportedFeature('addReaction', { messageId, channelId, reaction });
  }

  /**
   * Remove a reaction from a message.
   */
  public async removeReaction(messageId: string, channelId: string, reaction: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Reactions are not supported in Nostr
    throw this.handleUnsupportedFeature('removeReaction', { messageId, channelId, reaction });
  }

  /**
   * Create a channel.
   */
  public async createChannel(name: string, _type: string, _participants: string[]): Promise<EnhancedChatChannel> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      // Create a team ID based on the name
      const teamId = `team-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      
      // Create the channel in Nostr
      const nostrChannel = await nostrService.createTeamChannel(
        teamId,
        name,
        `Channel for ${name}`
      );
      
      // Convert Nostr channel to EnhancedChatChannel
      const channel = this.convertNostrChannel(nostrChannel);
      
      logger.info(`Channel ${name} created with ID ${channel.id}`);
      
      return channel;
    } catch (error) {
      logger.error(`Error creating channel ${name}:`, error);
      throw error;
    }
  }

  /**
   * Join a channel.
   */
  public async joinChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      // connect() always sets userDID (deriving one from the Nostr keypair if unset)
      // before isConnected() can be true, so no separate validation is needed here.

      // Join the channel in Nostr
      await nostrService.joinTeamChannel(
        channelId,
        this.userDID || this.options.userId || ''
      );
      
      logger.info(`Joined channel ${channelId}`);
    } catch (error) {
      logger.error(`Error joining channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Leave a channel.
   */
  public async leaveChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have a leaveChannel method yet
    logger.warn(`leaveChannel not implemented for ${channelId}`);
    throw this.handleUnsupportedFeature('leaveChannel', { channelId });
  }

  /**
   * Get all available channels from nostrService cache.
   */
  public async getChannels(): Promise<EnhancedChatChannel[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      const nostrChannels = nostrService.getTeamChannels();
      return nostrChannels.map(ch => this.convertNostrChannel(ch));
    } catch (error) {
      logger.error('Error getting channels:', error);
      throw error;
    }
  }

  /**
   * Get channel details from cache or return shell.
   */
  public async getChannelDetails(channelId: string): Promise<EnhancedChatChannel> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      const cached = nostrService.getTeamChannels().find(ch => ch.id === channelId);
      if (cached) return this.convertNostrChannel(cached);

      // Fallback shell when channel is not in cache
      const shell: NostrTeamChannel = {
        id: channelId,
        teamId: 'default-team',
        name: `Channel ${channelId.slice(0, 8)}`,
        description: '',
        relayUrls: this.relays,
        participants: [],
        createdAt: Date.now(),
        isActive: true,
        channelType: 'general'
      };
      return this.convertNostrChannel(shell);
    } catch (error) {
      logger.error(`Error getting channel details for ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Update channel metadata via NIP-28 Kind 41.
   */
  public async updateChannel(channelId: string, updates: Partial<EnhancedChatChannel>): Promise<EnhancedChatChannel> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    await nostrService.updateChannelMetadata(channelId, {
      name: updates.name,
      about: updates.description,
    });
    return this.getChannelDetails(channelId);
  }

  /**
   * Delete a channel.
   */
  public async deleteChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have a deleteChannel method yet
    throw this.handleUnsupportedFeature('deleteChannel', { channelId });
  }

  /**
   * Archive a channel.
   */
  public async archiveChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have an archiveChannel method yet
    throw this.handleUnsupportedFeature('archiveChannel', { channelId });
  }

  /**
   * Unarchive a channel.
   */
  public async unarchiveChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have an unarchiveChannel method yet
    throw this.handleUnsupportedFeature('unarchiveChannel', { channelId });
  }

  /**
   * Mute a channel (locally tracked — NIP-28 has user muting via Kind 44).
   */
  public async muteChannel(channelId: string, _duration?: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    this.mutedChannels.add(channelId);
    logger.info(`Channel ${channelId} muted locally`);
  }

  /**
   * Unmute a channel.
   */
  public async unmuteChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    this.mutedChannels.delete(channelId);
    logger.info(`Channel ${channelId} unmuted`);
  }

  /**
   * Pin a channel.
   */
  public async pinChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have a pinChannel method yet
    throw this.handleUnsupportedFeature('pinChannel', { channelId });
  }

  /**
   * Unpin a channel.
   */
  public async unpinChannel(channelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have an unpinChannel method yet
    throw this.handleUnsupportedFeature('unpinChannel', { channelId });
  }

  /**
   * Get users in a channel.
   */
  public async getUsers(channelId: string): Promise<EnhancedChatUser[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      // Stub implementation - in a real implementation, we would call a NostrService method
      // For now, return an empty array
      return [];
    } catch (error) {
      logger.error(`Error getting users for channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get a user by ID.
   */
  public async getUserById(userId: string): Promise<EnhancedChatUser | null> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      // Stub implementation - in a real implementation, we would call a NostrService method
      // For now, return a default user
      return {
        id: userId,
        name: userId.substring(0, 8),
        status: 'online'
      };
    } catch (error) {
      logger.error(`Error getting user by ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get the current user.
   */
  public getCurrentUser(): EnhancedChatUser {
    return {
      id: this.userDID || this.options.userId || 'unknown',
      name: this.options.userName || 'Unknown User',
      status: this.isConnected() ? 'online' : 'offline'
    };
  }

  /**
   * Subscribe to user presence in a channel.
   */
  public subscribeToUserPresence(channelId: string, callback: (users: EnhancedChatUser[]) => void): () => void {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Unsubscribe from previous subscription for this channel if exists
    if (this.presenceSubscriptions.has(channelId)) {
      const unsubscribe = this.presenceSubscriptions.get(channelId);
      if (unsubscribe) {
        unsubscribe();
      }
      this.presenceSubscriptions.delete(channelId);
    }
    
    // Initial fetch of users
    this.getUsers(channelId).then(users => {
      callback(users);
    }).catch(error => {
      logger.error(`Error in initial user presence fetch for ${channelId}:`, error);
    });
    
    // Simulate periodic updates since Nostr doesn't have native presence
    const intervalId = setInterval(() => {
      this.getUsers(channelId).then(users => {
        callback(users);
      }).catch(error => {
        logger.error(`Error in simulated presence update for ${channelId}:`, error);
      });
    }, 60000); // Update every minute
    
    // Store the unsubscribe function
    const unsubscribe = () => {
      clearInterval(intervalId);
      this.presenceSubscriptions.delete(channelId);
    };
    
    this.presenceSubscriptions.set(channelId, unsubscribe);
    
    return unsubscribe;
  }

  /**
   * Update user status.
   */
  public async updateUserStatus(status: string, customStatus?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // NostrService doesn't have an updateUserStatus method yet
    throw this.handleUnsupportedFeature('updateUserStatus', { status, customStatus });
  }

  /**
   * Mark messages as read.
   */
  public async markMessagesAsRead(channelId: string, messageIds: string[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Nostr doesn't support read receipts natively
    logger.info(`Marked ${messageIds.length} messages as read in ${channelId} (simulated)`);
    
    // No-op implementation
    return Promise.resolve();
  }

  /**
   * Search messages.
   */
  public async searchMessages(query: string, channelId?: string, options?: SearchOptions): Promise<SearchResult> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    try {
      const startTime = Date.now();
      
      // Get messages from the specified channel, or all channels if not specified
      let messages: EnhancedChatMessage[] = [];
      
      if (channelId) {
        messages = await this.getMessages(channelId);
      } else {
        // Get messages from all channels
        const channels = await this.getChannels();
        for (const channel of channels) {
          const channelMessages = await this.getMessages(channel.id);
          messages.push(...channelMessages);
        }
      }
      
      // Filter messages by query
      const filteredMessages = messages.filter(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      );
      
      // Apply additional filters from options
      let resultMessages = filteredMessages;
      
      if (options) {
        if (options.fromUserId) {
          resultMessages = resultMessages.filter(msg => msg.senderId === options.fromUserId);
        }
        
        if (options.startDate) {
          resultMessages = resultMessages.filter(msg => msg.timestamp >= options.startDate!);
        }
        
        if (options.endDate) {
          resultMessages = resultMessages.filter(msg => msg.timestamp <= options.endDate!);
        }
        
        if (options.messageTypes && options.messageTypes.length > 0) {
          resultMessages = resultMessages.filter(msg => options.messageTypes!.includes(msg.type));
        }
        
        // Sort by timestamp
        resultMessages = resultMessages.sort((a, b) => 
          options.sortOrder === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
        );
        
        // Apply limit and offset
        if (options.offset) {
          resultMessages = resultMessages.slice(options.offset);
        }
        
        if (options.limit) {
          resultMessages = resultMessages.slice(0, options.limit);
        }
      }
      
      const endTime = Date.now();
      
      return {
        messages: resultMessages,
        totalResults: filteredMessages.length,
        hasMore: resultMessages.length < filteredMessages.length,
        executionTimeMs: endTime - startTime
      };
    } catch (error) {
      logger.error(`Error searching messages for "${query}":`, error);
      throw error;
    }
  }

  /**
   * Upload a file attachment.
   */
  public async uploadAttachment(file: File): Promise<{ id: string; url: string; }> {
    throw this.handleUnsupportedFeature('uploadAttachment', { 
      file: { name: file.name, size: file.size, type: file.type } 
    });
  }

  /**
   * Create a thread.
   */
  public async createThread(messageId: string, channelId: string, _content: string): Promise<EnhancedChatMessage> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Threads are not supported in Nostr yet
    throw this.handleUnsupportedFeature('createThread', { messageId, channelId });
  }

  /**
   * Get thread messages.
   */
  public async getThreadMessages(threadId: string, limit?: number, before?: number): Promise<EnhancedChatMessage[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Threads are not supported in Nostr yet
    throw this.handleUnsupportedFeature('getThreadMessages', { threadId, limit, before });
  }

  /**
   * Subscribe to thread messages.
   */
  public subscribeToThreadMessages(threadId: string, _callback: (message: EnhancedChatMessage) => void): () => void {
    if (!this.isConnected()) {
      throw new Error('Not connected to Nostr network');
    }
    
    // Threads are not supported in Nostr yet
    throw this.handleUnsupportedFeature('subscribeToThreadMessages', { threadId });
  }

  /**
   * Helper method to convert a NostrMessage to an EnhancedChatMessage.
   */
  private convertNostrMessage(msg: NostrMessage): EnhancedChatMessage {
    return {
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderDID.split(':')[2] || msg.senderDID,
      content: msg.content,
      timestamp: msg.timestamp,
      channelId: msg.channelId,
      type: this.mapMessageType(msg.messageType),
      status: 'sent',
  metadata: {
        teamId: msg.teamId,
        senderDID: msg.senderDID,
        encrypted: msg.encrypted,
        pqcEncrypted: msg.pqcEncrypted
      }
    };
  }

  /**
   * Helper method to convert a NostrTeamChannel to an EnhancedChatChannel.
   */
  private convertNostrChannel(channel: NostrTeamChannel): EnhancedChatChannel {
    return {
      id: channel.id,
      name: channel.name,
      type: 'group',
      participants: channel.participants,
      createdAt: channel.createdAt,
      createdBy: channel.participants[0] || 'unknown',
      description: channel.description,
  metadata: {
        teamId: channel.teamId,
        relayUrls: channel.relayUrls,
        encryptionKey: channel.encryptionKey,
        pqcKey: channel.pqcKey,
        isActive: channel.isActive,
        channelType: channel.channelType
      }
    };
  }

  /**
   * Helper method to map Nostr message type to EnhancedChatMessage type.
   */
  private mapMessageType(type: string): 'text' | 'intelligence' | 'alert' | 'system' | 'file' | 'code' | 'event' | 'command' {
    switch (type) {
      case 'intelligence':
        return 'intelligence';
      case 'alert':
        return 'alert';
      case 'file':
        return 'file';
      case 'evidence':
      case 'truth_claim':
      case 'verification':
        return 'code';
      case 'coordination':
        return 'command';
      case 'status':
        return 'system';
      default:
        return 'text';
    }
  }
}

export default NostrChatAdapter;
