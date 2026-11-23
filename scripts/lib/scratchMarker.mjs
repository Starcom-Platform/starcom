/**
 * The scratch marker, read from the module the app itself refuses on.
 *
 * Loaded through tsx's require hook rather than copied, for the reason
 * scripts/lib/relayRegistry.mjs gives about the relay sets: a constant that
 * exists in two places is a constant that will eventually disagree with itself,
 * and here the two copies would be the thing that FINDS our litter and the
 * thing that REFUSES it — so a drift would mean the audit reporting a clean
 * network while the globe kept drawing fixtures.
 *
 * src/services/intel/scratchMarker.ts is deliberately tiny so this import costs
 * nothing; importing the ingest itself would build its singleton and pull in
 * nostr-tools.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { require: tsRequire } = require('tsx/cjs/api');

const module_ = tsRequire('../../src/services/intel/scratchMarker.ts', import.meta.url);

/** The hashtag a publisher attaches to say "this is a fixture, do not ingest". */
export const SCRATCH_MARKER_TAG = module_.SCRATCH_MARKER_TAG;
