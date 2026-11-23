// @vitest-environment node
/**
 * Step 3.3.3 — Delivery Status Tests
 *
 * Verifies:
 * 3.3.3.1 — No setTimeout fake delivery acknowledgement
 * 3.3.3.2 — Relay OK response tracked (Promise.any → 'sent')
 * 3.3.3.3 — Visual status indicators (⏳ → ✓ → ✓✓ → ✗)
 * 3.3.3.4 — Retry button for failed messages
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relPath), 'utf-8');
}

describe('Step 3.3.3 — Delivery Status', () => {
  // 3.3.3.1 — No setTimeout fake
  it('SecureChatWindow has no setTimeout delivery fake', () => {
    const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
    // No setTimeout for delivery simulation
    expect(src).not.toContain('setTimeout');
  });

  // 3.3.3.2 — Relay OK → 'sent'
  it('NostrChatAdapter tracks relay OK via Promise.any', () => {
    const src = readSrc('lib/chat/adapters/NostrChatAdapter.ts');
    expect(src).toContain('Promise.any(publishResults)');
    expect(src).toContain("status: 'sent'");
  });

  it('SecureChatWindow sets delivery to sent on adapter success, failed on error', () => {
    // Delivery status is dispatched through SecureChatContext's
    // updateMessageStatus action, not set via direct mutation of the
    // reducer-owned message object (that used to be `newMessage.deliveryStatus
    // = 'sent'`/`'failed'` directly — real, but React had no reason to
    // re-render when it changed, since the mutation never touched React
    // state). See SecureChatWindow.sendFailure.test.tsx for the behavioral
    // (not just source-text) coverage of this path.
    const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
    // With what the send reported: plan item 0.2 records encryption from the
    // send's result (SecureChatWindow.encryptionLabel.test.tsx checks it).
    expect(src).toContain("updateMessageStatus(chatWindow.id, newMessage.id, 'sent', sent?.encrypted === true, sent?.postQuantum === true)");
    expect(src).toContain("updateMessageStatus(chatWindow.id, newMessage.id, 'failed')");
  });

  // 3.3.3.3 — Visual indicators ⏳ → ✓ → ✓✓ → ✗
  it('displays all four delivery states', () => {
    const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
    expect(src).toContain("'✓✓'");
    expect(src).toContain("'✓'");
    expect(src).toContain("'⏳'");
    expect(src).toContain("'✗'");
  });

  // 3.3.3.4 — Retry button
  it('renders retry button for failed messages', () => {
    const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
    expect(src).toContain("Retry send");
    expect(src).toContain("↻");
    expect(src).toContain("msg.deliveryStatus === 'failed'");
  });
});
