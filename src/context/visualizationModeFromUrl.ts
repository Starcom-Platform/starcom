/**
 * Which visualization a link asks for.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The layer the globe draws lived in `localStorage` and nowhere else, so there
 * was no address for "the globe, showing space weather". Two consequences:
 *
 * An autonomous agent in a fresh browser got the default and could reach none
 * of the other ten layers. The share handle's `setLayer` answers that for a
 * caller that can run script in the page.
 *
 * A PERSON could not share what they were looking at. Every link landed on
 * whatever the recipient happened to have chosen last, which is the opposite
 * of what a link is for — and it is the reason this is worth having even now
 * that the agent has a method.
 *
 * ─── THE PAIR IS NOT FREE-FORM ─────────────────────────────────────────────
 *
 * A sub-mode belongs to exactly one mode. `?mode=GeoPolitical&sub=SpaceWeather`
 * is not a combination the app ever generates and no renderer expects it, so it
 * is refused rather than honoured. Giving `sub` alone is the ordinary case: the
 * mode is derived, because a caller should not have to know that Satellites
 * lives under CyberCommand.
 *
 * ─── READ ONCE, NEVER WRITTEN ──────────────────────────────────────────────
 *
 * Writing the mode back on every change would fight the application router for
 * the address bar and fill a person's history with entries they never asked
 * for. This is an entry point, not two-way binding.
 *
 * An unrecognised value returns null and the app keeps its stored mode: a link
 * with a typo should show the globe, not an error.
 */

/** The primary modes, and the sub-modes each one owns. */
const OWNERSHIP = {
  CyberCommand: ['IntelReports', 'CyberThreats', 'Satellites', 'CommHubs'],
  GeoPolitical: ['DiplomaticEvents', 'ResourceZones', 'ConflictZones', 'WarConflict', 'CivilUnrest', 'ProtestSurges'],
  EcoNatural: ['SpaceWeather', 'EcologicalDisasters', 'EarthWeather'],
  RaverWatch: ['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites'],
  HeroWatch: ['Lifeboats', 'Relief', 'FieldMissions', 'RLSH'],
  AIWatch: ['AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety'],
  Missions: ['OpenMissions', 'CampaignsOperations', 'SafetyWindows'],
  // Behind its switch (D-PW, PW19): the provider opens its default instead while the switch is off.
  PsiWatch: ['PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows', 'PsiModel', 'MagneticShield'],
} as const;

/** Sub-modes that moved, and the mode a link made before the move still names (D-HW: RLSH, HW1). */
const MOVED_FROM: Readonly<Record<string, PrimaryMode>> = { rlsh: 'CyberCommand' };

type PrimaryMode = keyof typeof OWNERSHIP;
type SubMode = (typeof OWNERSHIP)[PrimaryMode][number];

/** The sub-mode a bare `?mode=` lands on. Matches the provider's own defaults. */
const DEFAULT_SUB: Record<PrimaryMode, SubMode> = {
  CyberCommand: 'IntelReports',
  GeoPolitical: 'DiplomaticEvents',
  EcoNatural: 'EcologicalDisasters',
  RaverWatch: 'DrugCheckAlerts',
  HeroWatch: 'Lifeboats',
  AIWatch: 'AiIncidents',
  Missions: 'OpenMissions',
  PsiWatch: 'PsiLines',
};

export interface UrlVisualizationMode {
  mode: PrimaryMode;
  subMode: SubMode;
}

const MODES = Object.keys(OWNERSHIP) as PrimaryMode[];

/** Case-insensitive, because a link gets retyped and shared in chat. */
const matchMode = (value: string | null): PrimaryMode | null =>
  MODES.find((m) => m.toLowerCase() === (value ?? '').toLowerCase()) ?? null;

const ownerOf = (sub: string): PrimaryMode | null => {
  for (const mode of MODES) {
    if ((OWNERSHIP[mode] as readonly string[]).some((s) => s.toLowerCase() === sub.toLowerCase())) {
      return mode;
    }
  }
  return null;
};

const canonicalSub = (sub: string): SubMode | null => {
  for (const mode of MODES) {
    const hit = (OWNERSHIP[mode] as readonly string[])
      .find((s) => s.toLowerCase() === sub.toLowerCase());
    if (hit) return hit as SubMode;
  }
  return null;
};

/**
 * The mode a query string asks for, or null if it asks for nothing valid.
 *
 * Takes the search string rather than reading `location` so it is testable
 * without a DOM and callable from anywhere.
 */
export function modeFromSearch(search: string): UrlVisualizationMode | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }

  const rawSub = params.get('sub');
  const rawMode = params.get('mode');
  if (!rawSub && !rawMode) return null;

  if (rawSub) {
    const subMode = canonicalSub(rawSub);
    if (!subMode) return null;
    const owner = ownerOf(rawSub);
    if (!owner) return null;
    // A stated mode must be the one that owns the sub-mode, or the one that did before it moved.
    if (rawMode) {
      const stated = matchMode(rawMode);
      if (!stated || (stated !== owner && MOVED_FROM[rawSub.toLowerCase()] !== stated)) return null;
    }
    return { mode: owner, subMode };
  }

  const mode = matchMode(rawMode);
  return mode ? { mode, subMode: DEFAULT_SUB[mode] } : null;
}

export default modeFromSearch;
