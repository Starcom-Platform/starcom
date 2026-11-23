// ThreatIntelOTX.ts — types for real, per-IP threat-intel enrichment via AlienVault OTX.
// See OTXEnrichmentService.ts for the fetch/parse/cache logic and the live verification
// this is based on (a real, keyless, CORS-open per-indicator lookup, confirmed against a
// live IP already flowing through RealBlocklistService's own real pipeline).

/** One real community "pulse" (threat report) OTX associates with an indicator. */
export interface OTXPulse {
  id: string;
  name: string;
  malwareFamilies: string[]; // real, from pulse.malware_families — often empty, not fabricated when absent
  attackIds: string[]; // real MITRE ATT&CK technique IDs, from pulse.attack_ids
  targetedCountries: string[]; // real, from pulse.targeted_countries
  industries: string[];
  tlp: string; // Traffic Light Protocol sharing classification, e.g. "white"
}

/** Real, per-IP OTX enrichment — attached to an existing real CyberAttackData entry, not
 * a new attack record of its own. */
export interface OTXEnrichment {
  ip: string;
  pulseCount: number; // real pulse_info.count — may exceed pulses.length (a capped subset)
  pulses: OTXPulse[];
  malwareFamilies: string[]; // distinct, real, collected across pulses (capped subset)
}
