import { GLOSSARY } from '../../services/help/glossary';
import { openGlossary } from './glossaryOpen';

/**
 * The glossary in the header's command box (plan item 3.2): "/glossary" to
 * open it, and each word, so typing it finds what it means. A word's other
 * names find it too, without being shown.
 */
export function glossaryCommands() {
  return [
    {
      id: 'cmd-glossary',
      type: 'command' as const,
      title: '/glossary',
      description: 'The words Starcom uses, and what each means here',
      action: () => openGlossary(),
    },
    ...GLOSSARY.map((entry) => ({
      id: `glossary-${entry.id}`,
      type: 'command' as const,
      title: `? ${entry.term}`,
      description: entry.short,
      keywords: (entry.aka ?? []).join(' '),
      action: () => openGlossary(entry.id),
    })),
  ];
}
