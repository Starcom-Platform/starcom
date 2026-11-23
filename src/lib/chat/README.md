# Chat providers

Rewritten on 2026-11-20 from the files present. The earlier version described an adapter
for a second peer-to-peer network, a unified adapter and an example that switched between
them. None of these exists any more.

Starcom's chat runs over Nostr. `ChatProviderType` is `'nostr' | 'secure'`
(`types/ChatAdapterTypes.ts`).

## Files

| File | What it holds |
| --- | --- |
| `ChatInterface.ts`, `interfaces/ChatProviderInterface.ts` | The interface every provider implements. |
| `interfaces/FeatureDetection.ts` | What a provider declares it supports. |
| `ChatProviderFactory.ts` | Creates the provider for a type. |
| `ProtocolRegistry.ts`, `types/ProtocolTypes.ts` | The protocols a provider can use. |
| `adapters/BaseChatAdapter.ts` | Shared behaviour and error handling. |
| `adapters/NostrChatAdapter.ts` | Chat over Nostr relays. |
| `adapters/SecureChatAdapter.ts` | The adapter for the secure chat service. |
| `OfflineQueue.ts` | Messages held while offline. |
| `errors/ChatErrors.ts`, `utils/ChatErrorHandling.ts` | Error types and handling. |

## What is protected, and how

Don't restate it here, where it would go stale. Read
`docs/missions/00-current-state/chat.md` (the audit, and what plan item 2.7 repaired), and run
`npm run check:chat` against a build for what holds now.
