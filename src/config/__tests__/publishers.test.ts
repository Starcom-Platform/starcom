/**
 * Whose notes the layers read is data (publishers.json), not code (the EIN transition audit, 21 Nov 2026, finding 4).
 * The file is well formed, the names the code reads are derived from it unchanged, and no publisher's key is written
 * anywhere in the code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import data from '../publishers.json';
import {
  PUBLISHERS, MECHA_JONO_KEYS, EXPOSED_KEYS, KEY_STARTS, OPERATOR_STATED_AGENT_KEYS, layerKeys,
  RAVER_WATCH_PUBLISHERS, HERO_WATCH_PUBLISHERS, AI_WATCH_PUBLISHERS, CIVIL_UNREST_PUBLISHERS, WAR_CONFLICT_PUBLISHERS,
} from '../publicInfrastructure';
import { PSI_SIGNER } from '../../services/psiWatch/psiEvents';
import { RLSH_SIGNER } from '../../services/rlsh/recurrence/recurrence';

const HEX_KEY = /^[0-9a-f]{64}$/;

describe('publishers.json', () => {
  it('is well formed: keys, dates and what each layer reads', () => {
    expect(data.format).toBe('starcom-publishers/1');
    const seen = new Set<string>();
    for (const p of PUBLISHERS) {
      expect(p.keys.length).toBeGreaterThan(0);
      for (const k of p.keys) {
        expect(k.pubkey).toMatch(HEX_KEY);
        expect(seen.has(k.pubkey)).toBe(false);
        seen.add(k.pubkey);
        if (k.starts) expect(Number.isFinite(Date.parse(k.starts))).toBe(true);
        if (k.exposed) expect(k.exposed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      for (const reads of Object.values(p.layers)) expect(['every key', 'newest key']).toContain(reads);
    }
  });

  it('gives the code the same names and values it had when they were written in it', () => {
    expect(MECHA_JONO_KEYS).toHaveLength(2);
    expect(Object.keys(EXPOSED_KEYS)).toEqual([MECHA_JONO_KEYS[1]]);
    expect(KEY_STARTS).toEqual({ [MECHA_JONO_KEYS[1]]: '2025-01-01T00:00:00Z' });
    expect(OPERATOR_STATED_AGENT_KEYS).toEqual(MECHA_JONO_KEYS);
    for (const layer of [RAVER_WATCH_PUBLISHERS, HERO_WATCH_PUBLISHERS, AI_WATCH_PUBLISHERS, CIVIL_UNREST_PUBLISHERS, WAR_CONFLICT_PUBLISHERS]) {
      expect(layer).toEqual(MECHA_JONO_KEYS);
    }
    // Psi Watch and RLSH recurrence read only the newest key.
    expect(PSI_SIGNER).toBe(MECHA_JONO_KEYS[0]);
    expect(RLSH_SIGNER).toBe(MECHA_JONO_KEYS[0]);
    expect(layerKeys('psi_watch')).toEqual([MECHA_JONO_KEYS[0]]);
  });

  it('is the only place a publisher\'s key is written: no 64-hex key in the code but Starcom\'s own identity', () => {
    const allowed: Record<string, string> = {
      'src/config/nodeIdentity.ts': 'Starcom\'s own identity, not a trust record',
    };
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === '__tests__' || name === '__fixtures__' || name === 'node_modules') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const rel = relative(process.cwd(), full).split('\\').join('/');
        if (rel in allowed) continue;
        for (const m of readFileSync(full, 'utf8').matchAll(/['"`]([0-9a-fA-F]{64})['"`]/g)) found.push(`${rel}: ${m[1].slice(0, 12)}…`);
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(found).toEqual([]);
  });
});
