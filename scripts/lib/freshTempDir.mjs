/**
 * A fresh temp folder for a script's output, and its own older ones cleared first.
 *
 * Each share smoke, golden run and audit made a folder of cards and clips under the temp directory and left it
 * there: by 26 Oct 2026 there were 148 of them, 2.1 GB on a disk with 6.5 GB free, and the watchdog was stopping
 * builds for want of room. Folders with the same prefix older than an hour are removed, so a run another session
 * has under way is left alone, and the newest output stays to be looked at.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function freshTempDir(prefix, { keepNewerThanMs = 3_600_000 } = {}) {
  const tmp = os.tmpdir();
  const now = Date.now();
  for (const name of fs.readdirSync(tmp)) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(tmp, name);
    try {
      if (now - fs.statSync(full).mtimeMs > keepNewerThanMs) fs.rmSync(full, { recursive: true, force: true });
    } catch { /* gone already, or not ours to remove */ }
  }
  return fs.mkdtempSync(path.join(tmp, prefix));
}
