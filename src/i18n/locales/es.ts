import type { Messages } from '../messages';
import data from './es.json';

/**
 * Spanish — the first non-English locale.
 *
 * Chosen for reach rather than preference: second-most spoken native language,
 * and it covers regions where the open-data feeds this app ingests report the
 * most events. A defensible default, NOT a researched decision about who most
 * needs this. Whoever knows the intended users should confirm or replace it.
 *
 * TRANSLATION STATUS: machine-drafted, NOT reviewed by a native speaker. These
 * strings tell people whether to rely on a claim about the world, and some of
 * them ("do not rely on this") carry real consequences if softened in
 * translation. `scripts/check-i18n.mjs` reports it as unreviewed rather than
 * counting it as done.
 */
export const es: Messages = data;
