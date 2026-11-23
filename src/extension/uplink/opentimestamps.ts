/**
 * OpenTimestamps proofs for evidence (decision D-EX, E2, W8c; EX18): proof that a file existed by a
 * moment, anchored in Bitcoin, which no one has to take the capturer's word for.
 *
 * The format is the official client's (python-opentimestamps 0.7, read 2026-10-12), so any OpenTimestamps
 * client reads, completes and verifies these proofs. As its `stamp` does for several files: each file's
 * hash has a random nonce appended and is hashed again, the results are joined in a merkle tree, and only
 * the tip goes to the calendars. A calendar never sees a file's hash, which matters because those hashes
 * are published with findings (EX23): a calendar's log could otherwise tie a capture to a claim.
 *
 * A calendar's answer is a pending proof: it says where the proof will be completed once Bitcoin has
 * confirmed it, usually within hours. Completing it ("upgrading") needs only the proof and a calendar,
 * and any client can do it later. Pure: the background sends the tip and hands back the answers.
 */

/** The public calendars asked, two independent operators (2026-10-12: free, no registration, no terms published). */
export const OTS_CALENDARS = ['https://alice.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com'] as const;
/** The calendars as sites Uplink asks to reach, once, under its optional site access (EX3). */
export const OTS_CALENDAR_ORIGINS = OTS_CALENDARS.map((c) => `${c}/*`);
/** Where Uplink keeps the person's answer: 'allowed', or 'declined', so it asks only once. */
export const TIMESTAMPS_SETTING_KEY = 'timestamps';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** A detached proof's first bytes. */
export const OTS_HEADER = Uint8Array.from([0x00, ...ascii('OpenTimestamps'), 0x00, 0x00, ...ascii('Proof'), 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94]);
const MAJOR_VERSION = 1;

const ATTESTATION = 0x00;
const FORK = 0xff;
const APPEND = 0xf0;
const PREPEND = 0xf1;
const SHA256 = 0x08;
/** Ops a proof may hold: the binary ones carry an argument. */
const BINARY_OPS = new Set([APPEND, PREPEND]);
const UNARY_OPS = new Set([0x02 /* sha1 */, 0x03 /* ripemd160 */, SHA256, 0x67 /* keccak256 */, 0xf2 /* reverse */, 0xf3 /* hexlify */]);
const PENDING = Uint8Array.from([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]);
const BITCOIN = Uint8Array.from([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]);
/** The reference's limits: an op's argument and result, an attestation's payload, a proof's depth. */
const MAX_ARG = 4096;
const MAX_PAYLOAD = 8192;
const MAX_DEPTH = 256;

export interface Op { tag: number; arg?: Uint8Array }
export interface Attestation { tag: Uint8Array; payload: Uint8Array }
export interface Timestamp {
  attestations: Attestation[];
  ops: Array<{ op: Op; next: Timestamp }>;
  /** The message at this node, while a stamp is being built; never written. */
  msg?: Uint8Array;
}

const node = (msg?: Uint8Array): Timestamp => ({ attestations: [], ops: [], ...(msg ? { msg } : {}) });
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const compareBytes = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

/** A whole number as unsigned LEB128. */
export function varuint(value: number): Uint8Array {
  const out: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return Uint8Array.from(out);
}
const varbytes = (bytes: Uint8Array) => concat(varuint(bytes.length), bytes);

class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}
  byte(): number {
    if (this.at >= this.bytes.length) throw new Error('The proof ends too soon');
    return this.bytes[this.at++];
  }
  take(n: number): Uint8Array {
    if (this.at + n > this.bytes.length) throw new Error('The proof ends too soon');
    const out = this.bytes.slice(this.at, this.at + n);
    this.at += n;
    return out;
  }
  varuint(): number {
    let value = 0;
    let shift = 1;
    for (;;) {
      const byte = this.byte();
      value += (byte & 0x7f) * shift;
      if (!(byte & 0x80)) return value;
      shift *= 128;
      if (shift > 2 ** 49) throw new Error('A number in the proof is too large');
    }
  }
  varbytes(max: number, min = 0): Uint8Array {
    const n = this.varuint();
    if (n > max || n < min) throw new Error('A length in the proof is out of bounds');
    return this.take(n);
  }
  done(): boolean { return this.at === this.bytes.length; }
}

function readOp(r: Reader, tag: number): Op {
  if (BINARY_OPS.has(tag)) return { tag, arg: r.varbytes(MAX_ARG, 1) };
  if (UNARY_OPS.has(tag)) return { tag };
  throw new Error(`Unknown operation 0x${tag.toString(16)} in the proof`);
}

function readNode(r: Reader, depth: number): Timestamp {
  if (depth > MAX_DEPTH) throw new Error('The proof is nested too deep');
  const stamp = node();
  const one = (tag: number) => {
    if (tag === ATTESTATION) {
      stamp.attestations.push({ tag: r.take(8), payload: r.varbytes(MAX_PAYLOAD) });
    } else {
      const op = readOp(r, tag);
      stamp.ops.push({ op, next: readNode(r, depth + 1) });
    }
  };
  let tag = r.byte();
  while (tag === FORK) {
    one(r.byte());
    tag = r.byte();
  }
  one(tag);
  return stamp;
}

/** A timestamp from its bytes, as a calendar answers or a proof holds it. */
export function readTimestamp(bytes: Uint8Array): Timestamp {
  const r = new Reader(bytes);
  const stamp = readNode(r, 0);
  if (!r.done()) throw new Error('The proof has trailing bytes');
  return stamp;
}

/** The reference's order: attestations by tag, then a pending one's address, a Bitcoin one's height. */
function compareAttestations(a: Attestation, b: Attestation): number {
  const byTag = compareBytes(a.tag, b.tag);
  if (byTag !== 0) return byTag;
  if (sameBytes(a.tag, PENDING) || sameBytes(a.tag, BITCOIN)) {
    const inner = (x: Attestation) => new Reader(x.payload);
    if (sameBytes(a.tag, PENDING)) {
      const decode = (x: Attestation) => new TextDecoder().decode(inner(x).varbytes(MAX_PAYLOAD));
      const [ua, ub] = [decode(a), decode(b)];
      return ua < ub ? -1 : ua > ub ? 1 : 0;
    }
    return inner(a).varuint() - inner(b).varuint();
  }
  return compareBytes(a.payload, b.payload);
}
const compareOps = (a: Op, b: Op) => (a.tag !== b.tag ? a.tag - b.tag : compareBytes(a.arg ?? new Uint8Array(), b.arg ?? new Uint8Array()));
const writeOp = (op: Op) => (op.arg ? concat(Uint8Array.of(op.tag), varbytes(op.arg)) : Uint8Array.of(op.tag));
const writeAttestation = (a: Attestation) => concat(a.tag, varbytes(a.payload));

/** A timestamp's bytes, in the reference's canonical order. */
export function writeTimestamp(stamp: Timestamp): Uint8Array {
  if (!stamp.attestations.length && !stamp.ops.length) throw new Error('An empty timestamp cannot be written');
  const parts: Uint8Array[] = [];
  const attestations = [...stamp.attestations].sort(compareAttestations);
  for (const a of attestations.slice(0, -1)) parts.push(Uint8Array.of(FORK, ATTESTATION), writeAttestation(a));
  if (!stamp.ops.length) {
    parts.push(Uint8Array.of(ATTESTATION), writeAttestation(attestations[attestations.length - 1]));
    return concat(...parts);
  }
  if (attestations.length) parts.push(Uint8Array.of(FORK, ATTESTATION), writeAttestation(attestations[attestations.length - 1]));
  const ops = [...stamp.ops].sort((a, b) => compareOps(a.op, b.op));
  ops.forEach(({ op, next }, i) => {
    if (i < ops.length - 1) parts.push(Uint8Array.of(FORK));
    parts.push(writeOp(op), writeTimestamp(next));
  });
  return concat(...parts);
}

/** Lays `other` over `into`: the same op is one branch, the rest are new ones. */
function merge(into: Timestamp, other: Timestamp): void {
  for (const a of other.attestations) {
    if (!into.attestations.some((b) => sameBytes(a.tag, b.tag) && sameBytes(a.payload, b.payload))) into.attestations.push(a);
  }
  for (const branch of other.ops) {
    const same = into.ops.find((b) => compareOps(b.op, branch.op) === 0);
    if (same) merge(same.next, branch.next);
    else into.ops.push(branch);
  }
}

/** The calendars a proof is waiting on, by address. */
export function pendingUris(stamp: Timestamp): string[] {
  const found = new Set<string>();
  const walk = (s: Timestamp) => {
    for (const a of s.attestations) if (sameBytes(a.tag, PENDING)) found.add(new TextDecoder().decode(new Reader(a.payload).varbytes(MAX_PAYLOAD)));
    for (const { next } of s.ops) walk(next);
  };
  walk(stamp);
  return [...found];
}

const hasAttestation = (s: Timestamp): boolean => s.attestations.length > 0 || s.ops.some(({ next }) => hasAttestation(next));

/**
 * Each file's proof, made ready for the calendars: its hash, then its nonce appended and hashed, then the
 * merkle tree the reference builds (structurally a merkle mountain range), up to the tip that is sent.
 */
export async function prepareStamp(
  fileHashes: Uint8Array[],
  nonces: Uint8Array[],
  sha256: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<{ tip: Uint8Array; leaves: Timestamp[]; tipStamp: Timestamp }> {
  if (!fileHashes.length || fileHashes.length !== nonces.length) throw new Error('Each file needs its nonce');
  const leaves = fileHashes.map((hash) => node(hash));
  let level: Timestamp[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const appended = node(concat(fileHashes[i], nonces[i]));
    leaves[i].ops.push({ op: { tag: APPEND, arg: nonces[i] }, next: appended });
    const root = node(await sha256(appended.msg!));
    appended.ops.push({ op: { tag: SHA256 }, next: root });
    level.push(root);
  }
  while (level.length > 1) {
    const next: Timestamp[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      const [left, right] = [level[i], level[i + 1]];
      const joined = node(concat(left.msg!, right.msg!));
      left.ops.push({ op: { tag: APPEND, arg: right.msg! }, next: joined });
      right.ops.push({ op: { tag: PREPEND, arg: left.msg! }, next: joined });
      const up = node(await sha256(joined.msg!));
      joined.ops.push({ op: { tag: SHA256 }, next: up });
      next.push(up);
    }
    if (level.length % 2 === 1) next.push(level[level.length - 1]);
    level = next;
  }
  const tipStamp = level[0];
  return { tip: tipStamp.msg!, leaves, tipStamp };
}

/** A calendar's answer for `sent`, laid over the tip; refused when it is not a timestamp that ends in an attestation. */
export function attachCalendar(tipStamp: Timestamp, answer: Uint8Array, sent: Uint8Array): void {
  if (!tipStamp.msg || !sameBytes(tipStamp.msg, sent)) throw new Error('The answer is for another digest than this tip');
  const stamp = readTimestamp(answer);
  if (!hasAttestation(stamp)) throw new Error('The calendar\'s answer ends in no attestation');
  merge(tipStamp, stamp);
}

/** A file's proof as a detached .ots file: header, version, SHA-256, the file's hash, its timestamp. */
export function detachedProof(fileHash: Uint8Array, leaf: Timestamp): Uint8Array {
  return concat(OTS_HEADER, varuint(MAJOR_VERSION), Uint8Array.of(SHA256), fileHash, writeTimestamp(leaf));
}

/** A detached .ots file read back: the file's hash, and its timestamp. */
export function readDetachedProof(bytes: Uint8Array): { fileHash: Uint8Array; timestamp: Timestamp } {
  const r = new Reader(bytes);
  if (!sameBytes(r.take(OTS_HEADER.length), OTS_HEADER)) throw new Error('Not an OpenTimestamps proof');
  if (r.varuint() !== MAJOR_VERSION) throw new Error('A proof of a version this does not read');
  if (r.byte() !== SHA256) throw new Error('A proof of a file hash other than SHA-256');
  const fileHash = r.take(32);
  const timestamp = readNode(r, 0);
  if (!r.done()) throw new Error('The proof has trailing bytes');
  return { fileHash, timestamp };
}

// ─── Completing a proof (W8c follow-up) ─────────────────────────────────────

type Sha256 = (bytes: Uint8Array) => Promise<Uint8Array>;

/** The message after an op: append, prepend and SHA-256 are what calendars' proofs use; any other is refused. */
export async function applyOp(op: Op, msg: Uint8Array, sha256: Sha256): Promise<Uint8Array> {
  if (op.tag === APPEND) return concat(msg, op.arg!);
  if (op.tag === PREPEND) return concat(op.arg!, msg);
  if (op.tag === SHA256) return sha256(msg);
  throw new Error(`This proof uses an operation (0x${op.tag.toString(16)}) Starcom does not compute`);
}

/** Every node with the message it stands for, from the file's hash down. */
async function eachNode(stamp: Timestamp, msg: Uint8Array, sha256: Sha256, visit: (node: Timestamp, msg: Uint8Array) => void, depth = 0): Promise<void> {
  if (depth > MAX_DEPTH) throw new Error('The proof is nested too deep');
  visit(stamp, msg);
  for (const { op, next } of stamp.ops) await eachNode(next, await applyOp(op, msg, sha256), sha256, visit, depth + 1);
}

/** Each calendar a proof waits on, and the commitment to ask it about: the message where it said "pending". */
export async function pendingCommitments(stamp: Timestamp, fileHash: Uint8Array, sha256: Sha256): Promise<Array<{ uri: string; commitment: Uint8Array }>> {
  const found: Array<{ uri: string; commitment: Uint8Array }> = [];
  await eachNode(stamp, fileHash, sha256, (node, msg) => {
    for (const a of node.attestations) {
      if (sameBytes(a.tag, PENDING)) found.push({ uri: new TextDecoder().decode(new Reader(a.payload).varbytes(MAX_PAYLOAD)), commitment: msg });
    }
  });
  return found;
}

/**
 * A calendar's completed timestamp for `commitment`, laid over the proof where the message is that
 * commitment. False when the proof holds no such message, or the answer ends in no attestation.
 */
export async function attachUpgrade(stamp: Timestamp, fileHash: Uint8Array, commitment: Uint8Array, answer: Uint8Array, sha256: Sha256): Promise<boolean> {
  const upgrade = readTimestamp(answer);
  if (!hasAttestation(upgrade)) return false;
  const at: Timestamp[] = [];
  await eachNode(stamp, fileHash, sha256, (node, msg) => { if (sameBytes(msg, commitment)) at.push(node); });
  for (const node of at) merge(node, upgrade);
  return at.length > 0;
}

/**
 * The Bitcoin blocks a proof is anchored in: each height, and the merkle root the proof reaches, written as
 * block explorers show it (the bytes reversed). A proof is only as good as that root matching the block's.
 */
export async function bitcoinAnchors(stamp: Timestamp, fileHash: Uint8Array, sha256: Sha256): Promise<Array<{ height: number; merkleRoot: string }>> {
  const found: Array<{ height: number; merkleRoot: string }> = [];
  await eachNode(stamp, fileHash, sha256, (node, msg) => {
    for (const a of node.attestations) {
      if (!sameBytes(a.tag, BITCOIN)) continue;
      const merkleRoot = [...msg].reverse().map((b) => b.toString(16).padStart(2, '0')).join('');
      const height = new Reader(a.payload).varuint();
      // Two calendars reaching one block are one anchor.
      if (!found.some((f) => f.height === height && f.merkleRoot === merkleRoot)) found.push({ height, merkleRoot });
    }
  });
  return found.sort((a, b) => a.height - b.height);
}
