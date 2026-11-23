/**
 * The relay sets, read from the registry the app itself dials from.
 *
 * src/config/publicInfrastructure.ts is the one place a relay address is
 * written down (guard-hardcoded-relays enforces that). The scripts need the
 * same sets — the node descriptor tells consumers where to listen, the claim
 * CLI publishes there, relay-limits asks those relays what they accept — and
 * until 2026-09-19 each kept its own copy, which is how an app and its own
 * descriptor come to name different relays with nothing failing.
 *
 * The registry is TypeScript and most of these scripts run under plain node,
 * so it is loaded through tsx's require hook rather than by pattern-matching
 * its text: the sets are built from one another (the federation set is The
 * Record plus the surface set; the extra set is the pool minus it), and a
 * regex would read the literals and miss the arithmetic.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { require: tsRequire } = require('tsx/cjs/api');

const registry = tsRequire('../../src/config/publicInfrastructure.ts', import.meta.url);

/** Where Starcom's globe intel is read from and the in-app broadcaster publishes. */
export const NAVCOM_SURFACE_RELAYS = [...registry.NAVCOM_SURFACE_RELAYS];
/** The peer-operated, allowlist-write archive. */
export const THE_RECORD_RELAY = registry.THE_RECORD_RELAY;
/** The Record first, then the surface set: where operator claims go and are read. */
export const FEDERATION_READ_RELAYS = [...registry.FEDERATION_READ_RELAYS];
