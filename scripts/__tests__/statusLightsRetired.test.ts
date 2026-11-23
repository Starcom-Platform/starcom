/**
 * Status lights that measured nothing stay retired (plan item 8.3b).
 *
 * The "Phase 5" button in the HUD's dock opened fixed numbers (CPU 0%, FPS 60,
 * "Encryption: secure"); under a flag it filled them from Math.random() and
 * raised "vulnerabilities detected" alerts, and its security panel scored the
 * retired wallet at random (decision B5). A toast said "Settings loaded" on
 * every visit and "Settings saved" only when another tab wrote a setting
 * (decision B6). The "Phase 4" gaming layer never mounted either, and its
 * overlay was commented out (decision B7).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RETIRED = [
  'src/components/Optimization',
  'src/components/SettingsStatusIndicator.tsx',
  'src/components/SettingsStatusIndicator.module.css',
  'src/components/Gaming',
];
const FLAGS = ['performanceOptimizationsEnabled', 'performanceMonitoringEnabled', 'performanceOptimizerEnabled', 'securityHardeningEnabled', 'lazyLoadingEnabled', 'cacheOptimizationsEnabled', 'gamingUxEnabled', 'rtsEnhancementsEnabled'];

function* sources(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry)) yield full;
  }
}

describe('status lights that measured nothing stay retired', () => {
  it('has none of their files', () => {
    expect(RETIRED.filter((p) => fs.existsSync(path.join(ROOT, p)))).toEqual([]);
  });

  it('has no source that imports them, names their flags, or keeps them a dock slot', () => {
    const found: string[] = [];
    for (const file of sources(path.join(ROOT, 'src'))) {
      const text = fs.readFileSync(file, 'utf8');
      if (/import[^;]*from\s+['"][^'"]*(Phase5Integration|PerformanceOptimizer|Optimization\/SecurityHardening|SettingsStatusIndicator|Phase4Integration|RTSGamingController)['"]/.test(text)) found.push(`${path.relative(ROOT, file)}: import`);
      for (const flag of FLAGS) if (text.includes(flag)) found.push(`${path.relative(ROOT, file)}: ${flag}`);
    }
    const dock = fs.readFileSync(path.join(ROOT, 'src/components/Dock/dockOrder.ts'), 'utf8');
    for (const slot of ['optimization:', 'settingsStatus:', 'rtsGaming:']) if (dock.includes(slot)) found.push(`dockOrder.ts: ${slot}`);
    expect(found).toEqual([]);
  });
});
