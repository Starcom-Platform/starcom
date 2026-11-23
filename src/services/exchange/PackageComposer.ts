import { ComposeInput, ComposeResult, PackageManifest } from './types';
import { citationsOf } from '../intel/citations';
import JSZip from 'jszip';
import { createEd25519Signer } from './signing';

function checksum(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

/** What the package's announcement cites, beside its manifest and never in it (D-MX, MX22). Nothing when it rests on nothing. */
function citedBeside(input: ComposeInput): Pick<ComposeResult, 'cites'> {
  const cites = citationsOf([input]);
  return cites.length ? { cites } : {};
}

export class PackageComposer {
  static compose(input: ComposeInput): ComposeResult {
    const now = new Date().toISOString();
    /*
     * The caller's identity when it has one, the clock only as a fallback.
     *
     * This was always the clock, which meant a package had a different
     * identity every time it was composed — so kind 30079's replaceable slot
     * was never replaced, a mission republished appeared as a second package,
     * and the addressable coordinate a peer would reply to moved on every
     * publish. See MissionPackageBuilder.stableId.test.ts.
     */
    const id = input.id?.trim() || `pkg-${Date.now().toString(36)}`;

    const maskEmail = (s: string) => s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted@email]');
    const maskDigits = (s: string) => s.replace(/\d{9,}/g, (m) => '[redacted:number-' + m.length + ']');
    /*
     * A phone number written the usual ways: "(973) 555-0100", "973.555.0100",
     * "+44 20 7946 0958". maskDigits takes only unbroken runs, so every one of
     * these crossed into a Mission Package's description until the publish
     * review's first live run flagged one (plan item 0.1). Ten digits or more,
     * so a date (2026-09-26, eight) or a count is left alone.
     */
    const PHONE = /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{1,4}(?:[\s.-]\d{1,4}){1,4}(?!\w)/g;
    const maskPhones = (s: string) => s.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted:phone]' : m));
    const maskNumbers = (s: string) => maskDigits(maskPhones(s));
    /*
     * Best-effort heuristic — see ComposeInput['redaction']['maskNames'] for
     * the honest limitations, which are real in both directions.
     *
     * Unicode letter classes rather than [A-Z][a-z]. The ASCII version claimed
     * to mask "capitalized two-word sequences" and did so only in English:
     * measured against ten real names it passed five straight through —
     * François Mitterrand, Ólafur Jónsson, Владимир Петров, Γιώργος
     * Παπαδόπουλος, Łukasz Nowak — every one of them capitalized, every one of
     * them the exact shape the option says it catches. A redaction that works
     * on English names and silently not on anyone else's is worse than one that
     * works on neither, because it is trusted by whoever tested it in English.
     *
     * The typographic apostrophe is included too: O'Brien and O’Brien are the
     * same name and only one of them was being caught.
     */
    /*
     * One name-word, then whitespace, then another.
     *
     * The second alternative exists for O'Brien and D'Angelo: a single capital
     * before the separator. Written as an alternative rather than by relaxing
     * the first branch to `\p{Lu}\p{Ll}*`, which would have matched a bare
     * initial and started redacting "A Wednesday".
     */
    const NAME_WORD = String.raw`(?:\p{Lu}\p{Ll}+(?:[-'\u2019]\p{Lu}\p{Ll}+)?|\p{Lu}[-'\u2019]\p{Lu}\p{Ll}+)`;
    const maskName = (s: string) => s.replace(
      new RegExp(`${NAME_WORD}\\s+${NAME_WORD}`, 'gu'),
      '[redacted:name]',
    );
    /**
     * The unambiguous subset: identifiers that are never legitimately part of
     * prose someone means to publish. Safe to apply where the name heuristic
     * is not, because it cannot over-match a place or an operation name.
     */
    const redactIdentifiers = (s: string) => {
      let out = s;
      if (input.redaction?.maskEmails) out = maskEmail(out);
      if (input.redaction?.maskNumbers) out = maskNumbers(out);
      return out;
    };

    const redact = (s: string) => {
      let out = s;
      if (input.redaction?.maskEmails) out = maskEmail(out);
      if (input.redaction?.maskNumbers) out = maskNumbers(out);
      if (input.redaction?.maskNames) out = maskName(out);
      return out;
    };

    const reports = input.reports.map(r => {
      const content = redact(r.content);
      // The title crosses in full; the content does not, being reduced to a
      // checksum below. So the title is the field that needs masking here.
      return { id: r.id, title: redactIdentifiers(r.title), checksum: checksum(content) };
    });
    const intel = input.intel.map(i => {
      const content = redact(i.content);
      return { id: i.id, title: redactIdentifiers(i.title), checksum: checksum(content) };
    });
    /*
     * Redacted like `description`, not like a title.
     *
     * The distinction the title comment draws is between text that crosses as
     * a hash and text that crosses as text — and these cross as text, to be
     * read by a stranger deciding whether they can do the work. So they take
     * the full mask, name heuristic included, and inherit its known cost: a
     * two-capitalised-word place or operation name inside an ask may be
     * over-masked. Over-masking an ask is recoverable by asking; a person's
     * name crossing the boundary is not.
     */
    const objectives = input.objectives?.map((o) => ({
      id: o.id,
      ask: redact(o.ask),
      ...(o.handsBack ? { handsBack: redact(o.handsBack) } : {}),
      ...(typeof o.effortMinutes === 'number' ? { effortMinutes: o.effortMinutes } : {}),
      ...(o.for ? { for: o.for } : {}),
      ...(o.limits?.length ? { limits: o.limits.map(redact) } : {}),
      done: o.done,
    }));

    const assets = (input.assets || []).map(a => {
      const contentStr = typeof a.content === 'string' ? a.content : new TextDecoder().decode(a.content);
      return { filename: a.filename, checksum: checksum(contentStr), size: contentStr.length };
    });

    const manifest: PackageManifest = {
      id,
      /*
       * Titles cross as plaintext and were the last field redaction did not
       * touch. The briefing beside them is fully redacted; a name, an email or
       * a phone number typed into a mission TITLE crossed the Navcom boundary
       * unmasked, which is the same hole one field over.
       *
       * maskEmails and maskNumbers only. Deliberately NOT maskNames: that
       * heuristic is two capitalised words, so it turns "Operation Northern
       * Light" into "[redacted:name] Light" and every place name with it.
       * Over-masking a title is not a safe default either — it destroys the
       * one line an operator reads to decide whether a package concerns them.
       *
       * An email address or a nine-digit run in a title is never legitimate,
       * so those are unambiguous. Names in titles remain an open exposure and
       * are covered by the preview gate rather than by a regex.
       */
      name: redactIdentifiers(input.name),
      version: '0.1.0',
      // Real gap, fixed here: `description` previously bypassed `redact()`
      // entirely and crossed into the manifest verbatim, even though
      // `reports`/`intel` were (nominally) redacted before their content
      // was reduced to a checksum. Any caller relying on maskEmails/
      // maskNumbers/maskNames — Mission Package's redaction is unconditional,
      // not classification-gated — needs description covered too, since
      // it's the one field here that actually carries free text into the
      // final manifest rather than just a checksum of it.
      description: redact(input.description),
      visibility: input.visibility,
      createdAt: now,
      author: input.author,
      license: input.license,
      reports,
      intel,
      assets,
      ...(objectives?.length ? { objectives } : {}),
      ...(input.profile ? { profile: input.profile } : {}),
      metadata: {
        ...(input.analysisDeepLink && !input.redaction?.stripDeepLink ? { analysisDeepLink: input.analysisDeepLink } : {}),
        ...(input.metadata || {})
      }
    };

    // Optional signing: if enabled, sign manifest using provided private key
  // Note: signing occurs in composeZip where async is available.

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    return { manifest, blob, ...citedBeside(input) };
  }

  static async composeZip(input: ComposeInput): Promise<ComposeResult> {
    let { manifest } = this.compose(input);
    if (input.signing?.enabled && input.signing.privateKeyHex) {
      const signManifest = createEd25519Signer(input.signing.privateKeyHex);
      manifest = await signManifest(manifest);
    }
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    // Include assets when available
  if (input.assets && input.assets.length) {
      const folder = zip.folder('assets');
      for (const a of input.assets) {
    const content: string | Uint8Array = typeof a.content === 'string' ? a.content : a.content;
    folder?.file(a.filename, content);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return { manifest, blob, ...citedBeside(input) };
  }

  static async composeZipWithManifest(manifest: PackageManifest, assets?: ComposeInput['assets']): Promise<ComposeResult> {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    if (assets && assets.length) {
      const folder = zip.folder('assets');
      for (const a of assets) {
        const content: string | Uint8Array = typeof a.content === 'string' ? a.content : a.content;
        folder?.file(a.filename, content);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return { manifest, blob };
  }
}

export const packageComposer = PackageComposer;
