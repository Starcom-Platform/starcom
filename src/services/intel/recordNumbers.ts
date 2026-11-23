/**
 * Case and mission numbers that two machines cannot both mint (plan item 2.4).
 *
 * A number was `CASE-<year>-<random four digits>`: one chance in nine
 * thousand that two cases shared it, on one machine or across a team, and a
 * bundle carrying a case into a workspace that already had its number would
 * have made two of them. A number is now read from the record's id, which is
 * already unique, so the same record has the same number everywhere and two
 * records practically never share one: 40 bits, in eight characters of
 * Crockford's base 32, which has no I, L, O or U to misread aloud.
 *
 * Numbers already given stay as they are. A case's number is part of the
 * attribute its published adjudication is filed under, so changing it would
 * orphan what was published.
 */
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function recordNumber(prefix: 'CASE' | 'MSN', id: string, at: Date = new Date()): string {
  const bytes = sha256(utf8ToBytes(id));
  // Forty bits, five at a time.
  let bits = 0n;
  for (let i = 0; i < 5; i += 1) bits = (bits << 8n) | BigInt(bytes[i]);
  let code = '';
  for (let i = 7; i >= 0; i -= 1) code += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)];
  return `${prefix}-${at.getUTCFullYear()}-${code.slice(0, 4)}-${code.slice(4)}`;
}
