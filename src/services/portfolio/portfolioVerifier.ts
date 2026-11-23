/**
 * The verifier a portfolio carries in its own page (decision D-EX, EX12, EX29).
 *
 * An advisor opens the portfolio's HTML file and presses one button: every signed event in it is
 * checked in their own browser, offline, with no site, account or library. So this function is whole
 * in itself, every helper inside it, and the page carries it by its source text. Nothing outside the
 * function may be referred to, and BigInt values are made with BigInt() rather than written as
 * literals, so the source reads the same in any build.
 *
 * It checks, for each event, what NIP-01 and BIP-340 define: that its id is the SHA-256 of its
 * serialised contents, so the words, date, kind and tags are the ones signed; and that the Schnorr
 * signature over that id checks against its key on secp256k1. It never throws: a malformed event is
 * one that does not check, said with why.
 */
export async function verifyNostrEvents(
  events: ReadonlyArray<{ id?: unknown; pubkey?: unknown; created_at?: unknown; kind?: unknown; tags?: unknown; content?: unknown; sig?: unknown }>,
): Promise<Array<{ id: string; ok: boolean; why?: string }>> {
  const big = (x: string | number) => BigInt(x);
  const ZERO = big(0);
  const ONE = big(1);
  const TWO = big(2);
  const THREE = big(3);
  const SEVEN = big(7);
  const P = big('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
  const N = big('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
  const GX = big('0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  const GY = big('0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');

  const mod = (a: bigint, m: bigint) => { const r = a % m; return r >= ZERO ? r : r + m; };
  const pow = (b: bigint, e: bigint, m: bigint) => {
    let result = ONE;
    let base = mod(b, m);
    let exp = e;
    while (exp > ZERO) {
      if (exp & ONE) result = (result * base) % m;
      base = (base * base) % m;
      exp >>= ONE;
    }
    return result;
  };
  const inv = (a: bigint) => pow(a, P - TWO, P);
  const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
  const toInt = (bytes: Uint8Array) => big(`0x${hex(bytes) || '0'}`);
  const toBytes = (n: bigint) => fromHex(n.toString(16).padStart(64, '0'));
  const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };
  const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  // Points in Jacobian coordinates [x, y, z]; z = 0 is the point at infinity.
  type Point = [bigint, bigint, bigint];
  const INFINITY: Point = [ZERO, ONE, ZERO];
  const double = ([x, y, z]: Point): Point => {
    if (z === ZERO || y === ZERO) return INFINITY;
    const yy = mod(y * y, P);
    const s = mod(big(4) * x * yy, P);
    const m = mod(THREE * x * x, P);
    const x3 = mod(m * m - TWO * s, P);
    const y3 = mod(m * (s - x3) - big(8) * yy * yy, P);
    return [x3, y3, mod(TWO * y * z, P)];
  };
  const add = (a: Point, b: Point): Point => {
    if (a[2] === ZERO) return b;
    if (b[2] === ZERO) return a;
    const z1z1 = mod(a[2] * a[2], P);
    const z2z2 = mod(b[2] * b[2], P);
    const u1 = mod(a[0] * z2z2, P);
    const u2 = mod(b[0] * z1z1, P);
    const s1 = mod(a[1] * b[2] * z2z2, P);
    const s2 = mod(b[1] * a[2] * z1z1, P);
    if (u1 === u2) return s1 === s2 ? double(a) : INFINITY;
    const h = mod(u2 - u1, P);
    const r = mod(s2 - s1, P);
    const hh = mod(h * h, P);
    const hhh = mod(h * hh, P);
    const v = mod(u1 * hh, P);
    const x3 = mod(r * r - hhh - TWO * v, P);
    const y3 = mod(r * (v - x3) - s1 * hhh, P);
    return [x3, y3, mod(a[2] * b[2] * h, P)];
  };
  const times = (k: bigint, point: Point): Point => {
    let result = INFINITY;
    let addend = point;
    let n = k;
    while (n > ZERO) {
      if (n & ONE) result = add(result, addend);
      addend = double(addend);
      n >>= ONE;
    }
    return result;
  };
  const affine = ([x, y, z]: Point): [bigint, bigint] | null => {
    if (z === ZERO) return null;
    const zi = inv(z);
    const zi2 = mod(zi * zi, P);
    return [mod(x * zi2, P), mod(y * zi2 * zi, P)];
  };
  const liftX = (x: bigint): Point | null => {
    if (x >= P) return null;
    const c = mod(x * x * x + SEVEN, P);
    const y = pow(c, (P + ONE) / big(4), P);
    if (mod(y * y, P) !== c) return null;
    return [x, (y & ONE) === ZERO ? y : P - y, ONE];
  };
  const taggedHash = async (tag: string, msg: Uint8Array) => {
    const t = await sha256(new TextEncoder().encode(tag));
    return sha256(concat(t, t, msg));
  };
  const isHex = (v: unknown, length: number): v is string => typeof v === 'string' && v.length === length && /^[0-9a-f]+$/.test(v);

  const one = async (event: (typeof events)[number]): Promise<{ id: string; ok: boolean; why?: string }> => {
    const id = typeof event.id === 'string' ? event.id : '';
    try {
      if (!isHex(event.id, 64) || !isHex(event.pubkey, 64) || !isHex(event.sig, 128)
        || typeof event.created_at !== 'number' || typeof event.kind !== 'number'
        || typeof event.content !== 'string' || !Array.isArray(event.tags)) {
        return { id, ok: false, why: 'it is not a signed event' };
      }
      const serialised = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
      if (hex(await sha256(new TextEncoder().encode(serialised))) !== event.id) return { id, ok: false, why: 'its id is not the hash of its contents' };
      const key = fromHex(event.pubkey);
      const sig = fromHex(event.sig);
      const point = liftX(toInt(key));
      const r = toInt(sig.slice(0, 32));
      const s = toInt(sig.slice(32));
      if (!point || r >= P || s >= N) return { id, ok: false, why: 'its signature does not check' };
      const e = mod(toInt(await taggedHash('BIP0340/challenge', concat(toBytes(r), key, fromHex(event.id)))), N);
      const negated: Point = [point[0], P - point[1], ONE];
      const rPoint = affine(add(times(s, [GX, GY, ONE]), times(e, negated)));
      if (!rPoint || (rPoint[1] & ONE) !== ZERO || rPoint[0] !== r) return { id, ok: false, why: 'its signature does not check' };
      return { id, ok: true };
    } catch {
      return { id, ok: false, why: 'it is not a signed event' };
    }
  };
  const results: Array<{ id: string; ok: boolean; why?: string }> = [];
  for (const event of events) results.push(await one(event));
  return results;
}
