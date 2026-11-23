// @vitest-environment node
/**
 * Chat attachments and IPFS.
 *
 * These tests used to pin "Step 3.3.2": a paperclip in the direct-message
 * window that uploaded the plain file to IPFS and sent a public gateway link,
 * with `encrypted: false`, outside the publish review. That published whatever
 * evidence was attached to a private message. It was removed (plan 9.1,
 * decision G1); attachments return encrypted on the team relay (plan 9.10).
 *
 * What is pinned now: the window uploads nothing to IPFS, and an IPFS upload
 * anywhere outside a reviewed path fails the publish-review guard
 * (scripts/__tests__/guardPublishReview.test.ts). The window's behaviour is
 * tested in SecureChatWindow.noAttachment.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relPath), 'utf-8');
}

describe('chat attachments and IPFS', () => {
  it('the direct-message window uploads nothing to IPFS', () => {
    const src = readSrc('components/SecureChat/SecureChatWindow.tsx');
    expect(src).not.toMatch(/uploadToIPFS|ipfs-client|type="file"/);
  });

  it('keeps the attachment shape for encrypted attachments to use', () => {
    const src = readSrc('lib/chat/types/ChatAdapterTypes.ts');
    expect(src).toContain('cid?: string');
    expect(src).toContain('encrypted?: boolean');
  });
});
