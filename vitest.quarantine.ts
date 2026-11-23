/**
 * Tests excluded from every default run, in ONE place.
 *
 * This list lived in `vitest.config.ts` alone, and `vitest.config.ts` is used
 * by exactly one script (`test:full`). Everything else — `npm test`, the
 * sharded runner, `test:unsharded`, `test:watch` — uses
 * `vitest.stable.config.ts`, which did not have it. So the quarantine that was
 * added to remove twenty network-dependent failures removed them from the run
 * almost nobody performs, and `npm test` kept failing for reasons that say
 * something about NOAA's uptime and nothing about this codebase.
 *
 * Shared rather than copied, because a copied list drifts silently: the copy
 * that is missing an entry does not announce itself, it just goes red for a
 * reason unrelated to the code.
 */

/**
 * LIVE-NETWORK PROBES, not unit tests.
 *
 * These call services.swpc.noaa.gov directly and
 * mock nothing — one opens with "This test will fail initially - we're using
 * it to explore the real API", which is exactly what they are: TDD
 * exploration committed as tests. A suite that reports failure for reasons
 * unrelated to the code cannot tell anyone when the code broke.
 *
 * Excluded, NOT deleted: they have real value as live probes against sources
 * this project depends on. Run them deliberately with `npm run test:live`.
 *
 * `noaaSpaceWeather.unit.test.ts` is here despite its name — it makes two live
 * calls. `noaaSpaceWeather.quality.test.ts` reaches the network through the
 * service rather than directly, so it has no live URL in the file and still
 * fails without one.
 */
export const LIVE_NETWORK_TESTS = [
  'src/services/noaaSpaceWeather.test.ts',
  'src/services/noaaSpaceWeather.integration.test.ts',
  'src/services/noaaSpaceWeather.unit.test.ts',
  'src/services/noaaSpaceWeather.quality.test.ts',
  // GDELTEventService.test.ts left this list on 2026-09-11: the app now reads a
  // build-time snapshot, so that file tests the loader with a mocked fetch and
  // runs in every default run. GDELT itself is asked by scripts/snapshot-gdelt.mjs.

  /**
   * Nine more, found by asking the suite to describe itself.
   *
   * Every one of these contains the phrase "(not mocked)" or "real live data"
   * in its own describe block, and none contains a single fetch mock — they
   * reach the network through the service rather than through a URL written in
   * the test, which is why a search for URLs missed them.
   *
   * They were not failing when the quarantine was first assembled, because a
   * live-network test only fails when the network or the far end is having a
   * bad day. That is exactly what makes them unfit for a required check: they
   * report on somebody else's uptime, on a schedule nobody controls. One of
   * them (OTX) failed on the very run that verified the widened CI job, which
   * is how they were noticed at all.
   */
  'src/services/CyberAttacks/OTXEnrichmentService.test.ts',
  // RealBlocklistService.test.ts left this list on 2026-09-11: the app reads a
  // build-time threat snapshot, so that file tests the loader with a mocked fetch.
  'src/services/CyberAttacks/__tests__/RealTimeAttackService.test.ts',
  // EIAInternationalService.test.ts: deleted on 2026-10-13 — production is read
  // from Mecha Jono's notes or a file, not api.eia.gov (energyProduction.test.ts).
  // IPCountryService.test.ts: deleted with the service on 2026-09-11 — the app no
  // longer downloads the IP table; the build places IPs (ipCountryTable.test.ts).
  'src/services/geopolitical/UNHCRDisplacementService.test.ts',
  'src/services/geopolitical/WorldBankWaterService.test.ts',
  'src/services/threat-intel/MitreAttackReferenceService.test.ts',
  'src/services/comm-hubs/SubmarineCableService.test.ts',
];
