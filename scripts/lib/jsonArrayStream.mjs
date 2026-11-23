/**
 * Read a top-level JSON array element by element.
 *
 * The Norwegian register bulk file is 1.15GB of pretty-printed JSON in a single
 * array — too large for `JSON.parse`, and too large even for `readFileSync`,
 * which throws ERR_STRING_TOO_LONG above ~512MB.
 *
 * Tracks brace depth while respecting string literals and escapes, so it does
 * not depend on the producer's indentation. The first version sliced the buffer
 * and restarted the scan after every element, which is quadratic: it had not
 * finished after ten minutes. This one advances a cursor and compacts once per
 * chunk.
 *
 * Takes a STREAM, not a path. Callers pipe the network response through gunzip
 * straight into this, so the 1.5GB decompressed form never touches the disk —
 * writing it out first is what filled a machine.
 */
export async function* streamJsonArray(source, { chunkSize = 1 << 20 } = {}) {
  const stream = source;
  stream.setEncoding?.('utf8');
  let buf = '';
  let pos = 0;        // cursor into buf
  let start = -1;     // start index of the element being read
  let depth = 0;
  let inStr = false;
  let esc = false;

  for await (const chunk of stream) {
    buf += chunk;
    for (; pos < buf.length; pos++) {
      const c = buf[pos];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') { if (depth === 0) start = pos; depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          yield JSON.parse(buf.slice(start, pos + 1));
          start = -1;
        }
      }
    }
    // Compact ONCE per chunk, never per element.
    const keepFrom = start >= 0 ? start : pos;
    if (keepFrom > 0) {
      buf = buf.slice(keepFrom);
      pos -= keepFrom;
      if (start >= 0) start = 0;
    }
  }
}
