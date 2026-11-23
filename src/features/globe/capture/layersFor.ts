/**
 * Starcom's layers for Mecha Jono's categories (`layersFor`, contract v12).
 *
 * Their vocabulary suggests layers for each `group.kind`, and their v9
 * proposal asks Starcom to decide. This is the decision. It follows their
 * suggestions except where Starcom draws the item somewhere else: their
 * conflict items draw on War & Conflict since 2 October (globe record, section
 * 20), not on Conflict Zones, which is GDELT's. A category with no place
 * (declassified records, patents, partner vetting) has no layer.
 *
 * A kind it does not know falls back to its group, as their vocabulary says a
 * reader should; a group it does not know, to Intel Reports. Only the layers
 * this build draws are named, so a caller can pin what comes back.
 *
 * Interchange 3.7 (11 October): Hero Watch's organisations (stations, relief)
 * on Lifeboats and Relief, and every field mission's category on Field
 * missions, where Hero Watch draws them or, with no place, lists them; harm
 * reduction and naloxone on Raver missions too (HW8). Naloxone's missions are
 * packages, never intel reports, so not on Intel Reports, as they suggest.
 *
 * Psi Watch (decision D-PW, PW62; the kit's `schemas_psi.md` §3.6, `layersFor("psi.*")`): each psi family on the
 * layer that draws it, named only while this build draws Psi Watch (its switch on): a sky event on Planet lines, a
 * window on Windows with its sky event's lines, an alert on Psi Alerts, the field on Field readings, a test and its
 * results on Tested places. A call is a team's own, never on a card.
 */

const BY_GROUP: Record<string, readonly string[]> = {
  conflict: ['WarConflict'],
  // The protest desk's days of unrest, and its surges beside them (D-CU).
  unrest: ['CivilUnrest', 'ProtestSurges'],
  hazard: ['EcologicalDisasters', 'EarthWeather'],
  drugs: ['DrugCheckAlerts'],
  scene: ['SceneIncidents', 'SceneEvents', 'HeatRisk'],
  events: ['SceneEvents', 'DrugCheckAlerts', 'HeatRisk'],
  outreach: ['EarthWeather', 'FieldMissions'],
  relief: ['EcologicalDisasters', 'EarthWeather', 'FieldMissions'],
  heroes: ['Lifeboats', 'Relief'],
  awareness: ['IntelReports', 'FieldMissions'],
  aid: ['EcologicalDisasters', 'IntelReports'],
  digital: ['CommHubs', 'IntelReports'],
  cyber: ['CyberThreats', 'IntelReports'],
  declassified: [],
  patents: [],
  support: ['FieldMissions'],
  psi: ['PsiWindows', 'PsiLines'],
};

const BY_KIND: Record<string, readonly string[]> = {
  'scene.event': ['SceneEvents'],
  'scene.safety': ['SceneIncidents', 'SceneEvents', 'HeatRisk'],
  'outreach.heat': ['HeatRisk', 'EarthWeather', 'FieldMissions'],
  'outreach.naloxone': ['FieldMissions', 'RaverMissions'],
  'events.harm_reduction': ['SceneEvents', 'DrugCheckAlerts', 'HarmReductionSites', 'HeatRisk', 'FieldMissions', 'RaverMissions'],
  'intel.situation_picture': ['IntelReports', 'FieldMissions'],
  'cyber.malware_takedown': ['FieldMissions'],
  'civic.public_comment': ['FieldMissions'],
  'awareness.refunds': ['FieldMissions'],
  'sanctions.export_controls': [],
  'psi.sky_event': ['PsiLines'],
  'psi.window': ['PsiWindows', 'PsiLines'],
  'psi.alert': ['PsiRifts'],
  'psi.field': ['PsiField'],
  'psi.registration': ['PsiZones'],
  'psi.scry_result': ['PsiZones'],
  'psi.ledger': ['PsiZones'],
  'psi.brief': ['PsiLines', 'PsiField'],
  'psi.mission_package': ['PsiWindows'],
  'psi.call': [],
};

const DEFAULT_LAYERS: readonly string[] = ['IntelReports'];
const CATEGORY = /^[a-z_]+(\.[a-z_]+)?$/;

export interface LayersForCategory {
  category: string;
  layers: string[];
  /** What decided: the kind itself, its group, or the default for a group it does not know. */
  from: 'kind' | 'group' | 'default';
}

export function layersFor(category: string, drawn: readonly string[]): LayersForCategory {
  if (typeof category !== 'string' || !CATEGORY.test(category)) {
    throw new Error('A category is group.kind, lower case, as their vocabulary writes it: conflict.events, scene.safety.');
  }
  const group = category.split('.')[0];
  const [layers, from] = category in BY_KIND ? [BY_KIND[category], 'kind' as const]
    : group in BY_GROUP ? [BY_GROUP[group], 'group' as const]
      : [DEFAULT_LAYERS, 'default' as const];
  return { category, layers: layers.filter((layer) => drawn.includes(layer) && layer !== 'RLSH' && layer !== 'SafetyWindows'), from };
}
