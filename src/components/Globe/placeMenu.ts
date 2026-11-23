/**
 * What a click on the globe opens (K8; decisions BA8, BA9; plan block J, item 4).
 *
 * A report alone opens, as it always did. Where there is anything to choose
 * between — a place drawn as one glyph with a count, or a click inside more
 * than one outlined territory — a menu opens at the click listing the groups
 * there, a section each, and the report picked opens paging through its own
 * group alone (BA8).
 */
import { markerTimeMs, type IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
import type { GroupMenuSection } from '../ui/GlobeGroupMenu/GlobeGroupMenu';
import { intelVariantOf } from './intelVariant';
import { categorySymbolOf, reportCategoryOf } from '../../services/intel/reportCategory';
import { placeKeyOf } from './reportPlaces';

/** Reports the menu lists under one heading: a place's, or a territory's. */
export interface ReportGroup {
  /** `place:<kind|lat,lng>` or `territory:<code>`, unique among the groups at a click. */
  key: string;
  title: string;
  /** Most severe first. */
  members: IntelReportOverlayMarker[];
}

export type ClickOpens =
  | { kind: 'report'; reports: IntelReportOverlayMarker[]; initial: string }
  | { kind: 'menu'; groups: ReportGroup[] }
  | { kind: 'nothing' };

/** The reports at one place (reportsAtPlace), as a group. */
export function placeGroupOf(here: IntelReportOverlayMarker[]): ReportGroup {
  return { key: `place:${placeKeyOf(here[0])}`, title: `${here.length} reports here`, members: here };
}

/**
 * A group as the menu lists it: each report's category in words, and its icon
 * while the globe's glyphs wear their emblems (BA14, BA15).
 */
export function sectionOf(group: ReportGroup, look: { emblems: boolean } = { emblems: false }): GroupMenuSection {
  return {
    key: group.key,
    title: group.title,
    items: group.members.map((report) => {
      const category = reportCategoryOf(report.tags);
      return {
        id: report.pubkey,
        title: report.title,
        variant: intelVariantOf(report),
        timeMs: markerTimeMs(report),
        category,
        symbol: look.emblems ? categorySymbolOf(category) : null,
      };
    }),
  };
}

/**
 * The report itself when there is one in all, a menu when there is a choice,
 * nothing where nothing is. The country under the click is a choice too, where
 * the menu can offer it (BA20).
 */
export function whatAClickOpens(groups: readonly ReportGroup[], also: { country?: boolean } = {}): ClickOpens {
  const held = groups.filter((group) => group.members.length > 0);
  const count = held.reduce((n, group) => n + group.members.length, 0);
  if (count === 0) return { kind: 'nothing' };
  if (count === 1 && !also.country) return { kind: 'report', reports: held[0].members, initial: held[0].members[0].pubkey };
  return { kind: 'menu', groups: held };
}
