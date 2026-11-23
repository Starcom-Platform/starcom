/**
 * The wallet is retired (plan item 4.4, decision D5). It was built for NFT
 * minting and a marketplace that were retired before it; identity moved to
 * Nostr, and nothing any plan still wants needs it. This keeps it retired: no
 * Solana or Metaplex package, and no source file that reaches for one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WALLET = /^@solana\/|^@metaplex-foundation\//;

function* sources(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry)) yield full;
  }
}

describe('the wallet stays retired', () => {
  it('lists no Solana or Metaplex package', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(names.filter((n) => WALLET.test(n))).toEqual([]);
  });

  it('has no source file importing one', () => {
    const importers: string[] = [];
    for (const dir of ['src', 'scripts']) {
      for (const file of sources(path.join(ROOT, dir))) {
        if (file.endsWith(`walletRetired.test.ts`)) continue;
        if (/from\s+['"]@(solana|metaplex-foundation)\/|import\(\s*['"]@(solana|metaplex-foundation)\//.test(fs.readFileSync(file, 'utf8'))) {
          importers.push(path.relative(ROOT, file));
        }
      }
    }
    expect(importers).toEqual([]);
  });
});
