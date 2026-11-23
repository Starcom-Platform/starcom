import React, { useState, useRef, useEffect } from 'react';
import { useSecureChat } from '../../communication/context/useSecureChat';
import { SecureChatWindow as ChatWindow, ThreatLevel, SecureMessage } from '../../types/SecureChat';
import { wrapChatError, isNetworkError } from '../../lib/chat/errors/ChatErrors';
import { lookAt } from '../../services/chat/chatUnread';
import { hudError, hudInfo } from '../../utils/hudNotifications';
import styles from './SecureChatWindow.module.css';
import UtcTime from '../Shared/UtcTime';
import Translatable from '../Translation/Translatable';
import WhatIs from '../Help/WhatIs';

interface SecureChatWindowProps {
  chatWindow: ChatWindow;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

const SecureChatWindow: React.FC<SecureChatWindowProps> = ({
  chatWindow,
  onClose,
  onMinimize,
  onMaximize
}) => {
  const { state, sendMessage: adapterSend, connectionStatus, channels, activeChannelId, switchChannel, refreshChannels, addMessage, updateMessageStatus } = useSecureChat();
  const [message, setMessage] = useState('');
  const [showChannelSidebar, setShowChannelSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatWindow.messages]);

  // Open and not minimized, this window is where its messages are read (plan item 9.12).
  useEffect(
    () => (chatWindow.isMinimized ? undefined : lookAt(`dm:${chatWindow.contact.pubkey}`)),
    [chatWindow.isMinimized, chatWindow.contact.pubkey],
  );

  // Focus input when window opens
  useEffect(() => {
    if (chatWindow.isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chatWindow.isActive]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      // Build local SecureMessage for immediate UI feedback
      const newMessage: SecureMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        chatId: chatWindow.id,
        encryptedContent: message.trim(),
        content: message.trim(),
        messageType: 'text',
        isOutgoing: true,
        // Not known until the send reports it. This was `true` with
        // "CRYSTALS-Kyber-1024" on every message, while the text went out in
        // plain text whenever the recipient's key bundle was not found.
        isEncrypted: false,
        deliveryStatus: 'sending',
        senderPubkey: chatWindow.contact.pubkey,
        senderSignature: '',
        encryptionAlgorithm: 'CRYSTALS-Kyber-1024',
        timestampHash: `hash-${Date.now()}`,
        isVerified: false,
        authenticityScore: 0,
        timestamp: new Date(),
        sentAt: new Date(),
        relayNodes: []
      };

      // Optimistic local push so the user sees the message immediately.
      // Dispatched through the context (not a direct array mutation) so
      // React actually re-renders when the status below changes.
      addMessage(chatWindow.id, newMessage);
      const content = message.trim();
      setMessage('');

      // Route through the adapter for real relay delivery
      try {
        const sent = await adapterSend(chatWindow.id, content);
        updateMessageStatus(chatWindow.id, newMessage.id, 'sent', sent?.encrypted === true, sent?.postQuantum === true);
      } catch (adapterErr) {
        const wrapped = wrapChatError('MESSAGE_SEND_FAILED', adapterErr, { channelId: chatWindow.id });
        console.warn('[SecureChat] Adapter send failed:', wrapped.code, wrapped.message);

        /*
         * Queued only when the browser is offline (plan item 9.4). Every failure
         * is wrapped as a network error, so every failed message was queued AND
         * marked failed with a retry: a retry sent it, and the queue sent it
         * again once the browser came online. A queued message has no retry, and
         * is marked sent when the queue sends it; one that failed while online
         * is failed, with its retry, and nothing else sends it.
         */
        let queued = false;
        if (isNetworkError(wrapped) && typeof navigator !== 'undefined' && navigator.onLine === false) {
          try {
            const { OfflineQueue } = await import('../../lib/chat/OfflineQueue');
            await new OfflineQueue().enqueue(chatWindow.id, content, undefined, newMessage.id);
            queued = true;
          } catch { /* not queued: shown as failed, with its retry */ }
        }
        if (queued) {
          updateMessageStatus(chatWindow.id, newMessage.id, 'queued');
          hudInfo('Message queued', 'You are offline. It sends when you are back online.');
        } else {
          updateMessageStatus(chatWindow.id, newMessage.id, 'failed');
          hudError('Message Failed to Send', wrapped.message);
        }
      }

    } catch (error) {
      const wrapped = wrapChatError('MESSAGE_SEND_FAILED', error);
      console.error('Failed to send secure message:', wrapped.code, wrapped.message);
      hudError('Message Failed to Send', wrapped.message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getThreatLevelColor = (level: ThreatLevel) => {
    switch (level) {
      case 'normal': return '#4ade80'; // green
      case 'elevated': return '#facc15'; // yellow
      case 'high': return '#f97316'; // orange
      case 'critical': return '#ef4444'; // red
      default: return '#6b7280'; // gray
    }
  };

  const getSecurityIcon = () => {
    if (state.emergencyMode) return '🚨';
    if (state.stealthMode) return '👁️';
    return '🛡️';
  };

  return (
    <div 
      className={`${styles.chatWindow} ${chatWindow.isMinimized ? styles.minimized : ''} ${chatWindow.isMaximized ? styles.maximized : ''}`}
      style={{ 
        zIndex: chatWindow.zIndex,
        left: chatWindow.position.x,
        top: chatWindow.position.y,
        width: chatWindow.size.width,
        height: chatWindow.size.height
      }}
    >
      {/* Header — data-drag-handle is what SecureChatManager's drag handler
          looks for (a plain attribute rather than this file's own
          CSS-module class, since that class name is hashed per-file and
          SecureChatManager can't reference it directly). */}
      <div className={styles.header} data-drag-handle="true">
        <div className={styles.contactInfo}>
          <div className={styles.avatar}>
            {chatWindow.contact.avatar ? (
              <img src={chatWindow.contact.avatar} alt={chatWindow.contact.displayName} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {chatWindow.contact.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className={styles.contactDetails}>
            <span className={styles.contactName}>{chatWindow.contact.displayName}</span>
            <div className={styles.statusIndicators}>
              <span 
                className={styles.onlineStatus}
                style={{ color: chatWindow.contact.isOnline ? '#4ade80' : '#6b7280' }}
              >
                {chatWindow.contact.isOnline ? '● Online' : '○ Offline'}
              </span>
              <span 
                className={styles.threatLevel}
                style={{ color: getThreatLevelColor(state.globalThreatLevel) }}
              >
                {getSecurityIcon()} {state.globalThreatLevel.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        
        <div className={styles.headerControls}>
          {/* A trust percentage stood here, the same made-up 60% on everyone
              added by hand. Starcom scores nobody (refusal R-6). */}
          <button 
            className={styles.headerButton}
            onClick={onMinimize}
            title="Minimize"
          >
            ─
          </button>
          <button 
            className={styles.headerButton}
            onClick={onMaximize}
            title={chatWindow.isMaximized ? "Restore" : "Maximize"}
          >
            {chatWindow.isMaximized ? '❐' : '□'}
          </button>
          <button 
            className={styles.headerButton}
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
          <button
            className={styles.headerButton}
            onClick={() => { setShowChannelSidebar(s => !s); refreshChannels(); }}
            title="Channels"
          >
            #
          </button>
        </div>
      </div>

      {/* Messages Area */}
      {!chatWindow.isMinimized && (
        <>
          {connectionStatus !== 'connected' && (
            <div style={{ background: connectionStatus === 'connecting' ? '#92400e' : '#7f1d1d', color: '#fff', textAlign: 'center', padding: '4px 8px', fontSize: '0.75rem' }}>
              {connectionStatus === 'connecting' ? '⟳ Reconnecting…' : '⚠ Disconnected — messages will be queued'}
            </div>
          )}
          {showChannelSidebar && (
            <div className={styles.channelSidebar}>
              <div className={styles.channelSidebarHeader}>
                <span>Channels</span>
              </div>
              <div className={styles.channelList}>
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    className={`${styles.channelItem} ${ch.id === activeChannelId ? styles.activeChannel : ''}`}
                    onClick={() => switchChannel(ch.id)}
                  >
                    # {ch.name}
                  </button>
                ))}
              </div>
              {/* No new channels: a channel message cannot be sealed, so none is sent (legal question E1). */}
              <p className={styles.channelCreate} data-testid="channels-not-sealed">
                Channels are not sealed, so nothing is sent to them. Message a person, or write in your team&apos;s chat.
              </p>
            </div>
          )}
          <div className={styles.messagesContainer}>
            <div className={styles.messages}>
              {chatWindow.messages.map((msg, index) => (
                <div 
                  key={index}
                  className={`${styles.message} ${msg.isOutgoing ? styles.outgoing : styles.incoming}`}
                >
                  <div className={styles.messageContent}>
                    <div className={styles.messageText}>{msg.content}</div>
                    {/* Their words in the language shown, on this device only: chat is sealed, never Public (ML6).
                        Not offered on your own words, nor on a message that could not be opened. */}
                    {!msg.isOutgoing && msg.isEncrypted && <Translatable text={msg.content} testId={`chat-translate-${msg.id}`} />}
                    <div className={styles.messageMetadata}>
                      <span className={styles.timestamp}>
                        <UtcTime at={msg.timestamp} />
                      </span>
                      {msg.isOutgoing && (
                        <span
                          className={styles.deliveryStatus}
                          title={msg.deliveryStatus === 'queued' ? 'Queued: sends when you are back online' : undefined}
                        >
                          {msg.deliveryStatus === 'delivered' ? '✓✓' : 
                           msg.deliveryStatus === 'sent' ? '✓' :
                           msg.deliveryStatus === 'failed' ? '✗' : '⏳'}
                        </span>
                      )}
                      {msg.isOutgoing && msg.deliveryStatus === 'failed' && (
                        <button
                          className={styles.headerButton}
                          title="Retry send"
                          onClick={async () => {
                            try {
                              updateMessageStatus(chatWindow.id, msg.id, 'sending');
                              const sent = await adapterSend(chatWindow.id, msg.content || '');
                              updateMessageStatus(chatWindow.id, msg.id, 'sent', sent?.encrypted === true, sent?.postQuantum === true);
                            } catch (retryErr) {
                              const wrapped = wrapChatError('RETRY_FAILED', retryErr);
                              console.warn('[SecureChat] Retry failed:', wrapped.code);
                              updateMessageStatus(chatWindow.id, msg.id, 'failed');
                              hudError('Retry Failed', wrapped.message);
                            }
                          }}
                        >
                          ↻
                        </button>
                      )}
                      {msg.isEncrypted && msg.postQuantum ? (
                        <span className={styles.encryptionIndicator} title={msg.isOutgoing ? 'Sealed to them, post-quantum (ML-KEM-768)' : 'Sealed to you, post-quantum (ML-KEM-768)'}>
                          🔒
                        </span>
                      ) : msg.isEncrypted ? (
                        <span
                          className={styles.encryptionIndicator}
                          title={msg.isOutgoing
                            ? 'Sealed to them with NIP-44: they have published no post-quantum key'
                            : 'Sealed to you with NIP-44: the sender found no post-quantum key of yours'}
                        >
                          🔒 <span className={styles.plainIndicator}>not post-quantum</span> <WhatIs term="post-quantum" />
                        </span>
                      ) : msg.isOutgoing && (msg.deliveryStatus === 'sent' || msg.deliveryStatus === 'delivered') && (
                        <span className={styles.plainIndicator} title="This message crossed the relays as plain text">
                          Not encrypted
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className={styles.inputContainer}>
            <div className={styles.inputArea}>
              {/* No attachment until it can be encrypted (plan 9.1, decision G1): the
                  paperclip here put the plain file on public IPFS, outside the review. */}
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className={styles.messageInput}
                disabled={state.emergencyMode}
              />
              <button 
                onClick={handleSendMessage}
                className={styles.sendButton}
                disabled={!message.trim() || state.emergencyMode}
              >
                Send
              </button>
            </div>
            {/* Security Status Bar */}
            <div className={styles.securityStatus}>
              <div className={styles.securityIndicators}>
                <span className={styles.nostrStatus} title="Nostr Network">
                  📡 {state.networkStatus.relayNodes} relays
                </span>
                <span className={styles.ipfsStatus} title="IPFS Network">
                  🌐 IPFS: {state.networkStatus.ipfsNodes ? 'active' : 'inactive'}
                </span>
              </div>
              
              {state.emergencyMode && (
                <div className={styles.emergencyNotice}>
                  🚨 EMERGENCY MODE - Communications restricted
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SecureChatWindow;
