/**
 * The palette's Psi lists (D-PW, PW88): each list by its words, opening the Lists panel on its tab, and the lab's two
 * tabs (PW94–PW96), while Psi Watch is shown.
 */
import { messagesNow } from '../../i18n/app/i18n';
import { paletteMatch, type PaletteResult } from '../palette/palette';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import { openPsiLists, PSI_LIST_TABS } from './psiListsPanel';
import { openPsiLab, PSI_LAB_TABS } from './psiLabPanel';

const KEYWORDS: Record<(typeof PSI_LIST_TABS)[number], string> = {
  notes: 'psi daily note notes brief',
  registrations: 'psi registrations registered sealed',
  ledger: 'psi ledger results',
  intel: 'psi intel window reports',
  missions: 'psi missions mission window peak',
};

const LAB_KEYWORDS: Record<(typeof PSI_LAB_TABS)[number], string> = {
  explore: 'psi lab explore shifts null configuration',
  draft: 'psi lab draft test hypothesis registry board',
};

export function psiListsResults(query: string): readonly PaletteResult[] {
  if (!query || !psiKitOn()) return [];
  const w = messagesNow().psiWatch.lists;
  const results: PaletteResult[] = PSI_LIST_TABS.map((tab) => ({
    id: `psi-lists:${tab}`, section: 'commands', title: `${w.heading}: ${w[tab]}`, description: w.openTitle, glyph: 'mode:PsiWatch',
    keywords: KEYWORDS[tab], quiet: true, run: () => openPsiLists(tab),
  }));
  // The lab's two tabs (PW94–PW96).
  const lab = messagesNow().psiWatch.lab;
  for (const tab of PSI_LAB_TABS) {
    results.push({
      id: `psi-lab:${tab}`, section: 'commands', title: `${lab.heading}: ${lab[tab]}`, description: lab.openTitle, glyph: 'mode:PsiWatch',
      keywords: LAB_KEYWORDS[tab], quiet: true, run: () => openPsiLab(tab),
    });
  }
  return paletteMatch(results, query);
}
