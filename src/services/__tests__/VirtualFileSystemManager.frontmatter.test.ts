/**
 * Frontmatter in DataPack notes is data, never code.
 *
 * gray-matter chooses a frontmatter language from the first line, and for `---js` or
 * `---javascript` it evaluates the frontmatter with eval. DataPack notes were parsed
 * with its defaults, so a note could run code in the app's origin, where the signing
 * key lives.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { VirtualFileSystemManager } from '../VirtualFileSystemManager';

type NoteParser = { parseMarkdown(content: string): { frontmatter?: Record<string, unknown> } };
const parse = (content: string) => (new VirtualFileSystemManager() as unknown as NoteParser).parseMarkdown(content);
const ran = () => (globalThis as Record<string, unknown>).__frontmatterRan;

describe('DataPack note frontmatter', () => {
  afterEach(() => { delete (globalThis as Record<string, unknown>).__frontmatterRan; });

  it('never runs JavaScript frontmatter, under either name', () => {
    for (const language of ['js', 'javascript']) {
      const result = parse(`---${language}\n{ title: (globalThis.__frontmatterRan = true, "planted") }\n---\nBody text`);
      expect(ran()).toBeUndefined();
      expect(result.frontmatter).toBeUndefined();
    }
  });

  it('still reads YAML frontmatter', () => {
    const result = parse('---\ntitle: Field report\nconfidence: 0.8\n---\nBody text');
    expect(result.frontmatter).toEqual({ title: 'Field report', confidence: 0.8 });
  });
});
