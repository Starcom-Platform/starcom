/**
 * Which way each layer draws its marks (decision D-F, step 6, part 1).
 *
 * ─── WHAT THIS ADDS, WHICH IS LESS THAN IT LOOKS ───────────────────────────
 *
 * buildScreenPoints has accepted `style: 'disc' | 'glow' | 'ring'` for some
 * time and renders all three distinctly (screenPoints.test.ts). Fourteen call
 * sites draw through it; thirteen never pass a style. So the layers are discs
 * because nobody chose, not because discs were chosen. This module is the
 * choice, not the capability.
 *
 * It draws a fourth, `bloom`, which is not one of these: additive light with no
 * core, whose meaning is the brightening itself. See ScreenPointStyle.
 *
 * ─── THE RULE: A STYLE GOVERNS A LAYER'S PRIMARY MARK ──────────────────────
 *
 * The fourteenth site is useCyberAttacks3D, and it is the reason this rule
 * exists. It draws four sub-layers with three styles:
 *
 *   density      bloom, 3x size     crowded regions brighten
 *   newHalo      bloom, 2.2x size   new since the last snapshot
 *   indicators   disc (rim: light)  the primary mark
 *   enrichment   ring, +10px        OTX-corroborated
 *
 * Its bloom and ring are not alternative renderings of one mark. They are
 * separate layers whose style IS their meaning, and a per-layer override
 * applied to every draw call would redraw the density bloom as discs and
 * delete what it encodes. So: the chosen style applies to the primary mark.
 * A layer whose auxiliary marks encode meaning in their style keeps it.
 *
 * ─── WHY ONLY CHOICES ARE STORED ───────────────────────────────────────────
 *
 * MarkerStyleChoices holds what a person picked and nothing else; the default
 * is derived on every read. Storing a materialised map of all eleven layers
 * would freeze today's catalogue into every returning user's localStorage, and
 * the layer added next month would resolve to undefined for all of them —
 * one level below settingsStorage's top-level merge, where no migration can
 * see it. A default that is derived cannot go stale.
 */
import type { GlobeLayerId } from './Hooks/useGlobeLayerControl';
import type { ScreenPointStyle } from './screenPoints';

/** A way of drawing a mark that a person can choose. */
export type MarkerStyle = 'disc' | 'glow' | 'ring';

/**
 * Every style the shader draws, and whether it is a way of marking a place.
 *
 * A Record over ScreenPointStyle so the compiler enforces the list: add a style
 * to the shader and this stops compiling until someone decides whether a person
 * may pick it. A hand-kept array would silently offer the old set.
 *
 * This was `Record<MarkerStyle, true>` with MarkerStyle aliased to
 * ScreenPointStyle, which gave the same check for free — until `bloom`, which
 * the shader draws and nobody may pick: it is additive light with no core, drawn
 * BEHIND the marks of the one layer whose meaning it is. `bloom: false` is
 * written out rather than omitted so that check survives.
 */
const STYLE_IS_PICKABLE: Record<ScreenPointStyle, boolean> = {
  disc: true,
  glow: true,
  ring: true,
  bloom: false,
  // Diplomacy's ring for a place GDELT put only at a country, under the Ring style (D-DP, DP13).
  dashedRing: false,
};

/** Written out so MarkerStyle cannot drift from the record above. */
const EVERY_MARKER_STYLE: Record<MarkerStyle, true> = { disc: true, glow: true, ring: true };

/**
 * Every style a person can pick, in a stable order.
 *
 * Derived, so flipping an entry above is the whole change — markerStyles.test.ts
 * pins the resulting list, because the cast cannot.
 */
export const MARKER_STYLES = (Object.keys(STYLE_IS_PICKABLE) as ScreenPointStyle[])
  .filter((style) => STYLE_IS_PICKABLE[style]) as readonly MarkerStyle[];

/**
 * Used when a layer id is not one this module knows, which the types forbid
 * and a hand-edited localStorage does not. Never let undefined reach the
 * shader: it falls through every style branch and draws nothing.
 */
const FALLBACK_MARKER_STYLE: MarkerStyle = 'disc';

/**
 * What each layer draws today.
 *
 * Measured from the call sites, not chosen: thirteen of fourteen take
 * buildScreenPoints' 'disc' default and the fourteenth draws its primary mark
 * as one. Defaults that described anything else would restyle eleven layers
 * for every existing user the moment the switcher shipped. The one chosen
 * default is Intel Reports', below.
 *
 * Record<GlobeLayerId, MarkerStyle> is deliberate — a layer added to the
 * catalogue without a default is a build error.
 */
export const DEFAULT_MARKER_STYLES: Record<GlobeLayerId, MarkerStyle> = {
  // Discs with a halo of light: the owner's pick for Intel Reports everywhere, the app, shares, captures and videos
  // (25 Oct, from the video critique Mecha Jono relayed; plan H4). A style a person picked is kept.
  IntelReports: 'glow',
  CyberThreats: 'disc',
  Satellites: 'disc',
  CommHubs: 'disc',
  RLSH: 'disc',
  DiplomaticEvents: 'disc',
  ResourceZones: 'disc',
  ConflictZones: 'disc',
  WarConflict: 'disc',
  CivilUnrest: 'disc',
  ProtestSurges: 'disc',
  SpaceWeather: 'disc',
  EcologicalDisasters: 'disc',
  EarthWeather: 'disc',
  DrugCheckAlerts: 'disc',
  SceneIncidents: 'disc',
  SceneEvents: 'disc',
  HeatRisk: 'disc',
  RaverMissions: 'disc',
  HarmReductionSites: 'disc',
  Lifeboats: 'disc',
  Relief: 'disc',
  FieldMissions: 'disc',
  AiIncidents: 'disc',
  AiFrontier: 'disc',
  AiWar: 'disc',
  AiSafety: 'disc',
  OpenMissions: 'disc',
  CampaignsOperations: 'disc',
  SafetyWindows: 'disc',
  PsiLines: 'disc',
  PsiField: 'disc',
  PsiZones: 'disc',
  PsiRifts: 'disc',
  PsiWindows: 'disc',
  PsiModel: 'disc',
  MagneticShield: 'disc',
};

/** What a person has picked. Absent means "whatever the layer draws by default". */
export type MarkerStyleChoices = Partial<Record<GlobeLayerId, MarkerStyle>>;

/**
 * Is this a style the drawing code can draw?
 *
 * hasOwnProperty rather than `in`: `'constructor' in EVERY_MARKER_STYLE` is
 * true through the prototype chain, and this reads values out of localStorage.
 */
export function isMarkerStyle(value: unknown): value is MarkerStyle {
  /*
   * EVERY_MARKER_STYLE, not STYLE_IS_PICKABLE: `bloom` is a key of the latter,
   * so a hasOwnProperty check against it would accept 'bloom' out of a
   * hand-edited localStorage and draw a layer as light with no marks in it.
   */
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVERY_MARKER_STYLE, value);
}

/**
 * The style a layer should draw with: the person's choice when they made one
 * and it is still a style, otherwise what that layer draws by default.
 */
export function resolveMarkerStyle(
  choices: MarkerStyleChoices | undefined,
  layerId: GlobeLayerId,
): MarkerStyle {
  const chosen = choices?.[layerId];
  if (isMarkerStyle(chosen)) return chosen;
  return DEFAULT_MARKER_STYLES[layerId] ?? FALLBACK_MARKER_STYLE;
}

/**
 * Whether a chosen style reaches a layer's marks.
 *
 * Three states, not a boolean, because "cannot ever" and "not wired yet" are
 * different facts and collapsing them would hide remaining work:
 *
 *   honoured   the layer reads its style; the switcher appears
 *   not-yet    it draws screen-point marks, but nothing passes the style down
 *   no-marks   it draws no screen-point marks at all, and never will here
 *
 * The switcher is absent unless a layer is `honoured`, so it can never offer a
 * click that changes nothing on screen — the "setting, not a feature" this step
 * warns about. As each layer is wired its entry flips, and the count of what is
 * left is derived from this record rather than written down somewhere:
 *
 *   grep -cE "^  [A-Za-z]+: .not-yet.," src/components/Globe/markerStyles.ts
 *
 * Anchored to the start of an entry so it cannot match prose. Two looser
 * patterns were wrong first: one counted the type declaration below as a layer,
 * and its replacement counted the line documenting itself. A derived number
 * still lies if the derivation is sloppy — the point of deriving it is that the
 * command is checkable, so it has to be checked.
 */
export type MarkerStyleSupport = 'honoured' | 'not-yet' | 'no-marks' | 'shape-is-the-legend';

export const MARKER_STYLE_SUPPORT: Record<GlobeLayerId, MarkerStyleSupport> = {
  // Wired: every screen-point path these two draw through passes its style.
  //   IntelReports — useGlobeIntelSprites (the glyphs' backing) + useGlobeIntelMarkPoints
  //   RLSH         — useGlobeIntelSprites
  IntelReports: 'honoured',
  RLSH: 'honoured',

  /*
   * SpaceWeather: its geoelectric field is a colour field with streaks, not marks
   * (space-weather-visualization.md, SW1), and its shells are surfaces.
   */
  SpaceWeather: 'no-marks',

  /*
   * CommHubs: its LANDING POINTS, which are its only marks — the cables are
   * lines, where dashed already means provisional. Tested through the hook and
   * not the builder, which is the lesson Satellites paid for below.
   */
  CommHubs: 'honoured',

  /*
   * CyberThreats: its INDICATORS, and only those. The density and newHalo blooms
   * stay additive light and the enrichment ring stays a ring — this is the layer
   * the rule in this file's header was written for.
   */
  CyberThreats: 'honoured',

  /*
   * Satellites, closed on 2026-09-19. It sat at 'not-yet' for longer than any
   * layer for a reason that turned out to be a defect rather than a harness
   * problem: the style was a dependency of the effect that LOADS the catalogue,
   * by identity. A test passing the choices inline re-ran that effect every
   * render until the worker ran out of heap — which is what "a hook test
   * crashed the vitest worker" was — and in the app, choosing a style cleared
   * and reloaded the catalogue. Restyling now rebuilds from what is loaded, and
   * useGlobeSatellites.test.ts tests the hook itself: the mutation deleting the
   * style from its call, which survived every test before, fails four.
   */
  Satellites: 'honoured',

  /*
   * EarthWeather, which closes step 6.3. Both of its hooks, all four kinds of
   * mark — stations and icebergs in useGlobeEarthWeather, tide and river gauges
   * in useGlobeWaterGauges, which gates on EarthWeather and so takes its choice.
   * Wired so a restyle never goes near a fetch: the style is read by the builders
   * through a ref and applied afterwards by setScreenPointsStyle, which changes
   * the material alone. earthWeatherMarkerStyle.test.ts tests both hooks and
   * checks each service was asked once and each mark restyled in place.
   */
  EarthWeather: 'honoured',

  /*
   * Also wired: Diplomacy's country marks, and Eco Disasters through BOTH of its
   * paths — useGlobeEcoDisasterMarks and useGlobeVolcanoCatalog — because wiring
   * one would have left the layer half styled.
   */
  DiplomaticEvents: 'honoured',
  EcologicalDisasters: 'honoured',


  /*
   * Conflict Zones is not 'not-yet'. Its SHAPE is its legend: the war-event
   * discs and the displacement rings are told apart by being a disc and a ring
   * (see useConflictZones3D), so a per-layer style that made both the same shape
   * would destroy the distinction and leave the legend saying something untrue.
   * Honouring a choice there means the legend following the choice, which is a
   * decision rather than a wiring job.
   */
  ConflictZones: 'shape-is-the-legend',

  /*
   * War & Conflict: the backing is the most serious thing about an item (a
   * critical warning glows, deaths are ringed), and the glyph is what
   * happened. A per-layer style would draw a deadly strike like a talk.
   */
  WarConflict: 'shape-is-the-legend',

  /*
   * Not unfinished. useResourceZones3D builds a THREE.Mesh, border line batches
   * (buildBorderLineBatches) and trade-route connection lines, and calls
   * buildScreenPoints nowhere. Disc, glow and ring describe marks it does not
   * have, so the switcher is absent here permanently.
   */
  ResourceZones: 'no-marks',

  /*
   * Raver Watch's four drawn layers: the level is the backing, red a glow, amber
   * a ring and info a disc, and the category is the glyph (globe record,
   * section 19). A per-layer style would draw every level alike.
   */
  DrugCheckAlerts: 'shape-is-the-legend',
  SceneIncidents: 'shape-is-the-legend',
  SceneEvents: 'shape-is-the-legend',
  HeatRisk: 'shape-is-the-legend',
  // Not built: their sources are not online yet, so they draw nothing.

  // Hero Watch's harm-reduction field missions, drawn as Hero Watch draws them (D-HW, HW8).
  RaverMissions: 'shape-is-the-legend',
  HarmReductionSites: 'no-marks',
  /*
   * Hero Watch (D-HW): its lifeboats are lifebuoys whose size says their launches, relief a package with
   * its counts at a tinted country's middle, and field missions a clipboard with its count at an
   * outlined place's middle, so their shape is the legend.
   */
  Lifeboats: 'shape-is-the-legend',
  Relief: 'shape-is-the-legend',
  FieldMissions: 'shape-is-the-legend',
  /*
   * AI Watch (D-AW): a note's mark carries its stance as a shape (AW4), and a country's its count, so
   * the shape is the legend there too.
   */
  AiIncidents: 'shape-is-the-legend',
  AiFrontier: 'shape-is-the-legend',
  AiWar: 'shape-is-the-legend',
  AiSafety: 'shape-is-the-legend',
  /* Missions (D-MF, step 5): a clipboard with its count at an outlined place's middle, as Field missions'. */
  OpenMissions: 'shape-is-the-legend',
  /* Campaigns and Operations (D-RS, RS25): a disc at an outlined place's middle, with its pill. */
  CampaignsOperations: 'shape-is-the-legend',
  /* Safety windows (D-RR, kit 5.2): a city's place filled by its window's weight; it draws no mark, by the kit's rule. */
  SafetyWindows: 'shape-is-the-legend',
  /* Civil Unrest (D-CU): a crowd for a day of unrest, a broken ring for a surge in reporting (CU2, CU4). */
  CivilUnrest: 'shape-is-the-legend',
  ProtestSurges: 'shape-is-the-legend',
  /*
   * Psi Watch (D-PW): lines, a field, shaded Zones and faded places, a panel's readings, and a shield's
   * field: none of them point marks. Psi Alerts are drawn, when they are, as Zones with their windows.
   */
  PsiLines: 'no-marks',
  PsiField: 'no-marks',
  PsiZones: 'no-marks',
  PsiRifts: 'no-marks',
  PsiWindows: 'no-marks',
  PsiModel: 'no-marks',
  MagneticShield: 'no-marks',
};

/*
 * ─── THERE IS NO PER-LAYER STYLE LIST ANY MORE ─────────────────────────────
 *
 * Until 2026-09-18 a `markerStyleOptionsFor(layerId)` withheld `glow` from
 * Satellites, Diplomacy and Eco Disasters, because a glow was TWO objects — an
 * additive bloom with a disc drawn over it — and that pairing lived in
 * useScreenMarkLayer. A layer calling buildScreenPoints directly got the bloom
 * alone, which measured as very nearly invisible, so offering the choice there
 * would have been a click that hides a layer.
 *
 * GLOW_QUAD_SCALE moved the pairing into the shader: a glowing mark is one
 * object now, so every caller gets it and every layer offers every style. What
 * remains per-layer is MARKER_STYLE_SUPPORT — whether a choice reaches the
 * marks at all — which is a different question and the one still being worked
 * through.
 */

/** Does a style chosen for this layer actually reach what it draws? */
export function layerHonoursMarkerStyle(layerId: GlobeLayerId): boolean {
  return MARKER_STYLE_SUPPORT[layerId] === 'honoured';
}
