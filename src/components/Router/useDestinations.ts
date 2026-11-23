/**
 * The places Starcom goes, named in the language shown (decision D-ML): the bars, quick access and the
 * header's search draw these, so an application is called the same everywhere. A name that is a product's
 * (NetRunner, IntelWeb) stays as it is; the rest are words.
 */
import { useMemo } from 'react';
import { useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import { DESTINATIONS, type Destination } from './EnhancedApplicationRouter';

/** The destinations, each named and described in the words given. */
export const destinationsIn = (words: Messages['nav']['apps']): Destination[] =>
  DESTINATIONS.map((d) => ({ ...d, label: words[d.app].name, description: words[d.app].description }));

/** The destinations in the language shown. */
export function useDestinations(): Destination[] {
  const { m } = useMessages();
  return useMemo(() => destinationsIn(m.nav.apps), [m]);
}
