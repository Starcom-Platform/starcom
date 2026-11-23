/**
 * The house style, held by the build (plan item 3.1): a sentence of the app's
 * copy is under 20 words, and a count never says "(s)". Found in the walk of
 * 2026-09-26: much of the wording stated the app's honesty as an essay, and a
 * newcomer read neither the essay nor the caveat inside it. The plan's line is
 * "over 20 words", the style's "under 20": the guard fails over 20.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-copy-length.mjs';
const LONG = 'This sentence has been written with far too many words in it for a newcomer to take in at a glance on a screen they have never seen.';
const run = (files: Record<string, string>) => runGuardIn(GUARD, files);

describe('guard-copy-length', () => {
  it('fails on a sentence of over 20 words in what a screen says, naming where and how long', () => {
    const r = run({ 'src/components/Panel.tsx': `export const Panel = () => <p>Short first. ${LONG}</p>;\n` });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/components\/Panel\.tsx:1 {2}28 words {2}This sentence has been written/);
  });

  it('passes a sentence of exactly 20 words, and fails one of 21', () => {
    const twenty = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.';
    expect(run({ 'src/components/A.tsx': `export const A = () => <p>${twenty}</p>;\n` }).status).toBe(0);
    const r = run({ 'src/components/A.tsx': `export const A = () => <p>${twenty.replace('.', ' more.')}</p>;\n` });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/A\.tsx:1 {2}21 words/);
  });

  it('fails on "(s)" in a count', () => {
    const r = run({ 'src/components/Count.tsx': 'export const Count = ({ n }: { n: number }) => <span>{`${n} record(s) drawn`}</span>;\n' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/components\/Count\.tsx:1 {2}"\(s\)"/);
  });

  it("reads a string that goes to the screen by way of a variable, counting each value as one word", () => {
    const r = run({ 'src/components/Note.tsx': `const note = (n: number) => \`\${n} ${LONG}\`;\nexport const Note = () => <p>{note(1)}</p>;\n` });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/Note\.tsx:1 {2}29 words/);
  });

  it('reads the modules that hold the words the app says', () => {
    const r = run({
      'src/components/Ok.tsx': 'export const Ok = () => <p>Fine.</p>;\n',
      'src/services/help/glossary.ts': `export const GLOSSARY = [{ body: '${LONG}' }];\n`,
    });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/src\/services\/help\/glossary\.ts:1/);
  });

  it('passes short sentences, SVG path data, markdown documents and tests', () => {
    const r = run({
      'src/components/Ok.tsx': [
        'export const Ok = () => (',
        '  <div title="Nothing here is long. Each sentence says one thing.">',
        '    <svg><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.446.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25" /></svg>',
        '    Say what the person can do next.',
        '  </div>',
        ');',
        `export const DOC = \`---\\nconfidence: 0.85\\n---\\n# Heading\\n${LONG}\\n\`;`,
        // Path data kept in a constant, as SupportSocialIcons keeps its icons: not a sentence.
        `export const PATH = 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387${' 0 0 1 1.2 3.4 0 0 1'.repeat(6)}';`,
      ].join('\n'),
      'src/components/__tests__/Ok.test.tsx': `it('x', () => '${LONG}');\n`,
    });
    expect(r.output).not.toMatch(/\d+ words {2}|"\(s\)"  /);
    expect(r.status).toBe(0);
  });

  it("leaves the project's own appeal as its owner wrote it, and says so", () => {
    const r = run({
      'src/components/Ok.tsx': 'export const Ok = () => <p>Fine.</p>;\n',
      'src/components/SupportDrive/SupportFunnelRoot.tsx': `export const A = () => <p>${LONG}</p>;\n`,
    });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/allowed {2}src\/components\/SupportDrive\/SupportFunnelRoot\.tsx/);
  });

  it('fails rather than pass when it finds nothing to read', () => {
    const r = run({ 'README.md': 'nothing' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/nothing to read/i);
  });
});
