/**
 * Starcom speaks as itself: no card, video frame or preview names the publisher whose notes
 * it draws (the operator, 24 October 2026; record D-L, data-licensing.md). A card's Data line keeps
 * every credit a source's terms ask for; our own notes are our own work and are credited to nobody.
 *
 * Read from the code that writes what a capture prints: the card's lines, the feeds' names and
 * standing notes, the key, the tour's captions and the names of areas. Comments are set aside:
 * they may say whose notes these are, which no viewer reads.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CREDITS, creditLine } from '../sourceCredits';

const PUBLISHER = /Mecha Jono|Archangel/;

const SRC = path.resolve(__dirname, '../../../..');
const inDir = (dir: string) => fs.readdirSync(path.join(SRC, dir))
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => path.join(dir, file));

/** What a capture can print is written here. */
const PRINTED = [
  ...inDir('features/globe/capture'),
  ...inDir('features/globe/tour'),
  'features/globe/areas/areaRegistry.ts',
  'features/globe/areas/zoneAreas.ts',
  'features/globe/areas/listedAreas.ts',
  'components/Globe/Hooks/useGlobeWarConflict.ts',
  'components/Globe/Hooks/useGlobeHeroWatch.ts',
  'components/Globe/Hooks/useGlobeRaverWatch.ts',
  'components/Globe/Hooks/useGlobeAiWatch.ts',
  'components/Globe/Hooks/useGlobeLayerControl.ts',
  'components/Globe/AiWatchPanel.tsx',
  'components/Globe/Hooks/useGlobeCivilUnrest.ts',
  'services/civilUnrest/civilUnrestView.ts',
  'services/warConflict/warConflictBrief.ts',
  'services/warConflict/warConflictView.ts',
  'services/heroWatch/heroWatchWeek.ts',
];

/** The code without its comments: block comments, JSX's among them, and line comments (not a URL's "://"). */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

describe('what a capture prints', () => {
  it('names no publisher of ours, in any file that writes it', () => {
    const named = PRINTED.flatMap((file) => withoutComments(fs.readFileSync(path.join(SRC, file), 'utf8'))
      .split('\n')
      .filter((line) => PUBLISHER.test(line))
      .map((line) => `${file}: ${line.trim()}`));
    expect(named).toEqual([]);
  });

  it('reads every file it names, so a file moved is not a file passed', () => {
    for (const file of PRINTED) expect(fs.existsSync(path.join(SRC, file)), file).toBe(true);
    expect(PRINTED.length).toBeGreaterThan(40);
  });

  it('sets aside comments only', () => {
    expect(withoutComments("/** Mecha Jono's notes */\nconst a = 'x';")).not.toMatch(PUBLISHER);
    expect(withoutComments("const a = 'x'; // Mecha Jono's ask")).not.toMatch(PUBLISHER);
    expect(withoutComments("{/* Mecha Jono writes the titles */}<div>x</div>")).not.toMatch(PUBLISHER);
    expect(withoutComments("const a = 'via Mecha Jono';")).toMatch(PUBLISHER);
    expect(withoutComments("const url = 'https://x.org/'; const b = `Archangel`;")).toMatch(PUBLISHER);
  });
});

describe('the Data line', () => {
  it('credits each source whose terms ask, and no publisher of ours', () => {
    for (const [id, credit] of Object.entries(CREDITS)) {
      expect(`${creditLine(credit)} ${'keyText' in credit ? credit.keyText : ''}`, id).not.toMatch(PUBLISHER);
      expect(credit.text, id).not.toMatch(/The Record/);
    }
    expect(Object.keys(CREDITS)).not.toContain('mechaJono');
  });
});
