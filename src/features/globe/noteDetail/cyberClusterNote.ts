/**
 * What a click on a cyber threat cluster opens (critique C5, the open list of decision D-CT): how many of its
 * country's addresses each threat list names in the sample the map draws, and each list's own file.
 *
 * Never an address. A listed address is often someone's compromised device, and naming it points at them; the
 * lists are linked for whoever needs the entries. The severity that colours the mark is Starcom's rating of each
 * list (threatSources.ts), so it is the hover's and the legend's, not restated here as a list's own.
 */
import type { CyberAttackCountryCluster } from '../../../utils/cyberAttackClustering';
import { THREAT_SOURCES } from '../../../services/CyberAttacks/threatSources';
import type { GlobeNoteSet } from './globeNoteStore';

const LIST_FILE = new Map(THREAT_SOURCES.map((list) => [list.label, list.url]));

/** A listing's labels, as cyberAttackClustering reads them: the list where the record carries one. */
const labelsOf = (attack: CyberAttackCountryCluster['attacks'][number]): string[] =>
  (attack.metadata as { sourceLabels?: string[] }).sourceLabels ?? String(attack.metadata.source ?? '').split(', ');

export function cyberClusterNoteSet(cluster: CyberAttackCountryCluster): GlobeNoteSet {
  const perList = new Map<string, number>();
  let newest: number | null = null;
  for (const attack of cluster.attacks) {
    for (const label of new Set(labelsOf(attack).filter(Boolean))) perList.set(label, (perList.get(label) ?? 0) + 1);
    const at = attack.timestamp instanceof Date ? attack.timestamp.getTime() : Number.NaN;
    if (Number.isFinite(at) && (newest === null || at > newest)) newest = at;
  }
  const lists = [...perList].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lines = [
    ...lists.map(([label, n]) => `${label}: ${n}`),
    ...(cluster.enrichedCount > 0 ? [`${cluster.enrichedCount} of them also in AlienVault OTX community pulses`] : []),
    ...(cluster.realMalwareFamilies.length ? [`Malware families named there: ${cluster.realMalwareFamilies.join(', ')}`] : []),
    '',
    'A sample of each list, taken when this build was made, drawn at the country\'s middle.',
  ];
  const code = cluster.countryCode;
  return {
    heading: `Cyber Threats · ${code}`,
    notes: [{
      id: `cyber-${code}`,
      kind: 'Threat lists',
      title: `${cluster.count} listed address${cluster.count === 1 ? '' : 'es'} in ${code}`,
      text: lines.join('\n'),
      timeMs: newest,
      sources: lists.map(([label]) => LIST_FILE.get(label)).filter((url): url is string => Boolean(url)),
    }],
  };
}
