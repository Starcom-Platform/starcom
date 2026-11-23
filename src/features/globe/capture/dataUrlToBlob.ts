/**
 * A data: URL's bytes as a Blob, decoded here rather than fetched.
 *
 * fetch(dataUrl) counts as a connection for the Content-Security-Policy, and
 * connect-src does not allow data:, so with the policy enforced the request is
 * refused and whatever needed the Blob (a share card's download) silently fails.
 * Decoding needs no request, so it needs no exception in the policy either.
 *
 * Only base64 data URLs are accepted, which is what canvas.toDataURL produces.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)((?:;[^;,]*)*);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Not a base64 data: URL');
  const type = match[1] || 'application/octet-stream';
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
