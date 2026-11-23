/**
 * Who made each image the globe draws, what Starcom changed, and which are drawn now
 * (decisions TX8–TX12; record docs/missions/01-architecture-decisions/earth-textures.md).
 *
 * A card names the imagery in its picture after its data (TX10), and the credits page
 * lists every image with its maker, its licence and what was changed (TX11, TX12). Both
 * read this one list, so they cannot disagree. Credited is what is drawn: a map that
 * failed and was drawn as a stand-in is not, nor clouds hidden or not yet loaded, nor
 * the planets and the Moon while they are faded out.
 *
 * Where each came from was traced on 2026-10-07. The relief map matches NASA Earth
 * Observatory's topography map resized (RMSE 0.77 of 255, against 39 for the same map
 * turned 180°); the dark base is byte for byte Google's WebGL Globe texture; the clouds
 * are Natural Earth III's, from NASA's 2002 Blue Marble cloud map. The water mask had no
 * source anyone could find, and was replaced with NASA's (TX9).
 *
 * NASA's imagery is credited as NASA's guidelines ask, and never called public domain
 * here: those guidelines say NASA material is generally not under copyright in the
 * United States, and also that NASA imagery is made available under them.
 */

export interface ImageSource {
  /** As a card names it, after "Imagery:". */
  text: string;
  /** The credit its maker asks for, as the credits page gives it. Absent: `text`. */
  keyText?: string;
  /** The maker's page for it. */
  url?: string;
  /** The licence, when the maker names one: the card prints its name, the page links it. */
  licence?: { name: string; url: string };
}

const CC_BY_4 = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };

export const IMAGE_SOURCES = {
  solarSystemScope: { text: 'Solar System Scope', url: 'https://www.solarsystemscope.com/textures/', licence: CC_BY_4 },
  // NASA asks that Blue Marble Next Generation be credited to the Earth Observatory.
  nasaBlueMarble: { text: 'NASA', keyText: 'NASA Earth Observatory', url: 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/' },
  nasaTopography: {
    text: 'NASA',
    keyText: "Imagery by Jesse Allen, NASA's Earth Observatory, using data from the General Bathymetric Chart of the Oceans (GEBCO) produced by the British Oceanographic Data Centre",
    url: 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/',
  },
  nasaLandMask: { text: 'NASA', keyText: 'NASA/Goddard Space Flight Center Scientific Visualization Studio', url: 'https://svs.gsfc.nasa.gov/3487' },
  nasaClouds: {
    text: 'NASA',
    keyText: "NASA Goddard Space Flight Center, image by Reto Stöckli (Blue Marble, 2002), as Tom Patterson's Natural Earth III",
    url: 'https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/',
  },
  nasaMoon: { text: 'NASA', keyText: "NASA's Scientific Visualization Studio", url: 'https://svs.gsfc.nasa.gov/4720' },
  yaleBsc: {
    text: 'Yale Bright Star Catalogue',
    keyText: 'The Bright Star Catalogue, 5th revised edition, D. Hoffleit and W. H. Warren Jr. (1991), via NASA HEASARC',
    url: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html',
  },
  iauFigures: {
    text: 'IAU/Sky & Telescope',
    keyText: 'Constellation figures adapted by the IAU Office of Astronomy for Education from the original by IAU/Sky & Telescope (Roger Sinnott, Rick Fienberg; patterns by Alan MacRobert), as transcribed by the skymap project',
    url: 'https://github.com/rhannequin/skymap',
    licence: CC_BY_4,
  },
  googleDataArts: {
    text: 'Google Data Arts Team',
    url: 'https://github.com/dataarts/webgl-globe',
    licence: { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  },
} as const satisfies Record<string, ImageSource>;

export interface ImageCredit {
  /** What it is, as the credits page names it. */
  what: string;
  source: ImageSource;
  /** What it was made from. */
  from: string;
  /** What Starcom changed, as CC BY asks a reuser to say. */
  changes: string;
}

/** Every image the globe draws, keyed as GlobeEngine names its textures. */
export const IMAGERY = {
  earthDay: {
    what: 'The Earth by day',
    source: IMAGE_SOURCES.solarSystemScope,
    from: "Solar System Scope's 8K Earth day map",
    changes: 'Resized to 2048×1024 and recompressed as WebP and JPEG; the 8K map recompressed as KTX2 for close-ups.',
  },
  earthNight: {
    what: 'City lights',
    source: IMAGE_SOURCES.solarSystemScope,
    from: "Solar System Scope's 8K Earth night map",
    changes: 'Resized to 4096×2048 and recompressed as WebP and JPEG; the 8K map recompressed as KTX2 for close-ups.',
  },
  blueMarble: {
    what: 'The Blue Marble surface',
    source: IMAGE_SOURCES.nasaBlueMarble,
    from: "NASA's Blue Marble Next Generation, December 2004, with topography and bathymetry: the 4096×2048 copy three-globe's examples ship, and NASA's 21600×10800 original",
    changes: 'Recompressed as WebP; the 8K map cut from the original to 8192×4096 and recompressed as KTX2 for close-ups.',
  },
  earthDark: {
    what: "Cyber-Earth's dark base",
    source: IMAGE_SOURCES.googleDataArts,
    from: "The WebGL Globe's world texture, as three-globe's examples ship it",
    changes: 'Recompressed as WebP.',
  },
  earthTopology: {
    what: 'The relief that shades the mountains',
    source: IMAGE_SOURCES.nasaTopography,
    from: "NASA Earth Observatory's topography map, scaled 0 to 6,400 m",
    changes: 'Resized to 2048×1024 and recompressed as lossless WebP.',
  },
  earthWater: {
    what: 'The land and water mask',
    source: IMAGE_SOURCES.nasaLandMask,
    from: "NASA's land-sea mask made to match the Blue Marble",
    changes: 'Inverted, so water is white, resized to 2048×1024 and recompressed as lossless WebP.',
  },
  clouds: {
    what: 'The clouds',
    source: IMAGE_SOURCES.nasaClouds,
    from: "Natural Earth III's fair-weather clouds, from NASA's 2002 Blue Marble cloud map, made transparent for Bjørn Sandvik's webgl-earth",
    changes: 'Resized to 2048×1024 and recompressed as WebP.',
  },
  planets: {
    what: "The planets and Saturn's rings",
    source: IMAGE_SOURCES.solarSystemScope,
    from: "Solar System Scope's 2K planet maps (Venus's surface) and Saturn's ring",
    changes: 'None: the files as published, checked byte for byte on 2026-10-07.',
  },
  moon: {
    what: 'The Moon',
    source: IMAGE_SOURCES.nasaMoon,
    from: "NASA's CGI Moon Kit: the LRO camera's colour mosaic, with the poles from LOLA, as globe.gl's example ships it",
    changes: 'Resized from 11469×5734 to 2048×1024 and recompressed as JPEG.',
  },
  stars: {
    what: 'The stars',
    source: IMAGE_SOURCES.yaleBsc,
    from: 'The Yale Bright Star Catalogue, 5th revised edition, as HEASARC serves it (bsc5p)',
    changes: 'Cut to magnitude 6 (5,080 stars); each drawn at its J2000 place, its size from its magnitude and its colour from its B−V index.',
  },
  figures: {
    what: "The constellations' figures and names",
    source: IMAGE_SOURCES.iauFigures,
    from: "The skymap project's transcription of the IAU's constellation maps (data/constellations/iau/lines.csv)",
    changes: "Each line's ends placed at its stars' J2000 places from the Yale catalogue; the IAU's 88 names placed at the middle of each constellation's stars brighter than magnitude 5.",
  },
} as const satisfies Record<string, ImageCredit>;

export type ImageryId = keyof typeof IMAGERY;

const isImageryId = (name: string): name is ImageryId => name in IMAGERY;

/**
 * ─── WHAT IS DRAWN NOW ─────────────────────────────────────────────────────
 *
 * Told by what draws it: the globe's surface by its textures that arrived, the cloud
 * layer while its clouds show, the solar system while it is faded in. A card reads it
 * as it is made, as it reads the skin, so a caller cannot author it.
 */
let surface: ImageryId[] = [];
let cloudsDrawn = false;
/** Whether the made-up clouds are meant to be in the picture now: their quality step, their skin, no real clouds. */
let cloudsWanted = false;
let solarSystemDrawn = false;

/** The surface's textures that arrived and are drawn, by GlobeEngine's names. */
export function setSurfaceImagery(names: readonly string[]): void {
  surface = names.filter(isImageryId);
}

export function setCloudsDrawn(drawn: boolean): void {
  cloudsDrawn = drawn;
}

export function setCloudsWanted(wanted: boolean): void {
  cloudsWanted = wanted;
}

/**
 * Whether the clouds have caught up with what is wanted: drawn if wanted, gone if not. A card made at full detail
 * waits for this, so it is not taken while its clouds are still loading (shareActivity.ts, drawnAtFullDetail).
 */
export function cloudsSettled(): boolean {
  return cloudsWanted === cloudsDrawn;
}

export function setSolarSystemDrawn(drawn: boolean): void {
  solarSystemDrawn = drawn;
}

/** Whether Sky from a place draws its stars and figures now (D5). */
let skyDrawn = false;
export function setSkyDrawn(drawn: boolean): void {
  skyDrawn = drawn;
}

/** The images drawn now: the surface's, then the clouds, then the planets and the Moon. */
export function imageryDrawn(): ImageryId[] {
  return [
    ...surface,
    ...(cloudsDrawn ? (['clouds'] as const) : []),
    ...(solarSystemDrawn ? (['planets', 'moon'] as const) : []),
    ...(skyDrawn ? (['stars', 'figures'] as const) : []),
  ];
}

/** Test-only: nothing drawn. */
export function resetImageryForTests(): void {
  surface = [];
  cloudsDrawn = false;
  cloudsWanted = false;
  solarSystemDrawn = false;
  skyDrawn = false;
}
