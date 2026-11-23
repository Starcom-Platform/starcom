/**
 * The chosen families, self-hosted once (plan item 8.2). Orbitron and Rajdhani
 * loaded twice, from public/fonts and from Google, and six named fonts were
 * never loaded at all. The three of pairing A load from the app's own files,
 * and nothing asks Google for a font.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('fonts', () => {
  it('load once, from the app, in the weights the type uses', () => {
    const main = read('src/main.tsx');
    for (const w of ['@fontsource/oxanium/600.css', '@fontsource/oxanium/700.css',
      '@fontsource/ibm-plex-sans/400.css', '@fontsource/ibm-plex-sans/500.css', '@fontsource/ibm-plex-sans/600.css',
      '@fontsource/jetbrains-mono/400.css']) {
      expect(main, w).toContain(`import '${w}';`);
    }
  });

  it('are not fetched from Google, nor preloaded under the old names', () => {
    expect(read('src/styles/globals.css')).not.toMatch(/fonts\.googleapis\.com/);
    const html = read('index.html');
    expect(html).not.toMatch(/orbitron|rajdhani/i);
    expect(fs.existsSync(path.join(process.cwd(), 'public/fonts/fonts.css'))).toBe(false);
  });

  it('set the body in the text font, from the tokens', () => {
    expect(read('src/styles/globals.css')).toMatch(/body\s*\{[^}]*font-family:\s*var\(--sc-font-text\)/);
  });
});
