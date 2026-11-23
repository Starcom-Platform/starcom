/**
 * The built service worker is stamped with its build, so each deploy installs
 * a new one and the data it keeps is checked once per build (decided
 * 2026-10-07). Unstamped, every build would ship the same worker and kept
 * borders would never be asked for again.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PLACEHOLDER, stampServiceWorker } from '../stamp-service-worker.mjs';

describe('stamping the built service worker', () => {
  let root: string;
  let dist: string;
  let publicDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-sw-'));
    dist = path.join(root, 'dist');
    publicDir = path.join(root, 'public');
    fs.mkdirSync(path.join(dist, '.well-known'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'assets', 'textures'), { recursive: true });
    fs.writeFileSync(path.join(dist, '.well-known/starcom-health.json'), JSON.stringify({
      buildSha: 'e95045ed649c3c365a5c39cd154f07710f48b2a4', builtAt: '2026-10-07T03:21:04.000Z',
    }));
    fs.writeFileSync(path.join(dist, 'sw.js'), `const VERSION = 'v1';\nconst BUILD = ${PLACEHOLDER};\n`);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const worker = () => fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');

  it('writes the build\'s sha and moment in place of the placeholder', () => {
    expect(stampServiceWorker({ dist, publicDir })).toBe('e95045ed649c@2026-10-07T03:21:04.000Z');
    expect(worker()).toBe("const VERSION = 'v1';\nconst BUILD = 'e95045ed649c@2026-10-07T03:21:04.000Z';\n");
  });

  it('refuses a worker that holds no placeholder, as one already stamped does', () => {
    stampServiceWorker({ dist, publicDir });
    expect(() => stampServiceWorker({ dist, publicDir })).toThrow(/placeholder 0 times, not once/);
  });

  it('refuses a file at the top of public/assets/, which the worker would take for hashed code', () => {
    fs.writeFileSync(path.join(publicDir, 'assets', 'starcom-logo-animated.gif'), 'GIF89a');
    expect(() => stampServiceWorker({ dist, publicDir })).toThrow(/puts starcom-logo-animated\.gif at the top of \/assets\//);
    expect(worker()).toContain(PLACEHOLDER);
  });

  it('leaves a folder\'s files and a dotfile at the top of public/assets/ alone', () => {
    fs.writeFileSync(path.join(publicDir, 'assets', 'textures', 'earth-day.jpg'), 'jpg');
    fs.writeFileSync(path.join(publicDir, 'assets', '.DS_Store'), '');
    expect(() => stampServiceWorker({ dist, publicDir })).not.toThrow();
  });

  it('refuses a build whose health record names no sha', () => {
    fs.writeFileSync(path.join(dist, '.well-known/starcom-health.json'), JSON.stringify({ buildSha: null, builtAt: null }));
    expect(() => stampServiceWorker({ dist, publicDir })).toThrow(/names no sha and moment/);
  });
});
