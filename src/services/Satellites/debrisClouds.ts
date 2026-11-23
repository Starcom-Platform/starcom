/**
 * The three debris clouds the globe draws (D-GV GV2, step 6), as CelesTrak lists them among its special-interest
 * groups, each with what broke up and when, as NASA's Orbital Debris Program Office reported it at the time.
 *
 * CelesTrak's active group holds no debris: until these were loaded, "Debris" on the globe was only the odd object
 * whose name happened to read as one.
 */
export interface DebrisCloud {
  /** The space-assets provider's key for its group. */
  key: string;
  /** CelesTrak's GROUP for it. */
  group: string;
  /** The cloud in a few words, for a hover. */
  name: string;
  /** The breakup, a sentence for a note. */
  breakup: string;
  /** When it broke up, UTC: the day where the report gives no hour. Where the spread's lapse starts it. */
  breakupAt: string;
  /** Where that is reported. */
  source: string;
}

const ODQN_2007 = 'https://orbitaldebris.jsc.nasa.gov/quarterly-news/pdfs/odqnv11i2.pdf';
const ODQN_2009 = 'https://orbitaldebris.jsc.nasa.gov/quarterly-news/pdfs/odqnv13i2.pdf';

export const DEBRIS_CLOUDS: readonly DebrisCloud[] = [
  {
    key: 'debris-fengyun-1c',
    group: 'fengyun-1c-debris',
    name: 'debris of Fengyun-1C (2007)',
    breakup: 'From Fengyun-1C, a Chinese weather satellite in an orbit about 850 km up, struck in a Chinese anti-satellite test on 11 January 2007.',
    breakupAt: '2007-01-11T00:00:00Z',
    source: ODQN_2007,
  },
  {
    key: 'debris-cosmos-2251',
    group: 'cosmos-2251-debris',
    name: 'debris of Cosmos 2251 (2009)',
    breakup: 'From Cosmos 2251, a decommissioned Russian communications satellite, which collided with Iridium 33 at 790 km over northern Siberia on 10 February 2009.',
    breakupAt: '2009-02-10T16:56:00Z',
    source: ODQN_2009,
  },
  {
    key: 'debris-iridium-33',
    group: 'iridium-33-debris',
    name: 'debris of Iridium 33 (2009)',
    breakup: 'From Iridium 33, a working US communications satellite, which collided with Cosmos 2251 at 790 km over northern Siberia on 10 February 2009.',
    breakupAt: '2009-02-10T16:56:00Z',
    source: ODQN_2009,
  },
];

/** The cloud a provider key names, if it names one. */
export function debrisCloudOf(key: string | undefined): DebrisCloud | undefined {
  return key === undefined ? undefined : DEBRIS_CLOUDS.find((cloud) => cloud.key === key);
}
