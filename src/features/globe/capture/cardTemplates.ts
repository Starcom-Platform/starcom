/**
 * Mecha Jono's card templates (their card-templates@1, kept beside the record in
 * imaging/), in Starcom's tokens, and who decides which one a card is.
 *
 * ─── THE BADGE IS IN COLOURS THAT ALREADY MEAN IT (IM5) ────────────────────
 *
 * They asked for seven hues. A hue here means one kind of thing everywhere, so
 * critical intel is danger red and actionable intel caution amber, the meanings
 * those colours carry already; Raver Watch keeps its mode's violet; and the
 * rest sit on gunmetal with a glyph and a word, so no new hue arrives to mean
 * something new.
 *
 * ─── THE ITEM DECIDES, WHERE IT SAYS (IM14) ────────────────────────────────
 *
 * A badge is a claim about the item. A War & Conflict item carries its role,
 * and a Raver Watch item is Raver Watch, so those decide their own badge, and a
 * shot asking for another is refused with the reason. Where the item says
 * nothing, as an Intel Report does not yet, the shot's template sets the badge
 * and the card's provenance says the shot chose it, with a caveat saying so,
 * until the Interchange ingest (block H) brings each family's role.
 */
import { DATA_SCALES, GUNMETAL, SEMANTIC } from '../../../styles/tokens';
import { RAVER_WATCH_VIOLET } from '../../../components/Globe/raverWatchColor';
import type { ConflictRole } from '../../../services/warConflict/warConflict';
import type { ShareReportInfo } from './shareReports';

export const CARD_TEMPLATES = [
  'critical_intel', 'actionable_intel', 'context_report', 'mission_package', 'field_mission',
  'conflict_brief', 'hazard', 'raver_alert', 'declassified', 'psi',
] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

/** The glyphs a badge can carry: War & Conflict's, by name (warConflictSprites). */
export type BadgeGlyph = 'report';

export interface CardBadge {
  /** Mecha Jono's word for it, as they wrote it. */
  text: string;
  /** The badge's fill. */
  tone: string;
  /** Its text and glyph. */
  ink: string;
  /** Before the word, on a gunmetal badge, whose colour cannot tell it apart. */
  glyph: BadgeGlyph | null;
}

export interface TemplateSpec {
  badge: CardBadge | null;
  /** Whether the card is about one item. */
  about: 'item' | 'front-page' | 'either';
  /** Why it cannot be made yet, when it cannot. */
  notBuilt?: string;
}

const DARK_INK = GUNMETAL[950];

export const TEMPLATE_SPECS: Record<CardTemplate, TemplateSpec> = {
  critical_intel: { badge: { text: 'CRITICAL INTEL', tone: SEMANTIC.danger, ink: DARK_INK, glyph: null }, about: 'item' },
  actionable_intel: { badge: { text: 'ACTIONABLE INTEL', tone: SEMANTIC.caution, ink: DARK_INK, glyph: null }, about: 'item' },
  context_report: { badge: null, about: 'item' },
  mission_package: {
    badge: null,
    about: 'item',
    notBuilt: 'mission_package is not built yet: renderMission waits on how a package encodes its area and objectives, asked of its publisher',
  },
  // Hero Watch's field missions (D-HW, HW10-HW11): rescue orange, as Raver Watch keeps its violet.
  field_mission: { badge: { text: 'FIELD MISSION', tone: DATA_SCALES.heroWatch, ink: DARK_INK, glyph: null }, about: 'item' },
  conflict_brief: {
    badge: { text: 'WAR & CONFLICT BRIEF', tone: GUNMETAL[700], ink: GUNMETAL[100], glyph: 'report' },
    about: 'front-page',
  },
  hazard: { badge: null, about: 'either' },
  raver_alert: { badge: { text: 'RAVER WATCH', tone: RAVER_WATCH_VIOLET, ink: DARK_INK, glyph: null }, about: 'item' },
  // The declassified desk's day (plan H9): a front page, its badge on gunmetal as the brief's is, its word its own.
  declassified: {
    badge: { text: 'DECLASSIFIED', tone: GUNMETAL[700], ink: GUNMETAL[100], glyph: 'report' },
    about: 'front-page',
  },
  // A Psi Watch sky event or window (D-PW, PW62): the one Experimental badge (PW34), in Psi Watch's aqua (PW17).
  psi: { badge: { text: 'EXPERIMENTAL', tone: DATA_SCALES.psiWatch, ink: DARK_INK, glyph: null }, about: 'front-page' },
};

export const BUILT_TEMPLATES: readonly CardTemplate[] = CARD_TEMPLATES.filter((name) => !TEMPLATE_SPECS[name].notBuilt);

const ROLE_TEMPLATE: Record<ConflictRole, CardTemplate> = {
  critical: 'critical_intel',
  actionable: 'actionable_intel',
  context: 'context_report',
};

const RAVER_WATCH_LAYERS: ReadonlySet<string> = new Set(['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk']);
const FIELD_MISSION_LAYERS: ReadonlySet<string> = new Set(['FieldMissions', 'RaverMissions']);

/** What an item says of itself: its layer, and its role where it states one (listReports). */
export type ItemSays = { layer: ShareReportInfo['layer'] | (string & {}); role?: ConflictRole };

/** The template an item says it is, or null when it does not say. */
export function templateOfItem(item: ItemSays | null): CardTemplate | null {
  if (!item) return null;
  if (item.layer === 'WarConflict') return item.role ? ROLE_TEMPLATE[item.role] : null;
  if (RAVER_WATCH_LAYERS.has(item.layer)) return 'raver_alert';
  // A Hero Watch field mission, whichever mode draws it (HW8).
  if (FIELD_MISSION_LAYERS.has(item.layer)) return 'field_mission';
  return null;
}

/** What the item says it is, in words, for a refusal. */
const itemSays = (item: ItemSays) => (item.layer === 'WarConflict'
  ? `This War & Conflict item's role is ${item.role}`
  : FIELD_MISSION_LAYERS.has(item.layer) ? 'This item is a Hero Watch field mission' : 'This item is Raver Watch');

/**
 * Who chose a card's template: the item, saying what it is; the shot, where the
 * item does not say; or the subject, a front page being what it is.
 */
export type TemplateChooser = 'item' | 'shot' | 'subject';

export type TemplateDecision =
  | { ok: true; template: CardTemplate | null; badge: CardBadge | null; chosenBy: TemplateChooser | null }
  | { ok: false; reason: string };

/**
 * The template a card is made with, and who chose it.
 *
 * `featured` is the item the card features, or null when it features none.
 */
export function decideTemplate(asked: CardTemplate | undefined, featured: ItemSays | null): TemplateDecision {
  const own = templateOfItem(featured);
  if (asked === undefined) {
    return own
      ? { ok: true, template: own, badge: TEMPLATE_SPECS[own].badge, chosenBy: 'item' }
      : { ok: true, template: null, badge: null, chosenBy: null };
  }
  const spec = TEMPLATE_SPECS[asked];
  if (spec.notBuilt) return { ok: false, reason: spec.notBuilt };
  if (spec.about === 'item' && !featured) {
    return { ok: false, reason: `${asked} is a card about one item, and this shot features none.` };
  }
  if (spec.about === 'front-page' && featured) {
    return { ok: false, reason: `${asked} is a front page: it features no one item.` };
  }
  if (featured && own && own !== asked) {
    return { ok: false, reason: `${itemSays(featured)}: its card is ${own}, not ${asked}.` };
  }
  if (asked === 'raver_alert' && !own) {
    return { ok: false, reason: `raver_alert is for a Raver Watch item, and this one is on ${featured?.layer}.` };
  }
  if (asked === 'field_mission' && !own) {
    return { ok: false, reason: `field_mission is for a Hero Watch field mission, and this one is on ${featured?.layer}.` };
  }
  return { ok: true, template: asked, badge: spec.badge, chosenBy: own ? 'item' : spec.about === 'front-page' ? 'subject' : 'shot' };
}
