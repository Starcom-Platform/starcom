import React, { useState, useEffect } from 'react';
import styles from './DiscordWidget.module.css';
import { createLogger } from '@utils/logger';
import { formatCount } from '@utils/formatCount';
const log = createLogger({ prefix: 'DiscordWidget' });

interface DiscordWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

const DISCORD_CONFIG = {
  serverUrl: 'https://discord.gg/Mea5v8pQmt',
  serverId: '1145517675389403287', // Real Discord server ID
  serverName: 'Starcom Earth Alliance', // Will be replaced by real API data
  description: 'Join the Earth Alliance community for real-time intelligence sharing, mission coordination, and global security collaboration.',
  embedWidgetUrl: 'https://discord.com/widget?id=1145517675389403287&theme=dark', // Real Discord widget embed
};

interface DiscordMember {
  id: string;
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatar?: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  position: number;
}

interface DiscordWidgetData {
  name: string;
  instant_invite: string;
  channels: DiscordChannel[];
  members: DiscordMember[];
  presence_count: number;
}

const DiscordWidget: React.FC<DiscordWidgetProps> = ({ isOpen, onClose }) => {
  // What the public widget answered, from this widget's own request (plan
  // items 4.5 and 8.3b). A failure filled in a stand-in server with 0 online,
  // and the light read the stand-in: "Discord Uplink Online", in green.
  const [uplink, setUplink] = useState<'checking' | 'online' | 'failed'>('checking');
  const [failure, setFailure] = useState('');
  const [widgetData, setWidgetData] = useState<DiscordWidgetData | null>(null);
  const [totalMemberCount, setTotalMemberCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setUplink('checking');
      
      // Fetch both widget data and bot data in parallel for efficiency
      const fetchDiscordData = async () => {
        try {
          /**
           * The PUBLIC widget endpoint only. No credential.
           *
           * This also called discordBotService for a total member count,
           * which required a Discord BOT TOKEN — and a bot token grants
           * control of the bot, not read access to a number. Vite compiles
           * `VITE_*` values into the shipped bundle, so that token was
           * readable by anyone who opened devtools, and it was additionally
           * sent from every visitor's browser in an Authorization header.
           *
           * There is no client-side way to hold that safely: a build-time
           * secret in a static site is not a secret. Asking each USER for
           * their own Discord bot token would be worse, not better.
           *
           * So the total-member count is gone and the online count stays.
           * Losing a number is a small cost; publishing a credential that can
           * drive the community's bot is not a small risk.
           */
          const widgetResponse = await fetch(
            `https://discord.com/api/guilds/${DISCORD_CONFIG.serverId}/widget.json`,
          ).then(r => ({ status: 'fulfilled' as const, value: r }))
           .catch(reason => ({ status: 'rejected' as const, reason }));

          if (widgetResponse.status === 'fulfilled' && widgetResponse.value.ok) {
            const widgetResult: DiscordWidgetData = await widgetResponse.value.json();
            log.debug('Discord API response:', widgetResult);
            setWidgetData(widgetResult);
            setUplink('online');
          } else {
            log.debug('Discord widget API failed');
            setWidgetData(null);
            setFailure(widgetResponse.status === 'fulfilled' ? `HTTP ${widgetResponse.value.status}` : 'no answer');
            setUplink('failed');
          }

          // Total member count needs an authenticated call. Null rather than
          // estimated: an invented number beside real ones is worse than a
          // gap, and the surface already renders this as absent.
          setTotalMemberCount(null);
        } catch (error) {
          log.error('Discord data fetch error:', error);
          setWidgetData(null);
          setFailure('unreadable answer');
          setUplink('failed');
          setTotalMemberCount(null);
        }
      };

      fetchDiscordData().finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen]); // Removed onlineCount dependency to prevent excessive API calls

  const handleJoinServer = () => {
    window.open(DISCORD_CONFIG.serverUrl, '_blank');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#43b581';
      case 'idle': return '#faa61a';
      case 'dnd': return '#f04747';
      default: return '#747f8d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return '🟢';
      case 'idle': return '🟡';
      case 'dnd': return '🔴';
      default: return '⚫';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.discordWidget}>
      <div className={styles.header}>
        <div className={styles.title}>
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="currentColor"
            style={{ marginRight: '8px', color: '#ffffff' }}
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.446.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Discord
        </div>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close Discord widget"
        >
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Connecting to Discord server...</p>
          </div>
        ) : (
          <>
            {/* Server Info Section */}
            <div className={styles.serverSection}>
              <div className={styles.serverHeader}>
                <div className={styles.serverIcon}>
                  <svg 
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="currentColor"
                    style={{ color: '#ffffff' }}
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.446.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </div>
                <div className={styles.serverInfo}>
                  <h3>{widgetData?.name || DISCORD_CONFIG.serverName}</h3>
                  <p className={styles.memberCount}>
                    {totalMemberCount ? (
                      <>
                        {formatCount(totalMemberCount)} Total Members
                      </>
                    ) : (
                      'Discord Server'
                    )}
                  </p>
                </div>
                <div className={styles.statusIndicator}>
                  {uplink === 'online' ? (
                    <span className={styles.onlineStatus}>ONLINE</span>
                  ) : (
                    <span className={styles.errorStatus}>OFFLINE</span>
                  )}
                </div>
              </div>
              
              <p className={styles.serverDescription}>
                {DISCORD_CONFIG.description}
              </p>
              
              <div className={styles.actionButtons}>
                <button 
                  className={styles.actionButton}
                  onClick={handleJoinServer}
                >
                  Join Discord
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={() => {
                    navigator.clipboard?.writeText(DISCORD_CONFIG.serverUrl);
                  }}
                >
                  Share Invite
                </button>
              </div>
            </div>

            {/* Online Members */}
            {widgetData?.members && widgetData.members.length > 0 && (
              <div className={styles.membersSection}>
                <h3>
                  {(() => {
                    const onlineCount = widgetData?.presence_count || 0;
                    return onlineCount === 1 ? '1 Member Online' : `${onlineCount} Members Online`;
                  })()}
                </h3>
                <div className={styles.membersScrollContainer}>
                  <div className={styles.membersList}>
                    {widgetData.members.filter(m => m.status !== 'offline').slice(0, 12).map(member => (
                      <div key={member.id} className={styles.memberItem}>
                        <div 
                          className={styles.memberStatus}
                          style={{ backgroundColor: getStatusColor(member.status) }}
                        >
                          {getStatusIcon(member.status)}
                        </div>
                        <span className={styles.memberName}>{member.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.uplinkIndicator}>
          <span className={uplink === 'online' ? styles.glowingGreenDot : uplink === 'failed' ? styles.glowingRedDot : styles.greyDot}></span>
          <span>
            {uplink === 'online' ? 'Discord Uplink Online' : uplink === 'failed' ? `Discord unavailable (${failure})` : 'Checking Discord…'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DiscordWidget;
