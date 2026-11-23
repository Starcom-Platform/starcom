import type { ApplicationId } from '../Router/EnhancedApplicationRouter';
import type { GlyphName } from '../../symbols/uiSymbols';

/**
 * The bar on a phone (K2, BD5): Globe, Cases, Missions, Intel and More.
 *
 * At 390 px the full bar's nine buttons needed about 415 px, so it scrolled
 * sideways and showed icons without names. Here every button has its name.
 * Intel opens a sheet of the three intel apps and More one of the rest, Support
 * and Settings, each app with its line of description, so nobody has to know
 * which app holds what. Every application is reached once, from the bar or a
 * sheet. Settings is here because the phone's header has no room for its gear.
 */
export type PhoneBarEntry =
  | { key: string; app: ApplicationId }
  | { key: 'intel' | 'more'; label: string; glyph: GlyphName; apps: readonly ApplicationId[] };

export const PHONE_BAR: readonly PhoneBarEntry[] = [
  { key: 'cybercommand', app: 'cybercommand' },
  { key: 'cases', app: 'cases' },
  { key: 'teamworkspace', app: 'teamworkspace' },
  { key: 'intel', label: 'Intel', glyph: 'nav:intel', apps: ['inteldashboard', 'intelanalyzer', 'intelweb'] },
  { key: 'more', label: 'More', glyph: 'nav:more', apps: ['netrunner', 'marketexchange'] },
];
