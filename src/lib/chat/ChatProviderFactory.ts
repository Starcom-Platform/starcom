/**
 * ChatProviderFactory.ts
 * 
 * Factory for creating chat provider instances based on configuration or capability requirements.
 */

import { ChatProviderInterface } from './interfaces/ChatProviderInterface';
import { chatProviderRelays } from '../../services/nostr/publishTargets';
import type { ChatProviderType, ChatProviderConfig, EnhancedChatProviderOptions } from './types/ChatAdapterTypes';
export type { ChatProviderType, ChatProviderConfig } from './types/ChatAdapterTypes';
import { ProtocolRegistry } from './ProtocolRegistry';
import { ProtocolSelectionCriteria, ProtocolSelectionResult } from './types/ProtocolTypes';
import { logger } from '../../utils';
// Type-only — erased at compile time, so this doesn't participate in the
// runtime circular-dependency concern the old end-of-file value import
// (removed below) was written to avoid.
import type { BaseChatAdapter } from './adapters/BaseChatAdapter';

// Every adapter loadChatAdapter() can return extends BaseChatAdapter with a
// constructor of this shape — used in place of `any` at each call site.
type ChatAdapterConstructor = new (options?: EnhancedChatProviderOptions) => BaseChatAdapter;

// Map of protocols to provider types
const protocolToProviderMap: Record<string, ChatProviderType> = {
  'nostr': 'nostr',
  'secure': 'secure',
};

/**
 * Singleton instance of the protocol registry. Must use getInstance() — a bare
 * `new ProtocolRegistry()` here silently created a second, private registry that
 * nothing else could see, so anything registered via this module (gun/nostr/secure)
 * was invisible to every other caller of ProtocolRegistry.getInstance() (e.g.
 * UnifiedChatAdapter, which selects a protocol from what it assumes is the same
 * shared registry).
 */
const protocolRegistry = ProtocolRegistry.getInstance();

/**
 * Loads a chat adapter class based on the specified type.
 * 
 * @param type The chat provider type.
 * @returns A promise that resolves to the adapter class.
 */
async function loadChatAdapter(type: ChatProviderType): Promise<ChatAdapterConstructor> {
  switch (type) {
    case 'nostr': {
      const { NostrChatAdapter } = await import('./adapters/NostrChatAdapter');
      return NostrChatAdapter;
    }
    case 'secure': {
      const { SecureChatAdapter } = await import('./adapters/SecureChatAdapter');
      return SecureChatAdapter;
    }
    /*
     * 'unified' is gone. UnifiedChatAdapter was 1,334 lines reachable only by
     * this branch, and nothing anywhere asked for it by name — it was never
     * registered with the ProtocolRegistry either, so capability selection
     * could not reach it. A case nobody can enter is not an option, it is a
     * claim that one exists.
     */
    default:
      throw new Error(`Unknown chat provider type: ${type}`);
  }
}

/**
 * Creates a chat provider instance based on the specified configuration.
 * 
 * @param config The chat provider configuration.
 * @returns A promise that resolves to a chat provider instance.
 */
export async function createChatProvider(config: ChatProviderConfig): Promise<ChatProviderInterface> {
  const AdapterClass = await loadChatAdapter(config.type);
  return new AdapterClass(config.options);
}

/**
 * Creates a chat provider based on capability requirements.
 * 
 * @param criteria The selection criteria for choosing a provider.
 * @param options Options to pass to the selected provider.
 * @returns A promise that resolves to the best matching chat provider and selection result.
 */
export async function createChatProviderByCapabilities(
  criteria: ProtocolSelectionCriteria, 
  options = {}
): Promise<{ provider: ChatProviderInterface; result: ProtocolSelectionResult }> {
  // Select protocol based on criteria
  const result = protocolRegistry.selectProtocol(criteria);
  
  if (!result.selectedProtocol) {
    throw new Error(`No suitable chat provider found for the requested capabilities: ${criteria.requiredCapabilities.join(', ')}`);
  }
  
  // Map protocol ID to provider type
  const typeMap = protocolToProviderMap;
  
  // Falls back to 'secure', not to a provider that no longer exists. It is
  // also the only adapter with real PQC, so an unrecognised protocol id
  // degrades toward more protection rather than less.
  const type = typeMap[result.selectedProtocol.id] || 'secure';
  
  // Create the provider
  const provider = await createChatProvider({
    type,
    options: {
      ...options,
      // Add any protocol-specific options from the selection result
      ...(result.metadata || {})
    }
  });
  
  return { provider, result };
}

/**
 * Determines if a specific feature is supported by a chat provider type.
 * 
 * @param type The chat provider type.
 * @param feature The feature to check support for.
 * @returns A promise that resolves to true if the feature is supported, false otherwise.
 */
export async function isFeatureSupported(type: ChatProviderType, feature: string): Promise<boolean> {
  try {
    const AdapterClass = await loadChatAdapter(type);
    const adapter = new AdapterClass();
    return adapter.hasFeature(feature);
  } catch {
    return false;
  }
}

/**
 * Creates a chat provider instance based on the specified selection criteria.
 * Uses ProtocolRegistry to select the most appropriate provider.
 * 
 * @param criteria Selection criteria for choosing a provider.
 * @param options Additional options to pass to the provider.
 * @returns A promise that resolves to the chat provider and selection result.
 */
export async function createChatProviderByCriteria(
  criteria: ProtocolSelectionCriteria,
  options = {}
): Promise<{ provider: ChatProviderInterface; selection: ProtocolSelectionResult }> {
  // Ensure default protocols are registered
  registerDefaultProtocols();
  
  // Select protocol based on criteria
  const selection = protocolRegistry.selectProtocol(criteria);
  
  if (!selection.selectedProtocol) {
    throw new Error(`No suitable chat provider found for the specified criteria`);
  }
  
  // Map protocol ID to provider type
  const type = protocolToProviderMap[selection.selectedProtocol.id] || 'secure';
  
  // Create the provider
  const provider = await createChatProvider({
    type,
    options: {
      ...options,
      // Add any protocol-specific options from the selection result
      ...(selection.metadata || {})
    }
  });
  
  return { provider, selection };
}

/**
 * Default configuration for each provider type.
 */
export const defaultChatProviderConfigs: Record<ChatProviderType, Omit<ChatProviderConfig, 'type'>> = {
  nostr: {
    options: {
      encryption: true,
      storageStrategy: 'persistent',
      endpoints: chatProviderRelays()
    }
  },
  secure: {
    options: {
      encryption: true,
      storageStrategy: 'persistent',
      endpoints: []  // Will be determined by the SecureChatIntegrationService
    }
  },
};

/**
 * Gets the recommended chat provider type based on the application context.
 * 
 * @param context Additional context for determining the provider type.
 * @returns The recommended chat provider type.
 */
export function getRecommendedChatProviderType(context: Record<string, unknown> = {}): ChatProviderType {
  // Default to the PQC-capable provider
  let recommendedType: ChatProviderType = 'secure';
  
  try {
    // Simple strategy: check if secure connections are required
    if (context.secureRequired === true) {
      recommendedType = 'secure';
    } 
    // Check for preferred provider in context
    else if (context.preferredProvider && typeof context.preferredProvider === 'string') {
      const preferred = context.preferredProvider as string;
      if (Object.keys(protocolToProviderMap).includes(preferred)) {
        recommendedType = protocolToProviderMap[preferred] as ChatProviderType;
      }
    }
    
    logger.debug(`Recommended chat provider type: ${recommendedType}`, { context });
    return recommendedType;
  } catch (error) {
    logger.error('Error determining recommended chat provider type', { error });
    return 'secure'; // The only adapter with real PQC — degrade toward protection
  }
}

/**
 * Gets the recommended chat provider type based on the application context.
 * Alias for getRecommendedChatProviderType for backward compatibility.
 * 
 * @param context Additional context for determining the provider type.
 * @returns The recommended chat provider type.
 */
export function getRecommendedChatProvider(context: Record<string, unknown> = {}): ChatProviderType {
  return getRecommendedChatProviderType(context);
}

/**
 * Register the default protocols (nostr, secure) in the registry. Runs
 * automatically on module load (see the bottom of this file), but is also
 * exported as initializeChatSystem so callers — including tests using isolated
 * module/mock contexts where the module-load side effect isn't reliably ordered
 * relative to their own setup — can trigger it explicitly and deterministically.
 */
export function initializeChatSystem(): void {
  registerDefaultProtocols();
}

function registerDefaultProtocols() {
  // Nostr protocol
  protocolRegistry.registerProtocol({
    id: 'nostr',
    name: 'Nostr',
    adapterClass: 'NostrChatAdapter',
    defaultEndpoints: chatProviderRelays(),
    defaultCapabilities: {
      messaging: true,
      channels: true,
      presence: false,
      attachments: true,
      reactions: true,
      threading: false,
      encryption: true,
      search: false,
      offline: true,
      editing: false,
      deletion: true,
      typing: false,
      read_receipts: false,
      mentions: true,
      p2p: false,
      e2e_encryption: true,
      forward_secrecy: false,
      pq_encryption: false,
      server_based: true,
      relay_based: true,
      message_expiry: false,
      persistent_history: true,
      anonymous_usage: false,
      sync: true
    },
    isEnabled: true,
    priority: 1
  });
  
  // Secure protocol (upgraded Gun or other secure implementation)
  protocolRegistry.registerProtocol({
    id: 'secure',
    name: 'Secure Chat',
    adapterClass: 'SecureChatAdapter',
    defaultEndpoints: [],  // Will be determined by the SecureChatIntegrationService
    defaultCapabilities: {
      messaging: true,
      channels: true,
      presence: true,
      attachments: true,
      reactions: false,
      threading: false,
      encryption: true,
      search: true,
      offline: true,
      editing: false,
      deletion: true,
      typing: true,
      read_receipts: true,
      mentions: false,
      p2p: true,
      e2e_encryption: true,
      forward_secrecy: true,
      pq_encryption: true,
      server_based: false,
      relay_based: false,
      message_expiry: true,
      persistent_history: true,
      anonymous_usage: false,
      sync: true
    },
    isEnabled: true,
    priority: 3
  });
}

// Initialize default protocols
registerDefaultProtocols();
