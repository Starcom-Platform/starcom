/**
 * Whether this build may show one of Mecha Jono's notes, by the note's own licence tag (decision D-CS, CS6). The
 * non-commercial build shows every note. The commercial build shows a note only when its `license` tag allows
 * commercial use; an untagged note, or one whose licence it cannot place, it does not show.
 *
 * The tag is `["license", <words>, <SPDX id>?]`. Starcom asked Mecha Jono (11 Nov, ad8b2b40-6b9a) to add the SPDX id
 * as the second value; until then the words decide. Non-commercial (NC) and no-derivatives (ND) licences are refused:
 * a card or a clip drawn from a note may be a derivative.
 */
import { buildProfile, type BuildProfile } from './buildProfile';
import { MECHA_JONO_KEYS } from '../config/publicInfrastructure';

/** SPDX ids, and Starcom's own LicenseRef, that allow commercial use. */
const SPDX_ALLOWED = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'CC-BY-3.0-IGO', 'ODbL-1.0', 'OGL-UK-3.0',
  'etalab-2.0', 'PDDL-1.0', 'LicenseRef-us-gov',
]);

/** Words that refuse commercial use, or say the note's own licence is someone else's to read. */
const REFUSED = /\bNC\b|non-?commercial|\bND\b|no[- ]derivatives|headline and link only|each linked note's own|each count's source/i;

/** Words that place a licence allowing commercial use. */
const ALLOWED = new RegExp([
  'CC0', 'public domain', '17 U\\.S\\.C\\. 105', 'US government work', '\\bCC BY\\b', 'Open Government Licen[cs]e',
  '\\bOGL\\b', 'Licence Ouverte', 'ODbL', 'Open Database License', 'GIS Open Data Licen[cs]e', 'Public Data License',
  'GDELT Project terms',
].join('|'), 'i');

type Tags = ReadonlyArray<ReadonlyArray<string>>;

/** Whether a licence tag's values allow commercial use. */
export function licenceAllowsCommercial(words: string | undefined, spdx?: string): boolean {
  if (spdx) return SPDX_ALLOWED.has(spdx.trim());
  if (!words || !words.trim()) return false;
  if (REFUSED.test(words)) return false;
  return ALLOWED.test(words);
}

/** Whether this build may show a note, by its `license` tag. */
export function noteShownInThisBuild(note: { tags: Tags }, profile: BuildProfile = buildProfile()): boolean {
  if (profile === 'noncommercial') return true;
  const tag = note.tags.find((t) => t[0] === 'license');
  return tag ? licenceAllowsCommercial(tag[1], tag[2]) : false;
}

const MECHA_JONO = new Set(MECHA_JONO_KEYS);

/**
 * Whether a note read from a relay reaches Starcom's readers in this build: every note but one of Mecha Jono's that
 * the commercial build may not show (CS6). Other people's notes come under the terms of use, not this rule.
 */
export function mjNoteShown(note: { pubkey: string; tags: Tags }, profile: BuildProfile = buildProfile()): boolean {
  return profile === 'noncommercial' || !MECHA_JONO.has(note.pubkey) || noteShownInThisBuild(note, profile);
}
