/**
 * Message catalogue.
 *
 * Hand-rolled rather than react-i18next or FormatJS, for one reason that is
 * measurable: the first-visit payload is already 1.80 MB gzipped and 32% of it
 * is wallet code nobody asked for (D9). Adding 40KB of i18n runtime to an app
 * whose weight is a tracked defect, in order to translate pages that are
 * currently static HTML with no runtime at all, would be trading the thing
 * that matters for the thing that is conventional.
 *
 * What is given up, stated plainly: no ICU plural rules, no gender selection,
 * no date/number formatting beyond Intl. If a locale needs real pluralisation
 * — Polish, Arabic, Russian all do — this is not sufficient and the right move
 * is to adopt a library then, for a reason, rather than now, by default.
 *
 * The catalogue is TYPED: a locale that omits a key does not compile. A
 * translation file that silently falls back to English is how half-translated
 * interfaces ship and stay half-translated for years, because nothing ever
 * reports the gap.
 */

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export interface Messages {
  /** Public claim pages — the read surface strangers actually land on. */
  commons: {
    allClaims: string;
    signatureVerified: string;
    signatureFailed: string;
    subjectIs: string;
    whatThisRestsOn: string;
    independentSources: string;
    observed: string;
    timingKnownTo: string;
    method: string;
    parametersUsed: string;
    published: string;
    weightHeading: string;
    weightNotAsserted: string;
    corroboration: string;
    precision: string;
    recency: string;
    weight: string;
    noWeightShown: string;
    checkingThisYourself: string;
    signatureIs: string;
    fingerprintsPublished: string;
    sourcesNotPublished: string;
    author: string;
    footer: string;
    claimsIndex: string;
    unverified: string;
    daysOld: string;
    hours: string;
  };
}

/**
 * Substitute {named} placeholders.
 *
 * Deliberately not a template-literal helper: the whole point is that the
 * string comes from a catalogue a translator edits, so the placeholders have
 * to survive being moved around inside the sentence. Word order differs
 * between languages and a positional scheme breaks the moment it does.
 */
export function interpolate(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole);
}
