export type { SourceAdapter, AdapterResult } from './types';
export { UcdpAdapter, ucdpAdapter, UCDP_SOURCE } from './ucdpAdapter';
export {
  NaturalEventAdapter,
  usgsAdapter, gdacsAdapter, eonetAdapter,
  USGS_SOURCE, GDACS_SOURCE, EONET_SOURCE,
} from './naturalEventAdapter';
export { ReliefWebAdapter, reliefWebAdapter, RELIEFWEB_SOURCE } from './reliefWebAdapter';
export { NetRunnerAdapter, netrunnerAdapter, NETRUNNER_SOURCE } from './netrunnerAdapter';

import { ucdpAdapter } from './ucdpAdapter';
import { usgsAdapter, gdacsAdapter, eonetAdapter } from './naturalEventAdapter';
import { reliefWebAdapter } from './reliefWebAdapter';
import { netrunnerAdapter } from './netrunnerAdapter';
import type { Source } from '../../../../types/intel/SourceObservation';

/**
 * Every registered source — the list docs/build-order.md's Phase 1 gate
 * measures: "six independent source types feed one correlation engine".
 *
 * Six separate entries with six separate trust grades and four distinct
 * methods, rather than one "open data" source. That separation is the point:
 * trust and method are per-source facts, and merging them would make derived
 * weight meaningless.
 */
export const REGISTERED_SOURCES: Source[] = [
  ucdpAdapter.source,
  usgsAdapter.source,
  gdacsAdapter.source,
  eonetAdapter.source,
  reliefWebAdapter.source,
  netrunnerAdapter.source,
];
