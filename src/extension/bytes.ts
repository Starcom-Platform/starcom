/**
 * Bytes as base64 and back, for files crossing the bridge between Uplink and Starcom (decision D-EX,
 * E2, W8): extension messages carry JSON, not binary. In pieces, so a large picture never meets the
 * engine's limit on a single call's arguments.
 */
const PIECE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += PIECE) binary += String.fromCharCode(...bytes.subarray(at, at + PIECE));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
