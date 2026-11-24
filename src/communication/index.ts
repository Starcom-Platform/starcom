/**
 * 🗣️ COMMUNICATION MODULE - UNIFIED EXPORTS
 * Centralized exports for all communication-related functionality
 */

// SecureChat Context and Provider — reconnected in Phase 9 revival
export { default as SecureChatContext, SecureChatProvider } from './context/SecureChatContext';
export { useSecureChat } from './context/useSecureChat';

// Communication Types
export * from './types/SecureChat';

// Re-export commonly used types for compatibility
export type {
  ChatContact,
  SecureChatWindow,
  ThreatLevel,
  PQCAlgorithm,
  PQCSecurityLevel,
  MessageType
} from './types/SecureChat';
