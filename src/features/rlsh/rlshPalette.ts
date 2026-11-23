/**
 * The palette's RLSH commands (D-RF): "Your RLSH card" and the list of heroes' cards, found by their words.
 */
import { messagesNow } from '../../i18n/app/i18n';
import { paletteMatch, type PaletteResult } from '../palette/palette';
import { openRlshPanel } from './rlshPanel';

export function rlshResults(query: string): readonly PaletteResult[] {
  const w = messagesNow().rlsh;
  const results: PaletteResult[] = [
    {
      id: 'rlsh:card', section: 'commands', title: w.register, description: w.intro, glyph: 'rlsh:register',
      keywords: 'rlsh hero card profile register join sign up', quiet: true, run: () => openRlshPanel('mine'),
    },
    {
      id: 'rlsh:list', section: 'commands', title: `${w.heading}: ${w.tabList}`, description: w.listIntro, glyph: 'rlsh:hero',
      keywords: 'rlsh heroes cards list who', quiet: true, run: () => openRlshPanel('list'),
    },
  ];
  return query ? paletteMatch(results, query) : [];
}
