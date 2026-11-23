// eventAggregation.ts — many events about the same countries, counted.
//
// ─── WHY ───────────────────────────────────────────────────────────────────
//
// GDELT events name their actors by country, and both GeoPolitical layers drew ONE
// sphere per (event, country) at that country's single centroid — each with its own
// geometry and its own material, nearly all stacked exactly on top of one another,
// because a country has one centroid however many events mention it. The connections
// were the same: one arc per event, not per relationship.
//
// Of the set the layers actually draw (the snapshot filtered by type and by the day
// before its own asOf), measured 2026-09-11: Diplomacy's 2,085 events made 4,170
// spheres over 125 countries and 2,085 arcs over 326 pairs; Conflict's 2,968 made 5,936
// spheres over 130. Ten thousand objects to say what a few hundred marks can say — and
// the stack hid its own size, since a country with one event and a country with ninety
// looked identical.
//
// Measured again after this, live in the app on 2026-09-12: Diplomacy draws 115 marks in
// ONE object and 272 arcs; Conflict draws 125 war marks and 170 displacement marks, two
// objects. Cyber Threats already solved this for blocklist entries
// (cyberAttackClustering.ts); this is the same move for events with two actors.
//
// Pure and generic over the event shape, so Diplomacy and Conflict share it and
// neither has to know how the other reads its events.

/** What one country's events add up to. */
export interface CountryEventTally<T> {
  countryCode: string;
  /** Events naming this country, as either actor. */
  count: number;
  /** The category most of them fall in, and how many that is. */
  dominantCategory: string | null;
  dominantCount: number;
  /**
   * Mean Goldstein across them, or null where no event carried one: GDELT's
   * cooperation-to-conflict scale, -10 to +10. Kept because a country's events are
   * rarely all of one kind, and a colour taken from the dominant category alone says
   * nothing about how mixed they were.
   */
  meanGoldstein: number | null;
  events: T[];
}

/** What one pair of countries' events add up to. */
export interface CountryPairTally<T> {
  /** The two codes, always in the same order for the same pair, so A-B and B-A merge. */
  a: string;
  b: string;
  count: number;
  events: T[];
}

export interface EventReaders<T> {
  /** The countries an event names. One, two, or none. */
  actors: (event: T) => Array<string | null | undefined>;
  /** The bucket it belongs in, if the layer has categories. */
  category?: (event: T) => string | null;
  /** Its Goldstein score, where it has one. */
  goldstein?: (event: T) => number | null | undefined;
}

/**
 * One tally per country named by any event, most events first. A country named twice by
 * the same event is counted once for it: an event where both actors are the same country
 * is one event about that country, not two.
 */
export function tallyEventsByCountry<T>(events: readonly T[], read: EventReaders<T>): Array<CountryEventTally<T>> {
  const byCountry = new Map<string, { events: T[]; categories: Map<string, number>; goldsteins: number[] }>();

  for (const event of events) {
    const codes = new Set(read.actors(event).filter((code): code is string => Boolean(code)));
    const category = read.category?.(event) ?? null;
    const goldstein = read.goldstein?.(event);
    for (const code of codes) {
      const entry = byCountry.get(code) ?? { events: [], categories: new Map(), goldsteins: [] };
      entry.events.push(event);
      if (category) entry.categories.set(category, (entry.categories.get(category) ?? 0) + 1);
      if (typeof goldstein === 'number' && Number.isFinite(goldstein)) entry.goldsteins.push(goldstein);
      byCountry.set(code, entry);
    }
  }

  const tallies: Array<CountryEventTally<T>> = [];
  byCountry.forEach((entry, countryCode) => {
    let dominantCategory: string | null = null;
    let dominantCount = 0;
    // Ties break on the category name, so the same events always give the same answer.
    const ranked = [...entry.categories.entries()].sort((x, y) => (y[1] - x[1]) || x[0].localeCompare(y[0]));
    if (ranked.length > 0) {
      dominantCategory = ranked[0][0];
      dominantCount = ranked[0][1];
    }
    tallies.push({
      countryCode,
      count: entry.events.length,
      dominantCategory,
      dominantCount,
      meanGoldstein: entry.goldsteins.length
        ? entry.goldsteins.reduce((sum, g) => sum + g, 0) / entry.goldsteins.length
        : null,
      events: entry.events,
    });
  });
  return tallies.sort((x, y) => (y.count - x.count) || x.countryCode.localeCompare(y.countryCode));
}

/**
 * One tally per pair of countries an event names, most events first. Events naming only
 * one country have no pair and are left out — their country still has a tally above.
 */
export function tallyEventsByPair<T>(events: readonly T[], read: EventReaders<T>): Array<CountryPairTally<T>> {
  const byPair = new Map<string, CountryPairTally<T>>();

  for (const event of events) {
    const codes = [...new Set(read.actors(event).filter((code): code is string => Boolean(code)))];
    if (codes.length < 2) continue;
    // Every unordered pair among the actors: two actors give one pair.
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const [a, b] = [codes[i], codes[j]].sort();
        const key = `${a} ${b}`;
        const entry = byPair.get(key) ?? { a, b, count: 0, events: [] };
        entry.count++;
        entry.events.push(event);
        byPair.set(key, entry);
      }
    }
  }

  return [...byPair.values()].sort((x, y) => (y.count - x.count) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

/**
 * Pairs split into three weights by how many events they carry, so an arc's width says
 * something. One material is drawn per bucket: the line material these arcs use carries
 * its width for the whole group, so per-pair width would mean per-pair material — which
 * is the thousands of objects this module exists to avoid.
 *
 * The thresholds come from the shipped snapshot rather than a guess. Measured
 * 2026-09-12: Diplomacy's 12,471 events make 1,154 country pairs whose per-pair counts
 * run 1 to 379, median 4, p75 9, p90 20; Conflict's 3,214 make 464 pairs, median 3, p90
 * 13. Only a tenth of pairs carry a single event, so a "one event" band would have been
 * nearly empty — a fact worth having measured, because the first version of this split
 * assumed the opposite and left most arcs in one middle weight.
 */
export function bucketPairsByCount<T>(pairs: ReadonlyArray<CountryPairTally<T>>): Array<{
  weight: 'faint' | 'plain' | 'bold';
  pairs: Array<CountryPairTally<T>>;
}> {
  return [
    { weight: 'faint' as const, pairs: pairs.filter((p) => p.count <= 2) },
    { weight: 'plain' as const, pairs: pairs.filter((p) => p.count >= 3 && p.count <= 9) },
    { weight: 'bold' as const, pairs: pairs.filter((p) => p.count >= 10) },
  ].filter((bucket) => bucket.pairs.length > 0);
}
