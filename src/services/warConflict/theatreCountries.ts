/**
 * Where each of Mecha Jono's theatres is fought: its countries, as Interchange 3.5's
 * conflict vocabulary lists them (theatre-lens.md, TL11), kept in
 * docs/missions/01-architecture-decisions/war-conflict/conflict_vocabulary_3_5.json.
 *
 * Mirrored here as the event glyphs and the source names are (warConflictView.ts);
 * a test checks it against the kept vocabulary, so a release that changes a theatre
 * fails there rather than drifting. The war map fills these, not every country on a
 * war's Wikipedia list (TL1).
 */
export const THEATRE_COUNTRIES: Readonly<Record<string, readonly string[]>> = {
  'russia-ukraine': ['ua', 'ru'],
  'turkey-pkk': ['tr', 'iq', 'sy'],
  'israel-palestine': ['ps', 'il'],
  'iraq': ['iq'],
  'israel-lebanon': ['lb', 'il'],
  'iran': ['ir'],
  'yemen-red-sea': ['ye'],
  'syria': ['sy'],
  'afghanistan-pakistan': ['af', 'pk'],
  'pakistan-insurgency': ['pk'],
  'india-pakistan': ['in', 'pk'],
  'myanmar': ['mm'],
  'korea': ['kp', 'kr'],
  'taiwan-scs': ['tw', 'cn', 'ph'],
  'thailand-cambodia': ['kh', 'th'],
  'armenia-azerbaijan': ['am', 'az'],
  'south-sudan': ['ss'],
  'sudan': ['sd'],
  'ethiopia-eritrea': ['et', 'er'],
  'somalia': ['so'],
  'drc': ['cd'],
  'sahel': ['ml', 'bf', 'ne'],
  'nigeria': ['ng'],
  'mozambique': ['mz'],
  'cameroon': ['cm'],
  'libya': ['ly'],
  'haiti': ['ht'],
  'colombia': ['co'],
  'mexico': ['mx'],
  'venezuela': ['ve'],
};
