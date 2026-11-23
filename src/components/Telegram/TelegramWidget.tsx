import React, { useState, useEffect } from 'react';
import styles from './TelegramWidget.module.css';
import { env } from '../../config/env';
import { createLogger } from '@utils/logger';
import { formatCount } from '@utils/formatCount';
const log = createLogger({ prefix: 'TelegramWidget' });

// Runtime config injection interface (for dApp embeddings that can't use build-time env vars)
declare global {
  interface Window {
    STARCOM_TELEGRAM_CONFIG?: {
      botToken?: string;
      channelId?: string;
    };
  }
  interface ImportMetaEnv {
    VITE_TELEGRAM_CHANNEL_ID?: string;
  }
}

interface TelegramWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TelegramChatInfo {
  id: number;
  title: string;
  description?: string;
  username?: string;
  member_count?: number;
  type: string;
}

// HARD-CODED / OBFUSCATED FALLBACKS
// NOTE: This is only light obfuscation (not real security). It deters trivial scraping of a plain string.
// Real protection requires a server proxy so the token never reaches the client.
// Steps to update with real token (example key=7):
//   1. In a local Node REPL or browser console run:
//        const key=7; const t='123456789:ABCdefREALTOKEN'; t.split('').map(c=>c.charCodeAt(0)^key)
//   2. Replace the BOT_TOKEN_SEGMENTS array below with the resulting numbers.
//   3. A bot token must NOT be supplied via VITE_* — those are compiled into
//      the shipped bundle. Runtime injection only. See resolveBotTokenLazy.
//   4. Rotate occasionally.
// Using shard-based approach (see src/config/telegramShards.ts)

// Channel ID can still be a plain string since it's not sensitive; keep placeholder for detection.
const HARDCODED_CHANNEL_ID = 'your_real_channel_id_here'; // TODO: replace with real channel id e.g. -1001234567890


/**
 * The bot token comes from RUNTIME CONFIG ONLY.
 *
 * It previously had three sources, and two of them published it:
 *
 *  - `VITE_TELEGRAM_BOT_TOKEN`, which Vite compiles into the shipped bundle.
 *  - An obfuscation scheme — XOR-encoded shards assembled behind an
 *    interaction gate, a randomised delay and honeypot tokens.
 *
 * The obfuscation cannot work, and it is worth saying why rather than just
 * deleting it. Everything needed to reassemble the token ships alongside it:
 * the shards, the key, and the function that combines them. Anything the
 * browser can assemble, so can anyone who opens the console and calls the same
 * function. The interaction gate and the delay slow a casual reader and do
 * nothing at all to a determined one. The cost of that machinery is not
 * neutral: it makes a public value FEEL protected, which is worse than leaving
 * it plainly public, because it invites someone to put a real token there.
 *
 * A bot token grants control of the bot. There is no client-side way to hold
 * one, and bring-your-own-key does not help either — asking each visitor to
 * paste their own would multiply the exposure rather than remove it.
 *
 * So: `window.STARCOM_TELEGRAM_CONFIG` only, which an operator injects at
 * runtime and which is therefore never in the bundle.
 *
 * WHAT THIS STILL DOES NOT FIX, stated plainly because it would otherwise look
 * solved: Telegram takes the token in the URL PATH, so even a runtime-injected
 * token appears in browser history, referrer headers and any intermediary's
 * logs the moment a request is made. Runtime injection removes the bundle
 * exposure, not the request exposure. The correct answer is a server-side
 * proxy that holds the token and exposes only a member count. Until that
 * exists, an operator enabling this should treat the token as compromised on
 * use and scope it accordingly.
 */
let botTokenCache: string | null = null;

async function resolveBotTokenLazy(): Promise<string> {
  if (botTokenCache) return botTokenCache;
  const injected = typeof window !== 'undefined'
    ? window.STARCOM_TELEGRAM_CONFIG?.botToken?.trim()
    : undefined;
  botTokenCache = injected || '';
  return botTokenCache;
}

// Placeholder indicates pending lazy resolution
const resolvedBotToken = 'PENDING_INTERACTION';

const resolvedChannelId = (typeof window !== 'undefined' && window.STARCOM_TELEGRAM_CONFIG?.channelId?.trim())
  || env.telegramChannelId
  || HARDCODED_CHANNEL_ID;

// Unified Telegram configuration object
const TELEGRAM_CONFIG = {
  channelUrl: 'https://t.me/starcomintelgroup',
  channelUsername: '@starcomintelgroup',
  botToken: resolvedBotToken,
  channelId: resolvedChannelId,
};

const TelegramWidget: React.FC<TelegramWidgetProps> = ({ isOpen, onClose }) => {
  const [chatInfo, setChatInfo] = useState<TelegramChatInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRealData, setHasRealData] = useState(false);
  const [lastMemberCount, setLastMemberCount] = useState<number | null>(null);

  // Fetch real Telegram data
  const fetchTelegramData = async () => {
    // Determine if configuration still uses placeholders (all sources missing or still tagged)
    const missingToken = !TELEGRAM_CONFIG.botToken 
      || TELEGRAM_CONFIG.botToken === 'PENDING_INTERACTION'
      || TELEGRAM_CONFIG.botToken.includes('your_real_bot_token_here')
      || TELEGRAM_CONFIG.botToken.includes('PLACEHOLDER_TOKEN');
    const missingChannel = !TELEGRAM_CONFIG.channelId || TELEGRAM_CONFIG.channelId.includes('your_real_channel_id_here');
    if (missingToken || missingChannel) {
      setError('Bot credentials not configured');
      setIsLoading(false);
      return; // Abort real fetch until configured
    }

    try {
      setError(null);
      
      // Resolve (may wait for interaction + random delay)
      const realToken = await resolveBotTokenLazy();
      if (!realToken) {
        setError('Bot credentials not configured');
        setIsLoading(false);
        return;
      }
      TELEGRAM_CONFIG.botToken = realToken;
      const chatResponse = await fetch(`https://api.telegram.org/bot${realToken}/getChat?chat_id=${TELEGRAM_CONFIG.channelId}`);
      const chatData = await chatResponse.json();
      
      if (chatData.ok) {
        setChatInfo(chatData.result);
        setHasRealData(true);
      } else {
        throw new Error(`Telegram API error: ${chatData.description}`);
      }

      // Get member count (separate call for channels)
  const memberResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/getChatMemberCount?chat_id=${TELEGRAM_CONFIG.channelId}`);
      const memberData = await memberResponse.json();
      
      if (memberData.ok && chatData.result) {
        const newMemberCount = memberData.result;
        setLastMemberCount(prev => prev); // Keep track of previous count
        setChatInfo(prev => prev ? { ...prev, member_count: newMemberCount } : null);
        setLastMemberCount(newMemberCount);
      }

    } catch (err) {
      log.error('Failed to fetch Telegram data:', err);
      setError('Failed to connect to Telegram');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchTelegramData();
    }
  }, [isOpen]);

  // Real-time member count updates
  useEffect(() => {
    if (!isOpen || !hasRealData) return;

    const updateMemberCount = async () => {
      try {
  const realToken = botTokenCache || (await resolveBotTokenLazy());
  if (!realToken) return; // nothing injected at runtime; stay quiet rather than guess
  const memberResponse = await fetch(`https://api.telegram.org/bot${realToken}/getChatMemberCount?chat_id=${TELEGRAM_CONFIG.channelId}`);
        const memberData = await memberResponse.json();
        
        if (memberData.ok) {
          const newCount = memberData.result;
          setChatInfo(prev => {
            if (prev && prev.member_count !== newCount) {
              // Member count changed - update with visual feedback
              setLastMemberCount(prev.member_count || 0);
              return { ...prev, member_count: newCount };
            }
            return prev;
          });
        }
      } catch (_err) {
        // Silently fail - don't disrupt user experience
      }
    };

    // Update member count every 30 seconds
    const interval = setInterval(updateMemberCount, 30000);
    return () => clearInterval(interval);
  }, [isOpen, hasRealData]);

  const handleJoinChannel = () => {
    window.open(TELEGRAM_CONFIG.channelUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className={styles.telegramWidget}>
      <div className={styles.header}>
        <div className={styles.title}>
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="currentColor"
            style={{ marginRight: '8px', color: '#ffffff' }}
          >
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Telegram
        </div>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close Telegram widget"
        >
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Connecting to Telegram API...</p>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <p>⚠️ {error}</p>
            {error.includes('placeholder') ? (
              <div className={styles.configInstructions}>
                <p className={styles.helpText}>
                  <strong>Setup Required:</strong>
                </p>
                {/* These instructions used to tell the operator to put the bot
                    token in .env.local as VITE_TELEGRAM_BOT_TOKEN — which Vite
                    compiles into the shipped bundle, publishing it. The screen
                    that explains how to configure a thing is the last place
                    that should recommend the unsafe way to do it. */}
                <ol className={styles.setupSteps}>
                  <li>Contact @BotFather on Telegram</li>
                  <li>Get a bot token for @starcomintel_bot</li>
                  <li>Get the channel ID for @starcomintelgroup</li>
                  <li>Inject them at runtime — never as a <code>VITE_</code> variable</li>
                </ol>
                <div className={styles.envExample}>
                  <code>window.STARCOM_TELEGRAM_CONFIG = {'{'} botToken, channelId {'}'}</code>
                </div>
                <p className={styles.helpText}>
                  A bot token grants control of the bot, and anything in a{' '}
                  <code>VITE_</code> variable is compiled into the public bundle.
                  Telegram also takes the token in the URL, so it reaches browser
                  history and proxy logs, even at runtime. Only a server-side
                  proxy holds it safely.
                </p>
              </div>
            ) : (
              <p className={styles.helpText}>
                Check bot permissions and channel access
              </p>
            )}
            <button 
              className={styles.primaryButton}
              onClick={handleJoinChannel}
            >
              📱 Join Channel Manually
            </button>
          </div>
        ) : (
          <>
            {/* Real Channel Info */}
            {chatInfo && (
              <div className={styles.channelSection}>
                <div className={styles.channelHeader}>
                  <div className={styles.channelInfo}>
                    <h3>{chatInfo.title}</h3>
                    <p className={styles.memberCount}>
                      {chatInfo.member_count ? (
                        <>
                          <span className={lastMemberCount !== null && lastMemberCount !== chatInfo.member_count ? styles.memberCountUpdated : ''}>
                            {formatCount(chatInfo.member_count)} members
                          </span>
                          {lastMemberCount !== null && lastMemberCount !== chatInfo.member_count && (
                            <span className={styles.memberChange}>
                              {chatInfo.member_count > lastMemberCount ? ' 📈' : ' 📉'}
                            </span>
                          )}
                        </>
                      ) : (
                        'Private group'
                      )}
                    </p>
                    <p className={styles.channelId}>
                      {TELEGRAM_CONFIG.channelUsername}
                    </p>
                  </div>
                </div>
                
                {chatInfo.description && (
                  <p className={styles.channelDescription}>
                    {chatInfo.description}
                  </p>
                )}
                
                <button 
                  className={styles.primaryButton}
                  onClick={handleJoinChannel}
                >
                  🔗 Join Channel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.uplinkIndicator}>
          <span className={hasRealData ? styles.glowingGreenDot : styles.glowingRedDot}></span>
          <span>
            {hasRealData ? 'Telegram Uplink Online' : 'Uplink Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TelegramWidget;
