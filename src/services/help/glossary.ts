/**
 * The glossary (plan item 3.2): the words Starcom uses that a new analyst
 * will not know, or will know to mean something else. Reachable from the "?"
 * beside a word (<WhatIs>), and from the header's command box.
 *
 * Each entry says what the word means here, in this app, as the code does
 * it: a definition that drifted from the code would teach the wrong thing to
 * the people least able to notice. Where a word is a decision (what a
 * distribution sends, what a package leaves out), the entry says the
 * decision, not a general meaning.
 */
export interface GlossaryEntry {
  /** Stable, for links: <WhatIs term="relay" />. */
  id: string;
  term: string;
  /** Other words people search for. */
  aka?: string[];
  /** One line, for a list or a hover. */
  short: string;
  body: string;
  /** Other entries worth reading next. */
  see?: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'navcom',
    term: 'Navcom',
    short: 'The application that reads the Mission Packages Starcom publishes.',
    body: 'Navcom is where missions are read and acted on. "Publish Mission Package" signs a mission as a Mission Package and sends it to the relays Navcom reads. Starcom assembles and signs; Navcom receives. Packages other nodes publish arrive in Missions, under received packages.',
    see: ['package', 'dispatch', 'relay'],
  },
  {
    id: 'relay',
    term: 'Relay',
    aka: ['relays', 'nostr relay'],
    short: 'A server that stores signed events and passes them on (Nostr).',
    body: 'Starcom reads and publishes through relays. Each relay is run by someone, and holds what its operator lets it hold. A public relay serves anyone, and what it has cannot be recalled. A team relay asks who you are before you read or write (NIP-42). It keeps a signed member list (NIP-43).',
    see: ['internal', 'visibility', 'sealed'],
  },
  {
    id: 'internal',
    term: 'Internal relay',
    aka: ['internal'],
    short: 'A relay with access control: only the keys allowed on it can read or write.',
    body: 'Internal relays are the ones this build names, reached through its own tunnel. A team relay you joined counts too. Work marked Limited goes only to the build\'s internal relays. A relay being internal does not make what is on it secret from whoever runs it.',
    see: ['relay', 'visibility'],
  },
  {
    id: 'visibility',
    term: 'Public, Limited, Private',
    aka: ['public', 'limited', 'private', 'distribution', 'visibility'],
    short: 'Who may receive a record: anyone, your team, or nobody but you.',
    body: 'Public goes to public relays: anyone can read it, and it cannot be recalled. Limited goes only to your team\'s internal relays. Private stays in this workspace and is never sent. You choose it for each case, mission and report. The publish review names where each thing goes before it is sent.',
    see: ['internal', 'relay', 'package'],
  },
  {
    id: 'package',
    term: 'Mission Package',
    aka: ['package', 'packages'],
    short: 'A mission as it is published: briefing, objectives and how much it rests on, signed.',
    body: 'A Mission Package carries a mission\'s briefing and objectives, and counts the reports and cases behind it without carrying them. It never names the analysts who worked on it. It is signed twice: with ML-DSA-65, a post-quantum signature, and with your Nostr key. Publishing one sends it to Navcom\'s relays through the publish review.',
    see: ['navcom', 'dispatch', 'corroboration'],
  },
  {
    id: 'case-position',
    term: 'Case position',
    aka: ['position'],
    short: 'What a case says its evidence shows, stated by whoever works it.',
    body: 'A position is a statement and a verdict, resting on the case\'s evidence and answering what argues against it. A case cannot be resolved without one. If the case\'s distribution allows, the position can be published as a finding, where others can contest it.',
    see: ['verdict', 'corroboration'],
  },
  {
    id: 'verdict',
    term: 'Verdict',
    aka: ['substantiated', 'unsubstantiated', 'inconclusive'],
    short: 'Substantiated, unsubstantiated or inconclusive: what the evidence does to the question.',
    body: 'Substantiated: the evidence supports what the case was opened on. Unsubstantiated: the evidence weighs against it, which is different from finding nothing. Inconclusive: the evidence does not settle it, and saying so is the finding, not a failure.',
    see: ['case-position'],
  },
  {
    id: 'corroboration',
    term: 'Corroboration',
    aka: ['corroborated', 'single-source'],
    short: 'Whether independent sources agree, counted by feed, not by record.',
    body: 'Two reports from different feeds that say the same thing corroborate each other. Two from the same feed do not, however many. A mission shows what corroboration stands behind it. It describes; it does not gate. A single-source mission may rest on one good report. What matters is knowing which kind you send.',
    see: ['case-position', 'package'],
  },
  {
    id: 'geohash',
    term: 'Geohash',
    short: 'A short code for an area on the map; each character narrows it.',
    body: 'A geohash names a cell, not a point: "dr5r" is tens of kilometres across, "dr5ru7" about a kilometre. A geohash says roughly where. The globe draws it as the area it is, not as a precise pin.',
    see: ['visibility'],
  },
  {
    id: 'dispatch',
    term: 'Dispatch',
    aka: ['dispatched', 'delegate', 'delegation'],
    short: 'Handing a published mission to the people who will act on it.',
    body: 'A mission is dispatched only when a relay has taken its package and said so. You can let a teammate dispatch it with a signed grant, and revoke that with a reason. Both go through the publish review.',
    see: ['package', 'navcom'],
  },
  {
    id: 'bundle',
    term: 'Bundle',
    aka: ['bundles', 'export', 'import'],
    short: 'A case or mission with its reports, signed, handed to a teammate.',
    body: 'A bundle carries a case or mission, the reports it cites, and the intel those cite. It is signed, so whoever receives it can tell who sent it and that nothing changed. It goes as a file, or sealed to them over a relay. A Private case or mission never goes to anyone else. A Private record it cites stays behind. Whoever receives it is told one was kept back, never what it holds. To keep your own work, Private included, use Export all my work under Your key. Only your key opens that file. One nobody has decided on is asked about first. Importing shows what it holds first, keeps its links, and says who it came from.',
    see: ['sealed', 'key', 'visibility'],
  },
  {
    id: 'sealed',
    term: 'Sealed',
    aka: ['gift wrap', 'nip-59', 'encrypted'],
    short: 'Encrypted to one person so a relay sees only that they received something.',
    body: 'A sealed message is encrypted to its recipient and wrapped (NIP-59) in an event signed by a key used once. The relay learns the recipient\'s key and roughly when, never who sent it and never what it says. Direct messages, team messages and bundles sent over a relay are sealed to each person.',
    see: ['post-quantum', 'bundle', 'relay'],
  },
  {
    id: 'post-quantum',
    term: 'Post-quantum',
    aka: ['ml-kem', 'ml-dsa', 'pqc', 'quantum'],
    short: 'Encryption and signatures meant to hold against a future quantum computer.',
    body: 'A message to someone who has published a post-quantum key is encrypted with ML-KEM-768 inside its seal. To someone who has not, it is still sealed, and says it is not post-quantum. Mission Packages and bundles are signed with ML-DSA-65 as well as with your Nostr key.',
    see: ['sealed', 'package'],
  },
  {
    id: 'key',
    term: 'Key and npub',
    aka: ['key', 'npub', 'nsec', 'identity', 'signer'],
    short: 'Your key is who you are on Nostr; your npub is its public half.',
    body: 'Everything you sign carries your key, and that is how others know it was you. Your npub is safe to share: it is what people add to reach you or let you in. The secret half never leaves this browser or your signing extension. Anyone who has it can sign as you, so never paste it anywhere. "Your key" in the header shows yours.',
    see: ['sealed', 'relay'],
  },
];

/** Entries whose term, other words or one line match, best first. */
export function findTerms(query: string): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return GLOSSARY;
  const score = (e: GlossaryEntry): number => {
    if (e.term.toLowerCase() === q || e.id === q || e.aka?.includes(q)) return 3;
    if (e.term.toLowerCase().includes(q) || e.aka?.some((a) => a.includes(q))) return 2;
    return e.short.toLowerCase().includes(q) ? 1 : 0;
  };
  return GLOSSARY.map((e) => ({ e, s: score(e) })).filter(({ s }) => s > 0).sort((a, b) => b.s - a.s).map(({ e }) => e);
}

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.id === id);
}
