/**
 * Completing a proof (decision D-EX, EX18, W8c follow-up), on real data: a pending proof Uplink made,
 * the calendars' actual answers, and the official client's own completed proof to match byte for byte.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { attachUpgrade, bitcoinAnchors, detachedProof, pendingCommitments, readDetachedProof } from '../uplink/opentimestamps';
import { base64ToBytes } from '../bytes';
import { OTS_FIXTURE } from './fixtures/otsUpgrade';

const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const ALICE = 'https://alice.btc.calendar.opentimestamps.org';
const FINNEY = 'https://finney.calendar.eternitywall.com';

describe('pendingCommitments', () => {
  it('finds each calendar\'s commitment, as the official client computes it', async () => {
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(OTS_FIXTURE.pendingProof));
    expect(hex(fileHash)).toBe(OTS_FIXTURE.fileSha256);
    const found = await pendingCommitments(timestamp, fileHash, sha256);
    // As `ots` printed them for this proof, 2026-10-12.
    expect(found.map((p) => `${p.uri} ${hex(p.commitment)}`).sort()).toEqual([
      `${ALICE} 6acc67863c3bcaf674236a09e69fc5425f141d9a7095aaa600b594407901a2479336db19d1bdd4ef2ea0a669`,
      `${FINNEY} 6acc67857f88210e31a39d2284539f58b8392fefcb2b340ca151420092630992d29b46f76a29174e8feec7a5`,
    ]);
  });
});

describe('attachUpgrade and bitcoinAnchors', () => {
  it('lays each calendar\'s answer at its commitment, reaching the block once, with its merkle root as explorers show it', async () => {
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(OTS_FIXTURE.pendingProof));
    expect(await bitcoinAnchors(timestamp, fileHash, sha256)).toEqual([]);
    for (const { uri, commitment } of await pendingCommitments(timestamp, fileHash, sha256)) {
      expect(await attachUpgrade(timestamp, fileHash, commitment, base64ToBytes(OTS_FIXTURE.answers[uri]), sha256)).toBe(true);
    }
    expect(await bitcoinAnchors(timestamp, fileHash, sha256)).toEqual([{ height: 971047, merkleRoot: OTS_FIXTURE.block.merkleRoot }]);
  });

  it('writes the completed proof exactly as the official client does', async () => {
    // The client stops at the first calendar that completes: it took Finney's, and Alice stayed pending.
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(OTS_FIXTURE.pendingProof));
    const finney = (await pendingCommitments(timestamp, fileHash, sha256)).find((p) => p.uri === FINNEY)!;
    await attachUpgrade(timestamp, fileHash, finney.commitment, base64ToBytes(OTS_FIXTURE.answers[FINNEY]), sha256);
    expect(hex(detachedProof(fileHash, timestamp))).toBe(hex(base64ToBytes(OTS_FIXTURE.upgradedByReference)));
  });

  it('attaches nothing for a commitment the proof does not hold', async () => {
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(OTS_FIXTURE.pendingProof));
    expect(await attachUpgrade(timestamp, fileHash, new Uint8Array(32), base64ToBytes(OTS_FIXTURE.answers[ALICE]), sha256)).toBe(false);
    expect(await bitcoinAnchors(timestamp, fileHash, sha256)).toEqual([]);
  });
});
