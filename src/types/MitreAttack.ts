// MitreAttack.ts — types for the real, filtered MITRE ATT&CK reference data baked from the
// live STIX bundle (see MitreAttackReferenceService.ts). Static reference data, not a live
// feed: real known threat-actor groups, malware, and techniques, but not "this group is
// active right now" — the same honesty boundary RealBlocklistService.ts already draws for
// its own periodic-aggregate data.

export interface MitreGroup {
  id: string; // real STIX id, e.g. "intrusion-set--00f67a77-..."
  mitreId: string; // real ATT&CK ID, e.g. "G0082"
  name: string;
  aliases: string[]; // real, from MITRE's own alias list for this group
  description: string; // real, truncated (see MitreAttackReferenceService's own cap) — not fabricated, just shortened
  techniqueIds: string[]; // real technique IDs (e.g. "T1055.011") this group is documented using
}

export interface MitreTechnique {
  id: string;
  mitreId: string; // e.g. "T1055.011"
  name: string;
}

export interface MitreMalware {
  id: string;
  mitreId: string; // e.g. "S0061"
  name: string;
}

export interface MitreReferenceData {
  groups: MitreGroup[];
  techniques: MitreTechnique[];
  malware: MitreMalware[];
  fetchedAt: number; // real timestamp of when this was baked from the live STIX bundle
}
