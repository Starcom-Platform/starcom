/**
 * What tonight's card says (raver-nights.md, RN3): the twelve hours from the
 * shot's moment, as Raver Watch read them, a front page of its own. Its title
 * says from when, in UTC; its lines how many scene events start and how many
 * stand in heat, then a row a region, the first to start first, as night moves
 * west. The camera turns to the middle of the events; the record keeps the page.
 */
import { tonightLines, type Tonight } from '../../../services/raverWatch/raverWatchView';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { formatUtcDateTime } from '../../../utils/utcTime';
import type { TonightFrontPage } from './shareCardProvenance';

/** Tonight's page and the middle of its events. Throws when no event starts in it: a card of nothing says nothing. */
export function tonightCard(tonight: Tonight): { page: TonightFrontPage; centre: { lat: number; lng: number } | null } {
  const from = formatUtcDateTime(tonight.fromS * 1000, { year: true });
  if (!tonight.count) throw new Error(`No scene events start in the twelve hours from ${from}.`);
  const centre = centreOf(tonight.points.map((p) => ({ latitude: p.lat, longitude: p.lon })));
  return {
    page: {
      kind: 'tonight',
      fromS: tonight.fromS,
      untilS: tonight.untilS,
      title: `Raver Watch · tonight from ${from}`,
      lines: tonightLines(tonight),
      count: tonight.count,
      underHeat: tonight.underHeat,
      underWay: tonight.underWay,
      regions: tonight.regions,
    },
    centre: centre ? { lat: centre.lat, lng: centre.lng } : null,
  };
}
