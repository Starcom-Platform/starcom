/**
 * What each layer counts as notable, for the time bar's markers (critique-2026-11-01, OR17, OR26): one rule a layer,
 * drafted by Starcom from the fields its items carry, for the owner to review once on a sheet
 * (scripts/timebar/notable-sheet.ts). A rule names its fields; where the only "severity" a layer has is one Starcom
 * computes, or its items keep no event time, the draft says so and proposes no marker rather than inventing one.
 *
 * `status` is the review's: `draft` until the owner's pick, then `approved`, `changed` (the note says how) or `none`.
 */

export type NotableStatus = 'draft' | 'approved' | 'changed' | 'none';

export interface NotableRule {
  /** The layer, as useGlobeLayerControl names it. */
  layer: string;
  /** The layer's name on screen. */
  label: string;
  /** The rule in words, or null where the draft proposes no marker. */
  rule: string | null;
  /** The fields it reads, and whose they are (the source's, or Starcom's). */
  basis: string;
  /** What placed the marker in time. */
  when: string;
  status: NotableStatus;
}

export const NOTABLE_RULES: readonly NotableRule[] = [
  { layer: 'IntelReports', label: 'Intel Reports', rule: 'A report its author marked High or Critical priority.', basis: 'priority, set by the report\'s author.', when: 'The report\'s time: the event\'s where it says so, else when it was written.', status: 'draft' },
  { layer: 'CyberThreats', label: 'Cyber Threats', rule: null, basis: 'Its severity is Starcom\'s own (a fixed weight per blocklist), and its dates are when a list saw an address, not when an attack happened.', when: '-', status: 'draft' },
  { layer: 'Satellites', label: 'Satellites', rule: null, basis: 'No event time: a satellite has an orbit epoch, and its priority is Starcom\'s own.', when: '-', status: 'draft' },
  { layer: 'CommHubs', label: 'Comm Hubs', rule: null, basis: 'Only a cable\'s ready-for-service year, and no fault or outage field.', when: '-', status: 'draft' },
  { layer: 'DiplomaticEvents', label: 'Diplomacy', rule: 'A cooperative event scoring +7 or more on Goldstein\'s scale, told by 5 or more outlets.', basis: 'goldsteinScale (fixed by the CAMEO code) and sources, both GDELT\'s.', when: 'When GDELT added it.', status: 'draft' },
  { layer: 'ConflictZones', label: 'Conflict Zones', rule: 'A conflict event scoring −9 or below on Goldstein\'s scale, told by 5 or more outlets.', basis: 'goldsteinScale and sources, GDELT\'s. Displacement is yearly, so it marks no moment.', when: 'When GDELT added it.', status: 'draft' },
  { layer: 'WarConflict', label: 'War & Conflict', rule: 'An item its publisher tagged critical, or one claiming 10 or more killed.', basis: 'role (the note\'s own tag) and casualties[].count with kind killed, as the note states them.', when: 'When it was reported (items keep no separate event time).', status: 'draft' },
  { layer: 'CivilUnrest', label: 'Civil Unrest', rule: 'A day with a claimed crowd of 100,000 or more (its claimant named beside it), or a shutdown.', basis: 'claims[].count with its claimant, and kinds, as the note states them.', when: 'The day it is about.', status: 'draft' },
  { layer: 'ProtestSurges', label: 'Protest surges', rule: 'Every surge: being one is the source\'s own flag.', basis: 'The reporting_surge tag.', when: 'When the window was written.', status: 'draft' },
  { layer: 'SpaceWeather', label: 'Space Weather', rule: 'A CME modelled to arrive at Earth (not glancing), of DONKI\'s fastest classes, R or ER.', basis: 'earth.kind and type, DONKI\'s.', when: 'Its modelled arrival.', status: 'draft' },
  { layer: 'EcologicalDisasters', label: 'Eco Disasters', rule: 'An earthquake of magnitude 6 or more, any with a tsunami flag, or a GDACS Orange or Red alert.', basis: 'magnitude and tsunami (USGS), alertlevel (GDACS): the sources\' own.', when: 'A quake\'s origin time; GDACS\'s latest date.', status: 'draft' },
  { layer: 'EarthWeather', label: 'Earth Weather', rule: null, basis: 'Grids and gauge readings with no alert level or flood stage.', when: '-', status: 'draft' },
  { layer: 'DrugCheckAlerts', label: 'Drug-check alerts', rule: 'A red alert.', basis: 'level, the publisher\'s.', when: 'When it starts to apply.', status: 'draft' },
  { layer: 'SceneIncidents', label: 'Scene incidents', rule: 'A red incident, or any about violence.', basis: 'level and category, the publisher\'s.', when: 'When it starts to apply.', status: 'draft' },
  { layer: 'SceneEvents', label: 'Scene events', rule: null, basis: 'No severity: an event is on, or cancelled.', when: '-', status: 'draft' },
  { layer: 'HeatRisk', label: 'Heat risk', rule: 'NWS HeatRisk 3 (major) or 4 (extreme).', basis: 'heatRisk, the National Weather Service\'s.', when: 'When it starts to apply.', status: 'draft' },
  { layer: 'RaverMissions', label: 'Raver missions', rule: null, basis: 'No severity: a mission is open or closed.', when: '-', status: 'draft' },
  { layer: 'FieldMissions', label: 'Field missions', rule: null, basis: 'No severity: a mission is open or closed.', when: '-', status: 'draft' },
  { layer: 'Lifeboats', label: 'Lifeboats', rule: null, basis: 'A station\'s launches are a yearly count, not an event.', when: '-', status: 'draft' },
  { layer: 'Relief', label: 'Relief', rule: 'An operation starting that aims to reach 100,000 people or more, or an emergency appeal (not a DREF).', basis: 'peopleToReach and appealType, the IFRC\'s.', when: 'The operation\'s start.', status: 'draft' },
  { layer: 'AiIncidents', label: 'AI incidents', rule: 'An item its publisher marked ugly, or one about loss of control.', basis: 'stance and facets, the note\'s own.', when: 'When it was published (no event time).', status: 'draft' },
  { layer: 'AiFrontier', label: 'Frontier AI', rule: 'The same as AI incidents: ugly, or loss of control.', basis: 'stance and facets.', when: 'When it was published.', status: 'draft' },
  { layer: 'AiWar', label: 'AI in war', rule: 'The same: ugly, or loss of control, or autonomous weapons.', basis: 'stance and facets.', when: 'When it was published.', status: 'draft' },
  { layer: 'AiSafety', label: 'Safety & security', rule: 'The same as AI incidents: ugly, or loss of control.', basis: 'stance and facets.', when: 'When it was published.', status: 'draft' },
  { layer: 'OpenMissions', label: 'Open missions', rule: null, basis: 'No severity; a mission\'s closing time is a deadline, not an event.', when: '-', status: 'draft' },
  { layer: 'CampaignsOperations', label: 'Campaigns and operations', rule: null, basis: 'Schedule points (start, end, ended early), not severities.', when: '-', status: 'draft' },
  { layer: 'PsiRifts', label: 'Psi Alerts', rule: 'Every alert: each is three field channels high together. Drawn today from the kit\'s fixtures, not a live feed.', basis: 'The alert itself, and channels[].percentile.', when: 'When it starts to apply.', status: 'draft' },
  { layer: 'PsiWindows', label: 'Windows', rule: 'Each window\'s peak. Drawn today from the kit\'s fixtures.', basis: 'window.peak.', when: 'Its peak.', status: 'draft' },
];
