/**
 * OpenTimestamps proofs for evidence (decision D-EX, E2, W8c; EX18), in the format the official client
 * reads: a proof per file, each file's hash hidden behind a nonce, the files joined in a merkle tree,
 * and only the tree's tip sent to the public calendars, whose answers (real ones, kept as fixtures
 * from 2026-10-12) are laid over it.
 *
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OTS_HEADER, attachCalendar, detachedProof, pendingUris, prepareStamp, readDetachedProof, readTimestamp, varuint, writeTimestamp,
  type Timestamp,
} from '../uplink/opentimestamps';
import { base64ToBytes } from '../bytes';

const sha256 = async (bytes: Uint8Array) => new Uint8Array(createHash('sha256').update(bytes).digest());
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

/** What the calendars answered for the digest below, 2026-10-12. */
const DIGEST = fromHex('bf3dcf0e46a1b454a432f45c000720d863b846127ad9e58964fb80125951cd5b');
const ALICE = base64ToBytes('8AimgMDWzZcrewjwEOJqE494itl+tTBvIQ1JNJgI8SC7BY2SdTHk53y4JeRBh/3h/aW8uGIFwN+V4J81OBs3+wjxIIwPPo1ZiV2MOnq3zZYhP2aIQd/I46zw8tQn5lTe+2ojCPAg+UfgsRRNoSA9ZEvr1GpaBR54bM+lMAF+ug7CQYTPPMAI8QRqzGXn8AjSmS2Qc7Wf5gCD3+MNLvkMji4taHR0cHM6Ly9hbGljZS5idGMuY2FsZW5kYXIub3BlbnRpbWVzdGFtcHMub3Jn');
const FINNEY = base64ToBytes('8BBDVrsJvfJeSehM1ulN/lpsCPAgCBTtjZ6Ky1Od4EJRpuVgj4xwa/K8UNZhQt5phMP3B1AI8SB0wVF+5GsCD0sxneDlEwiYIXt15Xk2SeFelM1SIUVq1gjwIGWaM2gTvfdpGOXg9tEwDzbSPApb8X4LBrfSEHKabwwfCPEEasxl6fAIanlPXLT+kCQAg9/jDS75DI4pKGh0dHBzOi8vZmlubmV5LmNhbGVuZGFyLmV0ZXJuaXR5d2FsbC5jb20=');

/** Follows a proof's first branch from `msg` to the first node that holds an attestation, applying each op. */
async function replayToAttestedNode(stamp: Timestamp, msg: Uint8Array): Promise<{ node: Timestamp; msg: Uint8Array }> {
  let node = stamp;
  let at = msg;
  while (node.attestations.length === 0 && node.ops.length === 1) {
    const { op, next } = node.ops[0];
    if (op.tag === 0xf0) at = Uint8Array.from([...at, ...op.arg!]);
    else if (op.tag === 0xf1) at = Uint8Array.from([...op.arg!, ...at]);
    else if (op.tag === 0x08) at = await sha256(at);
    else throw new Error(`op ${op.tag} not replayed here`);
    node = next;
  }
  return { node, msg: at };
}

describe('the encoding', () => {
  it('writes whole numbers as LEB128, as the reference does', () => {
    expect([...varuint(0)]).toEqual([0]);
    expect([...varuint(127)]).toEqual([0x7f]);
    expect([...varuint(128)]).toEqual([0x80, 0x01]);
    expect([...varuint(300)]).toEqual([0xac, 0x02]);
  });

  it('reads a calendar\'s real answer and writes back the same bytes, naming the calendar that will finish it', () => {
    for (const [answer, uri] of [[ALICE, 'https://alice.btc.calendar.opentimestamps.org'], [FINNEY, 'https://finney.calendar.eternitywall.com']] as const) {
      const stamp = readTimestamp(answer);
      expect(hex(writeTimestamp(stamp))).toBe(hex(answer));
      expect(pendingUris(stamp)).toEqual([uri]);
    }
  });

  it('refuses what is not a timestamp, or one that ends nowhere', () => {
    expect(() => readTimestamp(Uint8Array.from([0x99]))).toThrow();
    expect(() => readTimestamp(Uint8Array.from([0xf0, 0x02, 1]))).toThrow();
    expect(() => readTimestamp(Uint8Array.from([...ALICE, 0x00]))).toThrow('trailing');
  });
});

describe('a stamp for an evidence capture\'s files', () => {
  const files = [fromHex('aa'.repeat(32)), fromHex('bb'.repeat(32)), fromHex('cc'.repeat(32))];
  const nonces = [fromHex('01'.repeat(16)), fromHex('02'.repeat(16)), fromHex('03'.repeat(16))];

  it('gives each file a proof that leads, through its nonce and the tree, to the one tip sent to the calendars', async () => {
    const { tip, leaves, tipStamp } = await prepareStamp(files, nonces, sha256);
    attachCalendar(tipStamp, ALICE, tip);
    attachCalendar(tipStamp, FINNEY, tip);
    for (let i = 0; i < files.length; i++) {
      const { node, msg } = await replayToAttestedNode(leaves[i], files[i]);
      // The tip's node forks to the two calendars: it holds no attestation itself.
      expect(node.ops.length === 2 || node.attestations.length > 0).toBe(true);
      expect(hex(msg)).toBe(hex(tip));
      expect(hex(leaves[i].ops[0].op.arg!)).toBe(hex(nonces[i]));
      expect(pendingUris(leaves[i]).sort()).toEqual(['https://alice.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com']);
    }
    // The file's hash never reaches a calendar: the tip is not any file hash.
    expect(files.map(hex)).not.toContain(hex(tip));
  });

  it('writes each proof as a detached file: the header, version 1, SHA-256, the file\'s hash, and its timestamp', async () => {
    const { tip, leaves, tipStamp } = await prepareStamp(files, nonces, sha256);
    attachCalendar(tipStamp, ALICE, tip);
    const proof = detachedProof(files[1], leaves[1]);
    expect(hex(proof.slice(0, OTS_HEADER.length))).toBe(hex(OTS_HEADER));
    expect([...proof.slice(OTS_HEADER.length, OTS_HEADER.length + 2)]).toEqual([0x01, 0x08]);
    expect(hex(proof.slice(OTS_HEADER.length + 2, OTS_HEADER.length + 34))).toBe(hex(files[1]));
    const read = readDetachedProof(proof);
    expect(hex(read.fileHash)).toBe(hex(files[1]));
    expect(pendingUris(read.timestamp)).toEqual(['https://alice.btc.calendar.opentimestamps.org']);
  });

  it('takes a calendar\'s answer only for the tip it was sent, and only when it ends in an attestation', async () => {
    const { tip, tipStamp } = await prepareStamp(files, nonces, sha256);
    expect(() => attachCalendar(tipStamp, Uint8Array.from([0x00, 1, 2]), tip)).toThrow();
    expect(() => attachCalendar(tipStamp, ALICE, DIGEST)).toThrow('another digest');
  });
});
