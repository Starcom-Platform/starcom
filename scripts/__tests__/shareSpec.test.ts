/**
 * The share handle's spec, served beside the interchange spec (decided
 * 2026-10-05): one readable page for Mecha Jono, built when the deployment is
 * built from the handle's own type and the published contract, so it cannot
 * describe a different build. The prose that frames it is written by hand; the
 * guard holds it to the code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { methodDocs, renderShareSpec, shareSpecProblems, versionsListed } from '../lib/shareSpec.mjs';

const PROSE = readFileSync('docs/spec/starcom-share-handle.spec.md', 'utf8');
const SOURCE = readFileSync('src/components/Globe/Hooks/useGlobeShareCard.ts', 'utf8');
const CONTRACT = JSON.parse(readFileSync('public/.well-known/starcom-share-contract.json', 'utf8'));

describe('the share handle spec', () => {
  it('reads a doc comment and a signature for every method the contract lists, and no other', () => {
    const docs = methodDocs(SOURCE);
    expect(Object.keys(docs).sort()).toEqual(Object.keys(CONTRACT.methods).sort());
    for (const [name, d] of Object.entries(docs)) {
      expect(d.doc.trim(), name).not.toBe('');
      expect(d.signatures[0], name).toMatch(new RegExp(`^${name}\\(`));
    }
    // An overloaded method keeps each of its signatures.
    expect(docs.listReports.signatures.length).toBeGreaterThan(1);
  });

  it('lists every version, from the first to the one in force, in its history', () => {
    expect(versionsListed(PROSE)).toEqual(Array.from({ length: CONTRACT.version }, (_, i) => i + 1));
  });

  it('builds the served page: the prose, then each method with its options and what it returns', () => {
    const page = renderShareSpec(PROSE, SOURCE, CONTRACT);
    expect(page).toContain(`## Reference: contract version ${CONTRACT.version}`);
    expect(page).toContain('/.well-known/starcom-share-contract.json');
    expect(page).not.toContain('<!-- reference -->');
    for (const name of Object.keys(CONTRACT.methods)) expect(page, name).toContain(`### \`${name}\``);
    const compose = page.slice(page.indexOf('### `compose`'), page.indexOf('###', page.indexOf('### `compose`') + 4));
    expect(compose).toContain('Options: `scale`, `preset`, `fit`.');
    expect(compose).toMatch(/Returns: `dataUrl`, `width`/);
    expect(compose).toContain('```ts\ncompose(');
  });

  it('lists every vocabulary the contract holds, what is built beside what is not', () => {
    const page = renderShareSpec(PROSE, SOURCE, CONTRACT);
    expect(page).toContain('### Presets');
    expect(page).toContain('`wide`, `square`, `portrait`, `embed`, `story`');
    expect(page).toMatch(/### Templates\n\nBuilt: `critical_intel`/);
    expect(page).toMatch(/Not built yet: `mission_package`/);
    expect(page).toMatch(/### Shot\n/);
    // Records read as tables, and settings as lines: not as JSON.
    expect(page).toMatch(/### Report categories\n\n- `words`:\n\n\| word \| meaning \| icon \|\n\| --- \| --- \| --- \|\n\| conflict \| conflict and war \| swords \|/);
    expect(page).toMatch(/### Report cap\n\n- `steps`: `50`, `100`, `250`, `500`\n- `max`: 1000/);
    expect(page).toMatch(/### Preset sizes\n\n- `wide`: 1200 × 630\n- `square`: 1080 × 1080/);
    expect(page).toMatch(/### Areas\n\n\| code \| kind \| name \|/);
    // A key the contract gains later is listed without this code changing.
    const grown = renderShareSpec(PROSE, SOURCE, { ...CONTRACT, newThing: ['a', 'b'] });
    expect(grown).toContain('### New thing\n\n`a`, `b`');
  });

  it('says what is wrong when the code and the page part', () => {
    expect(shareSpecProblems(PROSE, SOURCE, CONTRACT)).toEqual([]);
    // The version in force, whichever it is: a bump must not need this test changed.
    const noHistory = PROSE.replace(new RegExp(`^- \\*\\*v${CONTRACT.version}\\*\\*.*$`, 'm'), '');
    expect(noHistory).not.toBe(PROSE);
    expect(shareSpecProblems(noHistory, SOURCE, CONTRACT)).toEqual([`The history has no entry for v${CONTRACT.version}, the version in force.`]);
    const moreMethods = { ...CONTRACT, methods: { ...CONTRACT.methods, flyTo: { args: 1, options: [] } } };
    expect(shareSpecProblems(PROSE, SOURCE, moreMethods)).toEqual(['flyTo is in the contract and not on ShareHandle, so it has no description.']);
    const { getReportLook: _dropped, ...fewer } = CONTRACT.methods;
    expect(shareSpecProblems(PROSE, SOURCE, { ...CONTRACT, methods: fewer })).toEqual(['getReportLook is on ShareHandle and not in the contract.']);
    const undocumented = SOURCE.replace('  /** Where the camera is right now. */\n', '');
    expect(shareSpecProblems(PROSE, undocumented, CONTRACT)).toEqual(['getView has no doc comment on ShareHandle.']);
    expect(shareSpecProblems(PROSE.replace('<!-- reference -->', ''), SOURCE, CONTRACT)).toEqual(['The prose has no <!-- reference --> line for the reference to go in.']);
  });
});
