/**
 * Whether a push changed what Vercel builds from (vercel.json `ignoreCommand`).
 * The owner chose on 2026-10-12 to skip a deployment when a push changes only
 * documents, to cut deployment storage.
 *
 * The first step compared commits, and every push still built: .vercelignore
 * removes `.git/` before the step runs (the build log: "Removed 2097 ignored
 * files", then the step: "not in this clone"). So the step compares what Vercel
 * received, entry by entry at the top of the tree, with what the live site says
 * its own build received. Whatever it cannot tell builds: a build too many costs
 * minutes, a deployment skipped serves old code.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inputOf, publish, SERVED, STATE_FILE, step } from '../vercel-build-input.mjs';

let root = '';
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
/** The live build's statement, as its build would have published it from this tree. */
const liveFromHere = (commit = 'aaaa') => ({ ...inputOf(root), commit });
const run = (live: unknown, commit = 'bbbb') => step({ root, commit, fetchLive: async () => live });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-input-'));
  write('src/app.ts', 'one');
  write('public/index.css', 'one');
  write('docs/spec/share.spec.md', 'one');
  write('package.json', '{}');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('what Vercel builds from', () => {
  it('is the same for the same files, and changes only where a file changed', () => {
    const before = inputOf(root);
    expect(inputOf(root)).toEqual(before);
    write('src/app.ts', 'two');
    const after = inputOf(root);
    expect(Object.keys(after.entries).filter((name) => after.entries[name] !== before.entries[name])).toEqual(['src']);
  });

  it('changes when a file is renamed, though its words are the same', () => {
    const before = inputOf(root);
    fs.renameSync(path.join(root, 'src/app.ts'), path.join(root, 'src/main.ts'));
    expect(inputOf(root).entries.src).not.toBe(before.entries.src);
  });

  it('leaves out what is not input: installed packages, the build, caches, and the step\'s own note', () => {
    const before = inputOf(root);
    write('node_modules/x/index.js', 'x');
    write('dist/index.html', 'x');
    write('.vercel/output/x', 'x');
    write('.cache/x', 'x');
    write(STATE_FILE, '{}');
    expect(inputOf(root)).toEqual(before);
  });
});

describe('the Ignored Build Step', () => {
  it('skips a push whose input is the live build\'s, as a push of documents Vercel never receives is', async () => {
    const live = liveFromHere();
    const result = await run(live);
    expect(result.skip).toBe(true);
    expect(result.said).toMatch(/aaaa/);
  });

  it('builds a push that changed an entry, and names it', async () => {
    const live = liveFromHere();
    write('src/app.ts', 'two');
    write('package.json', '{"x":1}');
    expect(await run(live)).toEqual({ skip: false, said: 'Building: changed since the live build (aaaa): package.json, src' });
  });

  it('builds a push that added or removed an entry', async () => {
    const live = liveFromHere();
    write('index.html', '<!doctype html>');
    expect((await run(live)).said).toMatch(/: index\.html$/);
    fs.rmSync(path.join(root, 'index.html'));
    fs.rmSync(path.join(root, 'public'), { recursive: true });
    expect((await run(live)).said).toMatch(/: public$/);
  });

  it('builds when the live site states no input, or one it cannot read', async () => {
    for (const live of [null, {}, { version: 2, entries: {} }, { version: 1, entries: 'x' }]) {
      expect((await run(live)).skip).toBe(false);
    }
  });

  it('builds when the live site cannot be asked', async () => {
    const result = await step({ root, commit: 'bbbb', fetchLive: async () => { throw new Error('ENOTFOUND'); } });
    expect(result).toEqual({ skip: false, said: 'Building: could not read the live build\'s input (ENOTFOUND).' });
  });

  it('builds a redeploy of the live commit: nothing changed, so someone asked for it', async () => {
    const live = liveFromHere('bbbb');
    expect((await run(live, 'bbbb')).skip).toBe(false);
  });

  it('notes what it read, so the build can publish it', async () => {
    await run(null);
    expect(JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'))).toEqual(inputOf(root));
  });
});

describe('publishing the input', () => {
  it('serves the step\'s note with the commit built', async () => {
    await run(null);
    const read = inputOf(root);
    publish({ root, commit: 'cccc' });
    expect(JSON.parse(fs.readFileSync(path.join(root, SERVED), 'utf8'))).toEqual({ ...read, commit: 'cccc' });
  });

  it('serves nothing where no step ran, as in a build on this computer, and removes an old one', () => {
    write(SERVED, '{"version":1,"entries":{}}');
    publish({ root, commit: 'cccc' });
    expect(fs.existsSync(path.join(root, SERVED))).toBe(false);
  });
});
