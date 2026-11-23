import { describe, it, expect } from 'vitest';
import { PackageComposer } from '../PackageComposer';
import { validateManifest } from '../schema';

describe('PackageComposer', () => {
  it('composes a manifest with deterministic fields and valid schema', () => {
    const input = {
      name: 'Test Package',
      description: 'A test package',
      license: 'CC0' as const,
      author: 'tester',
      reports: [{ id: 'r1', title: 'Report 1', content: 'alpha' }],
      intel: [{ id: 'i1', title: 'Intel 1', content: 'beta' }],
      assets: [{ filename: 'note.txt', content: 'hello' }],
      analysisDeepLink: 'app://analyzer?board=123'
    };

    const { manifest, blob } = PackageComposer.compose(input);

    expect(manifest.id).toMatch(/^pkg-/);
    expect(manifest.name).toBe('Test Package');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.reports[0]).toMatchObject({ id: 'r1', title: 'Report 1' });
    expect(typeof manifest.reports[0].checksum).toBe('string');
    expect(manifest.intel[0]).toMatchObject({ id: 'i1', title: 'Intel 1' });
    expect(typeof manifest.intel[0].checksum).toBe('string');
    expect(manifest.assets[0].filename).toBe('note.txt');
    expect(manifest.assets[0].size).toBe(5);
    expect(manifest.metadata).toHaveProperty('analysisDeepLink', 'app://analyzer?board=123');

    // blob should be JSON of manifest
    expect(blob.type).toBe('application/json');

    // schema validation
    const result = validateManifest(manifest);
    if (result.valid === false) {
      // helpful debug if fails
      // eslint-disable-next-line no-console
      console.error(result.errors);
    }
    expect(result.valid).toBe(true);
  });

  it('fails schema validation for bad manifest', () => {
    const bad: any = { id: '', name: '', version: '', description: '' };
    const res = validateManifest(bad);
    expect(res.valid).toBe(false);
  });

  // Cycle 4: extended for Mission Packages (relatedReportCount/objectiveCount/etc.),
  // merged alongside the pre-existing analysisDeepLink-only metadata.
  it('merges input.metadata into the manifest alongside analysisDeepLink', () => {
    const { manifest } = PackageComposer.compose({
      name: 'Metadata Package',
      description: 'desc',
      license: 'CC0',
      author: 'tester',
      reports: [],
      intel: [],
      analysisDeepLink: 'app://analyzer?board=123',
      metadata: { missionNumber: 'MSN-2026-0001', relatedReportCount: 2 }
    });
    expect(manifest.metadata).toMatchObject({
      analysisDeepLink: 'app://analyzer?board=123',
      missionNumber: 'MSN-2026-0001',
      relatedReportCount: 2
    });
  });

  describe('redaction', () => {
    function compose(description: string, redaction: NonNullable<Parameters<typeof PackageComposer.compose>[0]['redaction']>) {
      return PackageComposer.compose({
        name: 'Redaction Test',
        description,
        license: 'CC0',
        author: 'tester',
        reports: [],
        intel: [],
        redaction
      }).manifest;
    }

    it('applies redaction to description, not just report/intel content — description crosses into the manifest verbatim otherwise', () => {
      const manifest = compose('Contact analyst@earthalliance.example for follow-up.', { maskEmails: true });
      expect(manifest.description).not.toContain('analyst@earthalliance.example');
      expect(manifest.description).toContain('[redacted@email]');
    });

    it('leaves description untouched when no redaction is requested', () => {
      const manifest = compose('Contact analyst@earthalliance.example for follow-up.', {});
      expect(manifest.description).toContain('analyst@earthalliance.example');
    });

    it('maskNames redacts a Firstname-Lastname-shaped sequence', () => {
      const manifest = compose('Briefed by Jane Doe this morning.', { maskNames: true });
      expect(manifest.description).not.toContain('Jane Doe');
      expect(manifest.description).toContain('[redacted:name]');
    });

    it.each([
      ['French', 'François Mitterrand'],
      ['Icelandic', 'Ólafur Jónsson'],
      ['Russian', 'Владимир Петров'],
      ['Greek', 'Γιώργος Παπαδόπουλος'],
      ['Polish', 'Łukasz Nowak'],
      ['typographic apostrophe', 'Siobhán O’Brien'],
      ['plain apostrophe', "Marco D'Angelo"],
    ])('maskNames redacts a %s name, which the ASCII pattern passed through in full', (_script, name) => {
      /*
       * Every one of these is capitalized and two words — the exact shape the
       * option says it catches. The pattern was [A-Z][a-z]+ and matched none of
       * them, so the feature worked on English names and silently not on
       * anyone else's, which is worse than working on neither: it is trusted by
       * whoever tested it in English.
       */
      const manifest = compose(`Briefed by ${name} this morning.`, { maskNames: true });
      expect(manifest.description).not.toContain(name);
      expect(manifest.description).toContain('[redacted:name]');
    });

    it.each([
      ['Chinese', '李明'],
      ['Arabic', 'محمد علي'],
      ['Thai', 'นายสมชาย'],
    ])('maskNames CANNOT redact a %s name, and the option says so', (_script, name) => {
      /*
       * Asserted rather than left unsaid, because this limit is not a bug to be
       * fixed by a better pattern. The entire heuristic is "a capital letter
       * followed by lowercase ones", and these writing systems have no case to
       * key on. Anyone reaching for maskNames on content carrying such names
       * needs to know it will report nothing found and be wrong.
       *
       * If this test ever fails because real named-entity recognition arrived,
       * the doc comment on ComposeInput['redaction']['maskNames'] is now stale
       * and is the thing to update.
       */
      const manifest = compose(`Briefed by ${name} this morning.`, { maskNames: true });
      expect(manifest.description).toContain(name);
    });

    it('maskNames is best-effort, not exhaustive — a lone first name is a known, accepted false negative', () => {
      const manifest = compose('Briefed by Jane this morning.', { maskNames: true });
      // Documents the limitation rather than asserting a false guarantee —
      // see ComposeInput['redaction']['maskNames']'s own doc comment.
      expect(manifest.description).toContain('Jane');
    });
  });
});
