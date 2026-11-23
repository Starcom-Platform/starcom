/**
 * Hero Watch's week on a card (hero-watch.md, D-HW, HW10), a front page of its own, as tonight's is
 * (tonightCard.ts): its title the roundup's, its lines the week's relief, lifeboat launches and field
 * missions (heroWatchWeek.ts). The camera turns to the middle of the week's relief and missions; the
 * record keeps the page.
 */
import type { HeroWatchWeek } from '../../../services/heroWatch/heroWatchWeek';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import type { WeekFrontPage } from './shareCardProvenance';

/** The week's page, and the middle of its relief and missions, or null where it has none placed. */
export function weekCard(week: HeroWatchWeek): { page: WeekFrontPage; centre: { lat: number; lng: number } | null } {
  const centre = centreOf(week.points.map((p) => ({ latitude: p.lat, longitude: p.lng })));
  return {
    page: {
      kind: 'week',
      week: week.week,
      title: week.title,
      lines: week.lines,
      relief: week.relief,
      missions: week.missions,
      stations: week.stations,
    },
    centre: centre ? { lat: centre.lat, lng: centre.lng } : null,
  };
}
