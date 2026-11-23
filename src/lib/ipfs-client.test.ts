import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The in-browser IPFS node starts only when something uploads, but its code (helia, libp2p, WebRTC and their
 * certificate libraries) sat in the first visit's entry chunk: 922 KB of 2,672 KB minified, because this
 * client imported helia statically (security audit, SA3). It is loaded on the first call now.
 */
const loaded = vi.hoisted(() => [] as string[]);

vi.mock('helia', () => {
  loaded.push('helia');
  // helia 7 returns the node unstarted; helia 5 started it itself.
  return { createHelia: vi.fn(() => { const node = { start: async () => { loaded.push('started'); return node; } }; return node; }) };
});
vi.mock('@helia/unixfs', () => {
  loaded.push('@helia/unixfs');
  return { unixfs: vi.fn(() => ({ addBytes: vi.fn(async () => 'bafytest'), cat: vi.fn() })) };
});
vi.mock('multiformats/cid', () => {
  loaded.push('multiformats/cid');
  return { CID: { parse: vi.fn((s: string) => s) } };
});

describe('ipfs-client loads the IPFS stack on demand', () => {
  it('loads no part of it when imported, and helia on the first call, its node started', async () => {
    const client = await import('./ipfs-client');
    expect(loaded).toEqual([]);
    await client.getIPFSClient();
    expect(loaded).toEqual(expect.arrayContaining(['helia', '@helia/unixfs', 'started']));
  });

  it('is the only module that imports the stack, and never statically', () => {
    const STACK = /^(helia|@helia\/|libp2p|@libp2p\/|@chainsafe\/|multiformats|ipfs-)/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
        const source = fs.readFileSync(p, 'utf8');
        for (const m of source.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
          if (STACK.test(m[1])) offenders.push(`${path.relative(process.cwd(), p)} imports ${m[1]}`);
        }
      }
    };
    walk(path.resolve(__dirname, '..'));
    expect(offenders).toEqual([]);
  });
});
