import React, { useState, useEffect } from 'react';
import { getVersionStatus } from '../../utils/version';
import UtcTime from '../Shared/UtcTime';
import styles from './GitHubWidget.module.css';

interface GitHubWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_CONFIG = {
  repoUrl: 'https://github.com/Starcom-Platform/starcom',
  repoOwner: 'Starcom-Platform',
  repoName: 'starcom',
  communityGoal: 100 // Target star count
};

const GitHubWidget: React.FC<GitHubWidgetProps> = ({ isOpen, onClose }) => {
  /*
   * Counts are `number | null`, and null means "GitHub did not tell us" —
   * never zero, which is a real and different answer. Spelled out because
   * tsconfig.app.json sets "strict": false, so nothing in the build will catch
   * a null flowing into a slot that expected a number.
   */
  const [repoStats, setRepoStats] = useState<{
    stars: number | null;
    forks: number | null;
    watchers: number | null;
    issues: number | null;
    latestRelease: string;
    lastCommit: string | null;
    language: string | null;
  }>({
    // Before the fetch there is nothing to report. Zero would be a claim.
    stars: null,
    forks: null,
    watchers: null,
    latestRelease: '',
    lastCommit: null,
    language: null,
    issues: null
  });
  const [isLoading, setIsLoading] = useState(true);
  /*
   * Whether GitHub actually answered. The indicator used to test
   * `repoStats.stars !== undefined`, which was true of every state the
   * component could be in — including both fallbacks — so it read "Github
   * Uplink Online" while showing invented numbers. It is set from the fetch
   * now, which is the only thing that knows.
   */
  const [uplinkOnline, setUplinkOnline] = useState(false);
  const versionStatus = getVersionStatus();

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      
      // Fetch GitHub repo statistics
      const fetchRepoStats = async () => {
        try {
          const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.repoOwner}/${GITHUB_CONFIG.repoName}`);
          const data = await response.json();
          
          if (response.ok) {
            setUplinkOnline(true);
            setRepoStats({
              stars: data.stargazers_count || 0,
              forks: data.forks_count || 0,
              watchers: data.watchers_count || 0,
              issues: data.open_issues_count || 0,
              latestRelease: versionStatus.display ?? '',
              lastCommit: data.updated_at || null,
              language: data.language || 'TypeScript'
            });
          } else {
            setUplinkOnline(false);
            /*
             * GitHub answered, but not with data. This used to substitute
             * stars: 12, forks: 3, watchers: 8, issues: 2 — invented numbers,
             * labelled "for demo", rendered as this repository's real
             * statistics. That is the fabrication this project has spent a lot
             * of effort removing from its HUD panels, sitting in a widget
             * about the project itself.
             *
             * Nothing is substituted now. The counts stay null and the widget
             * says the numbers are unavailable, which is true and checkable.
             * Version and build come from the build, not from GitHub, so they
             * are still shown.
             */
            setRepoStats({
              stars: null,
              forks: null,
              watchers: null,
              issues: null,
              latestRelease: versionStatus.display ?? '',
              lastCommit: null,
              language: null
            });
          }
        } catch (_error) {
          setUplinkOnline(false);
          // Unreachable network. Same rule as above: absent, not invented.
          setRepoStats({
            stars: null,
            forks: null,
            watchers: null,
            issues: null,
            latestRelease: versionStatus.display ?? '',
            lastCommit: null,
            language: null
          });
        } finally {
          setIsLoading(false);
        }
      };
      
      // Add slight delay for better UX
      setTimeout(fetchRepoStats, 800);
    }
  }, [isOpen, versionStatus.display]);

  const handleViewIssues = () => {
    window.open(`${GITHUB_CONFIG.repoUrl}/`, '_blank');
  };

  const handleContribute = () => {
    window.open(`${GITHUB_CONFIG.repoUrl}/discussions/`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className={styles.githubWidget}>
      <div className={styles.header}>
        <div className={styles.title}>
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="currentColor"
            style={{ marginRight: '8px', color: '#ffffff' }}
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Github
        </div>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close GitHub widget"
        >
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Connecting to repository...</p>
          </div>
        ) : (
          <>
            {/* Repository Section - Main Container like Discord/Telegram */}
            <div className={styles.repoSection}>
              <div className={styles.repoHeader}>
                <div className={styles.repoIcon}>📂</div>
                <div className={styles.repoInfo}>
                  <h3>Starcom App</h3>
                  <p className={styles.repoPath}>{GITHUB_CONFIG.repoOwner}/{GITHUB_CONFIG.repoName}</p>
                </div>
                {repoStats.language && (
                  <div className={styles.languageBadge}>{repoStats.language}</div>
                )}
              </div>

              {/* Stats Grid - Clean 2x2 layout */}
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statNumber}>{repoStats.stars ?? '—'}</span>
                  <span className={styles.statLabel}>Stars</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statNumber}>{repoStats.forks ?? '—'}</span>
                  <span className={styles.statLabel}>Forks</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statNumber}>{repoStats.watchers ?? '—'}</span>
                  <span className={styles.statLabel}>Watchers</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statNumber}>{repoStats.issues ?? '—'}</span>
                  <span className={styles.statLabel}>Issues</span>
                </div>
              </div>

              {/* Activity Section - Clean single line */}
              <div className={styles.activitySection}>
                <span className={styles.activityIcon}>📝</span>
                <span className={styles.activityText}>
                  {repoStats.lastCommit
                    ? <>Last updated: <UtcTime at={repoStats.lastCommit} year /></>
                    : 'Last updated: unavailable'}
                </span>
              </div>

              {/* Action Buttons - Integrated like Discord/Telegram */}
              <div className={styles.actionButtons}>
                <button 
                  className={styles.actionButton}
                  onClick={handleViewIssues}
                >
                  Codebase 💻
                </button>
                <button 
                  className={styles.actionButton}
                  onClick={handleContribute}
                >
                  Community 👩🏽‍💻
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.uplinkIndicator}>
          <span className={!isLoading && uplinkOnline ? styles.glowingGreenDot : styles.glowingRedDot}></span>
          <span>
            {!isLoading && uplinkOnline ? 'Github Uplink Online' : 'Uplink Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GitHubWidget;
