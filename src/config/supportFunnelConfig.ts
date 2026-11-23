import { DebugCategory, debugLogger } from '../utils/debugLogger';

const SUPPORT_FUNDRAISER_URL = 'https://gofund.me/d8575cf83';

export type SupportFunnelConfig = {
  enabled: boolean;
  fundraiserUrl: string;
  nostrUrl: string;
  inviteCopy: string;
  snoozeDays: number;
  learnMoreSource: 'accordion' | 'route';
  experimentEnabled: boolean;
  experimentVariant: string | null;
  experimentVariants: string[];
};

/**
 * A static map, not a computed key.
 *
 * `import.meta.env[key]` cannot be substituted per-variable, so Vite answers it
 * by emitting the WHOLE env object into the bundle — every VITE_ variable
 * present at build time, not just the ones this app reads. That is how a
 * Discord bot token, a Telegram bot token and a Censys secret reached the
 * shipped JavaScript without a single line of code referencing them.
 *
 * Written out, each entry is a static member access that Vite replaces
 * individually, which makes this list an allowlist by construction: a variable
 * absent from it cannot reach the bundle. src/config/env.ts states the same
 * rule for the same reason.
 */
const SUPPORT_FUNNEL_ENV: Record<string, string | undefined> = {
  VITE_SUPPORT_FUNNEL_ENABLED: import.meta.env.VITE_SUPPORT_FUNNEL_ENABLED,
  VITE_SUPPORT_FUNNEL_SNOOZE_DAYS: import.meta.env.VITE_SUPPORT_FUNNEL_SNOOZE_DAYS,
  VITE_SUPPORT_FUNNEL_FUND_URL: import.meta.env.VITE_SUPPORT_FUNNEL_FUND_URL,
  VITE_SUPPORT_FUNNEL_NOSTR_URL: import.meta.env.VITE_SUPPORT_FUNNEL_NOSTR_URL,
  VITE_SUPPORT_FUNNEL_INVITE_COPY: import.meta.env.VITE_SUPPORT_FUNNEL_INVITE_COPY,
  VITE_SUPPORT_FUNNEL_EXPERIMENT_ENABLED: import.meta.env.VITE_SUPPORT_FUNNEL_EXPERIMENT_ENABLED,
  VITE_SUPPORT_FUNNEL_VARIANT: import.meta.env.VITE_SUPPORT_FUNNEL_VARIANT,
  VITE_SUPPORT_FUNNEL_VARIANTS: import.meta.env.VITE_SUPPORT_FUNNEL_VARIANTS,
};

function getEnvFlag(key: string): string | undefined {
  return SUPPORT_FUNNEL_ENV[key];
}

function isProd(): boolean {
  try {
    return import.meta.env.MODE === 'production';
  } catch {
    return false;
  }
}

function sanitizeFundraiserUrl(url: string | undefined): string {
  const candidate = (url || '').trim();
  if (!candidate) {
    return SUPPORT_FUNDRAISER_URL;
  }

  const lower = candidate.toLowerCase();
  if (lower.includes('fund.starcom.app')) {
    return SUPPORT_FUNDRAISER_URL;
  }

  return candidate;
}

export function getSupportFunnelConfig(): SupportFunnelConfig {
  const envEnabled = getEnvFlag('VITE_SUPPORT_FUNNEL_ENABLED');
  const envSnooze = getEnvFlag('VITE_SUPPORT_FUNNEL_SNOOZE_DAYS');
  const envFundUrl = getEnvFlag('VITE_SUPPORT_FUNNEL_FUND_URL');
  const envNostrUrl = getEnvFlag('VITE_SUPPORT_FUNNEL_NOSTR_URL');
  const envInviteCopy = getEnvFlag('VITE_SUPPORT_FUNNEL_INVITE_COPY');
  const envExperimentEnabled = getEnvFlag('VITE_SUPPORT_FUNNEL_EXPERIMENT_ENABLED');
  const envExperimentVariant = getEnvFlag('VITE_SUPPORT_FUNNEL_VARIANT');
  const envExperimentVariants = getEnvFlag('VITE_SUPPORT_FUNNEL_VARIANTS');

  const prod = isProd();

  const fundraiserUrl = sanitizeFundraiserUrl(envFundUrl);

  const nostrUrl = envNostrUrl || 'https://navcom.app/ops/starcom';
  const inviteCopy = envInviteCopy || 'https://navcom.app/ops/starcom';

  const snoozeDaysRaw = envSnooze ? parseInt(envSnooze, 10) : 30;
  const snoozeDays = Number.isFinite(snoozeDaysRaw) ? Math.min(Math.max(snoozeDaysRaw, 7), 45) : 30;

  const enabled = envEnabled === 'true' || (!prod && envEnabled !== 'false');
  const experimentEnabled = envExperimentEnabled === 'true' || (!prod && envExperimentEnabled !== 'false');
  const experimentVariant = (envExperimentVariant || '').trim() || null;
  const experimentVariants = (envExperimentVariants || 'baseline_v1')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (experimentVariant && !experimentVariants.includes(experimentVariant)) {
    experimentVariants.push(experimentVariant);
  }

  const config: SupportFunnelConfig = {
    enabled,
    fundraiserUrl,
    nostrUrl,
    inviteCopy,
    snoozeDays,
    learnMoreSource: 'accordion',
    experimentEnabled,
    experimentVariant,
    experimentVariants,
  };

  debugLogger.info(DebugCategory.COMPONENT_LOAD, 'Support funnel config resolved', config, true);
  return config;
}
