/**
 * What a click on an analysis mark opens (critique C5, the open list of decision D-CT): what Starcom's own analysis
 * concluded at that place, from how many independent sources, over what time, how heavily it is weighted, and when
 * and by what it was computed, with the sources that could not be reached then.
 *
 * It links nothing: a mark carries no source of its own, and the panel says so rather than leaving it unsaid. A
 * mark built from fabricated data says so first, as its label and colour do (useGlobeIntelMarkers).
 */
import type { GlobeIntelLayer, GlobeIntelMark } from '../../../services/intel/globe/globeIntelLayer';
import { formatUtcDateTime } from '../../../utils/utcTime';
import type { GlobeNoteSet } from './globeNoteStore';

const msOf = (iso: string): number | null => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

export function analysisMarkNoteSet(mark: GlobeIntelMark, layer: Pick<GlobeIntelLayer, 'provenance'>): GlobeNoteSet {
  const { provenance } = layer;
  const from = msOf(mark.observedFrom);
  const to = msOf(mark.observedTo);
  const lines = [
    ...(mark.isMock ? ['Built from fabricated (fixture) data: not a finding.'] : []),
    `${mark.sourceCount} independent source${mark.sourceCount === 1 ? '' : 's'}`,
    ...(from !== null && to !== null
      ? [`Observed ${formatUtcDateTime(from, { year: true })} to ${formatUtcDateTime(to, { year: true })}`] : []),
    `Weight ${mark.weight.toFixed(2)} of 1, derived from source reliability, method and age`,
    `Computed by ${provenance.derivedFrom}, version ${provenance.algorithmVersion}`,
    ...(provenance.blindSpots.length ? [`Unreachable when it was computed: ${provenance.blindSpots.join(', ')}`] : []),
  ];
  return {
    heading: 'Analysis',
    notes: [{
      id: mark.id,
      kind: mark.isMock ? 'Starcom\'s analysis, from fabricated data'
        : mark.kind === 'contradiction' ? 'Starcom\'s analysis: a contradiction' : 'Starcom\'s analysis: corroboration',
      title: mark.label,
      text: lines.join('\n'),
      timeMs: msOf(provenance.computedAt),
      sources: [],
    }],
  };
}
