/**
 * Unified API Configuration Manager
 * 
 * Centralized configuration system for all OSINT and external APIs.
 * Handles environment variables, API key validation, and service health checking.
 * 
 * @author GitHub Copilot
 * @date July 11, 2025
 */

import { sourceAllowed } from '../../legal/buildProfile';
import { rawEnv } from '../../config/env';
import { LoggerFactory } from '../../applications/netrunner/services/logging';
import { resolveCredential, type ResolvedCredential } from './userCredentialStore';

const logger = LoggerFactory.getLogger('UnifiedApiConfig');

export interface ApiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiId?: string;
  secret?: string;
  enabled: boolean;
  rateLimit: number;
  timeout: number;
  requiresAuth: boolean;
}

export interface UnifiedApiConfig {
  // OSINT Tools
  shodan: ApiProviderConfig;
  virustotal: ApiProviderConfig;
  censys: ApiProviderConfig;
  hunter: ApiProviderConfig;
  theharvester: ApiProviderConfig;
  
  // Working External APIs
  weather: ApiProviderConfig;
  financial: ApiProviderConfig;
  conflicts: ApiProviderConfig;
  
  // Internal APIs
  // `starcom` and `osint` removed — declared endpoints on a host that does not
  // resolve, read by nothing. See the note where they were constructed.
  
  // System Configuration
  enableRealApis: boolean;
  debugMode: boolean;
  mockFallback: boolean;
}

class UnifiedApiConfigManager {
  private static instance: UnifiedApiConfigManager;
  private config: UnifiedApiConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  public static getInstance(): UnifiedApiConfigManager {
    if (!UnifiedApiConfigManager.instance) {
      UnifiedApiConfigManager.instance = new UnifiedApiConfigManager();
    }
    return UnifiedApiConfigManager.instance;
  }

  private loadConfiguration(): UnifiedApiConfig {
    // Helper function to get environment variable from either Vite or Node.js
  const getEnvVar = (key: string): string | undefined => {
      // In Vite environment (client-side)
      // NOTE: do not guard this on `import.meta.env` being truthy. Referencing
      // the object as a whole — even just to test it — forces Vite to
      // materialise every environment variable into the bundle, which is
      // exactly what published a Telegram bot token that no code referenced.
      // rawEnv is a curated map of static accesses and is always defined.
      {
    const val = rawEnv[key] as unknown;
    if (typeof val === 'string') return val;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    return undefined;
      }
      // In Node.js environment (server-side/testing)
      if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
      }
      return undefined;
    };
    
    return {
      // OSINT Tools Configuration
      // Shodan is proxied server-side (api/shodan-proxy.ts holds SHODAN_API_KEY) —
      // Shodan and Censys now call their real APIs directly with the USER'S OWN
      // credentials — both send `access-control-allow-origin: *`, so a browser
      // may. The proxies these used to point at were never deployed, and this
      // project runs no server by design.
      //
      // An OPERATOR's key in a browser is a leak; a USER's own key in their own
      // browser is just theirs. That distinction is why the earlier move to
      // proxies was right at the time and why BYOK replaces it now.
      shodan: {
        id: 'shodan',
        name: 'Shodan',
        baseUrl: 'https://api.shodan.io',
        enabled: true,
        rateLimit: 100,
        timeout: 30000,
        requiresAuth: true
      },

      // VirusTotal sends no CORS header, so a browser cannot call it whoever
      // holds the key. Disabled with the reason stated rather than shipping a
      // tool that always fails — see VirusTotalAdapter.initialize().
      virustotal: {
        id: 'virustotal',
        name: 'VirusTotal',
        baseUrl: 'https://www.virustotal.com/api/v3',
        enabled: false,
        rateLimit: 500,
        timeout: 15000,
        requiresAuth: true
      },

      censys: {
        id: 'censys',
        name: 'Censys',
        baseUrl: 'https://search.censys.io/api/v2',
        enabled: true,
        rateLimit: 200,
        timeout: 10000,
        requiresAuth: true
      },
      
      // No server-side proxy exists yet for Hunter.io (unlike shodan/virustotal/censys
      // above) and no adapter reads this config today, so it's disabled rather than
      // wired to a VITE_-prefixed env var — that would've been the same client-exposure
      // bug already fixed for virustotal/censys, just latent since nothing calls it yet.
      hunter: {
        id: 'hunter',
        name: 'Hunter.io',
        baseUrl: 'https://api.hunter.io',
        enabled: false,
        rateLimit: 100,
        timeout: 10000,
        requiresAuth: true
      },
      
      theharvester: {
        id: 'theharvester',
        name: 'TheHarvester',
        baseUrl: 'local', // Command-line tool
        enabled: true, // Always available as it's a local tool
        rateLimit: 1000,
        timeout: 60000, // Longer timeout for command execution
        requiresAuth: false
      },
      
      // Working External APIs
      weather: {
        id: 'weather',
        name: 'OpenWeatherMap',
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        apiKey: getEnvVar('VITE_OPENWEATHERMAP_API_KEY'),
        enabled: !!getEnvVar('VITE_OPENWEATHERMAP_API_KEY'),
        rateLimit: 1000,
        timeout: 5000,
        requiresAuth: true
      },
      
      financial: {
        id: 'financial',
        name: 'Alpha Vantage',
        baseUrl: 'https://www.alphavantage.co/query',
        apiKey: getEnvVar('VITE_ALPHA_VANTAGE_API_KEY'),
        enabled: !!getEnvVar('VITE_ALPHA_VANTAGE_API_KEY'),
        rateLimit: 500,
        timeout: 10000,
        requiresAuth: true
      },
      
      conflicts: {
        id: 'conflicts',
        name: 'ACLED',
        baseUrl: 'https://api.acleddata.com/acled/read',
        apiKey: getEnvVar('VITE_ACLED_API_KEY'),
        // A commercial build needs ACLED's corporate licence first (D-CS, CS1).
        enabled: !!getEnvVar('VITE_ACLED_API_KEY') && sourceAllowed('acled'),
        rateLimit: 1000,
        timeout: 15000,
        requiresAuth: true
      },
      
      /*
       * REMOVED: the `starcom` and `osint` internal endpoints.
       *
       * Both declared a baseUrl on api.starcom.app — a host that does not
       * resolve — and NOTHING read either of them. Verified by searching every
       * consumer: `ProviderConfigurationPanel`, the only UI touching this
       * class, uses shouldUseRealApis() and getProviderConfig(), never an
       * endpoint lookup, and there is no getEndpoint() call anywhere in the
       * codebase.
       *
       * So the open question "build the /osint backend or delete the feature"
       * had a third answer: there was no feature, only configuration
       * describing one. A config entry that names a service nobody calls is
       * indistinguishable, to a reader, from a service that exists.
       *
       * Note this is NOT the whole of the api.starcom.app story —
       * IntelDataProvider still fetches four such URLs at runtime and falls
       * back to placeholder data every time. That one changes behaviour and is
       * flagged separately rather than removed here.
       */
      // System Configuration
      enableRealApis: getEnvVar('VITE_ENABLE_REAL_APIS') === 'true',
      debugMode: getEnvVar('VITE_DEBUG_MODE') === 'true',
      mockFallback: getEnvVar('VITE_MOCK_FALLBACK') !== 'false'
    };
  }

  private validateConfiguration(): void {
    const enabledProviders = this.getEnabledProviders();
    const osintProviders = this.getOSINTProviders();
    const enabledOSINTCount = osintProviders.filter(p => p.enabled).length;

    logger.info('API Configuration loaded', {
      totalProviders: Object.keys(this.config).length - 3, // Exclude system config
      enabledProviders: enabledProviders.length,
      osintProviders: osintProviders.length,
      enabledOSINTProviders: enabledOSINTCount,
      realApisEnabled: this.config.enableRealApis,
      mockFallback: this.config.mockFallback
    });

    if (enabledOSINTCount === 0) {
      logger.warn('No OSINT providers configured with API keys - will use mock data only');
    }

    if (this.config.enableRealApis && enabledOSINTCount === 0) {
      logger.error('Real APIs enabled but no OSINT providers configured');
    }
  }

  /**
   * Get configuration for a specific provider
   */
  /**
   * The credential to use for a provider, and where it came from.
   *
   * Prefers a key the person supplied over the one compiled into the bundle.
   * Callers should use this rather than reading `config.apiKey` directly:
   * `apiKey` is the BUILD-TIME value, which is public by construction, and a
   * caller reading it straight past this ignores whatever the user configured.
   */
  public resolveCredential(providerId: string): ResolvedCredential {
    return resolveCredential(providerId, this.config?.[providerId as keyof UnifiedApiConfig] &&
      typeof this.config[providerId as keyof UnifiedApiConfig] === 'object'
        ? (this.config[providerId as keyof UnifiedApiConfig] as ApiProviderConfig).apiKey
        : undefined);
  }

  public getProviderConfig(providerId: string): ApiProviderConfig | null {
    return this.config[providerId as keyof UnifiedApiConfig] as ApiProviderConfig || null;
  }

  /**
   * Get all enabled providers
   */
  public getEnabledProviders(): ApiProviderConfig[] {
    return Object.values(this.config)
      .filter((config): config is ApiProviderConfig => 
        typeof config === 'object' && 'enabled' in config && config.enabled
      );
  }

  /**
   * Get OSINT-specific providers
   */
  public getOSINTProviders(): ApiProviderConfig[] {
    const osintProviderIds = ['shodan', 'virustotal', 'censys', 'hunter', 'theharvester'];
    return osintProviderIds
      .map(id => this.getProviderConfig(id))
      .filter((config): config is ApiProviderConfig => config !== null);
  }

  /**
   * Check if a provider is configured and enabled
   */
  public isProviderEnabled(providerId: string): boolean {
    const config = this.getProviderConfig(providerId);
    return config?.enabled || false;
  }

  /**
   * Check if real APIs should be used
   */
  public shouldUseRealApis(): boolean {
    return this.config.enableRealApis;
  }

  /**
   * Check if mock fallback is enabled
   */
  public hasMockFallback(): boolean {
    return this.config.mockFallback;
  }

  /**
   * Get system configuration
   */
  public getSystemConfig() {
    return {
      enableRealApis: this.config.enableRealApis,
      debugMode: this.config.debugMode,
      mockFallback: this.config.mockFallback
    };
  }

  /**
   * Validate API key for a provider
   */
  public async validateProvider(providerId: string): Promise<boolean> {
    const config = this.getProviderConfig(providerId);
    if (!config || !config.enabled) {
      return false;
    }

    try {
      // Basic validation - check if API key exists
      if (config.requiresAuth && !config.apiKey && !config.apiId) {
        logger.warn(`Provider ${providerId} requires authentication but no API key found`);
        return false;
      }

      // TODO: Add actual API health checks for each provider
      logger.debug(`Provider ${providerId} validation passed`);
      return true;
    } catch (error) {
      logger.error(`Provider ${providerId} validation failed`, error);
      return false;
    }
  }

  /**
   * Get health status of all providers
   */
  public async getProvidersHealth(): Promise<Record<string, boolean>> {
    const providers = this.getEnabledProviders();
    const healthChecks = await Promise.all(
      providers.map(async (provider) => ({
        id: provider.id,
        healthy: await this.validateProvider(provider.id)
      }))
    );

    return healthChecks.reduce((acc, { id, healthy }) => {
      acc[id] = healthy;
      return acc;
    }, {} as Record<string, boolean>);
  }
}

// Export singleton instance
export const apiConfigManager = UnifiedApiConfigManager.getInstance();
export default apiConfigManager;
