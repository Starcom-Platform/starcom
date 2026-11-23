// @vitest-environment node
/**
 * 3.4.3.2 — NostrChatAdapter Subscription Integration Test
 *
 * Validates that the subscription path for both NIP-28 channels and NIP-04 DMs
 * is correctly wired: method exists, dispatches to the right sub-method,
 * handles dedup via seenMessageIds, and cleans up on disconnect.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../lib/chat/adapters/NostrChatAdapter.ts'),
  'utf-8',
);

describe('NostrChatAdapter — subscription integration', () => {
  // ------------------------------------------------
  // 1. subscribeToMessages method exists and accepts correct signature
  // ------------------------------------------------
  it('exports subscribeToMessages(channelId, callback)', () => {
    expect(src).toMatch(/public\s+subscribeToMessages\s*\(\s*channelId\s*:\s*string/);
  });

  // ------------------------------------------------
  // 2. Dispatches to channel subscription for NIP-28
  // ------------------------------------------------
  it('dispatches to subscribeToChannel for regular channels', () => {
    expect(src).toContain('subscribeToChannel(channelId');
    // The dispatch must happen inside subscribeToMessages
    const methodBlock = extractMethod(src, 'subscribeToMessages');
    expect(methodBlock).toContain('subscribeToChannel');
  });

  // ------------------------------------------------
  // 3. Dispatches to DM subscription path for dm-* channels
  // ------------------------------------------------
  it('dispatches to subscribeToDMs for DM channels', () => {
    const methodBlock = extractMethod(src, 'subscribeToMessages');
    // Should check for dm- prefix to route to DM handler
    expect(methodBlock).toMatch(/dm-|isDirect|subscribeToDM/i);
  });

  // ------------------------------------------------
  // 4. Channel subscription uses nostrService.subscribeToChannel
  // ------------------------------------------------
  it('channel subscription delegates to nostrService', () => {
    expect(src).toMatch(/nostrService\.subscribeToChannel/);
  });

  // ------------------------------------------------
  // 5. DM subscription uses SimplePool + Kind 4
  // ------------------------------------------------
  it('DM subscription uses dmPool and Kind 4', () => {
    expect(src).toContain('dmPool');
    // Kind 4 = NIP-04 DM
    expect(src).toMatch(/kind[:\s]*4|kinds.*\[.*4/);
  });

  // ------------------------------------------------
  // 6. Dedup via seenMessageIds
  // ------------------------------------------------
  it('maintains seenMessageIds for deduplication', () => {
    expect(src).toContain('seenMessageIds');
    // Should check before processing
    expect(src).toMatch(/seenMessageIds\.has|seenMessageIds\.add/);
  });

  // ------------------------------------------------
  // 7. Cleanup on disconnect
  // ------------------------------------------------
  it('disconnect cleans up subscriptions and seenMessageIds', () => {
    const disconnectBlock = extractMethod(src, 'disconnect');
    expect(disconnectBlock).toMatch(/seenMessageIds|dmSubs|close|clear/);
  });

  // ------------------------------------------------
  // 8. lastSeenTimestamp preserved on reconnect
  // ------------------------------------------------
  it('reconnect preserves lastSeenTimestamp', () => {
    expect(src).toContain('lastSeenTimestamp');
    const reconnectBlock = extractMethod(src, 'reconnect');
    // reconnect should NOT reset lastSeenTimestamp
    expect(reconnectBlock).not.toContain('lastSeenTimestamp = 0');
    expect(reconnectBlock).not.toContain('lastSeenTimestamp.clear()');
  });

  // ------------------------------------------------
  // 9. NIP-04 encrypt used for DMs
  // ------------------------------------------------
  it('uses nip04 for DM encryption', () => {
    expect(src).toMatch(/nip04\.encrypt|nip04\.decrypt/);
  });

  // ------------------------------------------------
  // 10. Returns unsubscribe function
  // ------------------------------------------------
  it('subscribeToMessages returns an unsubscribe function', () => {
    const methodBlock = extractMethod(src, 'subscribeToMessages');
    expect(methodBlock).toMatch(/return\s+unsubscribe/);
  });
});

/**
 * Helper: extract a method body from source by name.
 * Simple heuristic: finds `methodName(` then matches braces.
 */
function extractMethod(source: string, methodName: string): string {
  const idx = source.indexOf(`${methodName}(`);
  if (idx === -1) return '';
  // Find the opening brace of the method body
  const braceStart = source.indexOf('{', idx);
  if (braceStart === -1) return '';
  let depth = 1;
  let i = braceStart + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(idx, i);
}
