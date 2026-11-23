// MitreAttackReferenceService.ts — real, static "Known Threat Groups" reference data for
// CyberThreats, baked from MITRE ATT&CK's real STIX bundle. Verified live before building
// this: raw.githubusercontent.com/mitre-attack/attack-stix-data is real, CORS-open
// (Access-Control-Allow-Origin: * confirmed on a live response), and genuinely rich — 191
// real threat-actor groups, 733 real malware families, 858 real techniques. But the full
// bundle is 53MB (no smaller split-by-type file exists in that repo) — completely
// impractical to bake into the deployed bundle (this app targets Vercel's free tier; even a
// derived ~53MB asset would be a bad idea) or to fetch on every page load.
//
// So: fetch lazily (only when a caller actually asks — i.e. the user opened the Known
// Groups layer, not on app boot), filter immediately down to what a reference display
// actually needs (discarding ~21K of the 26K real objects — mostly x-mitre-analytic/
// x-mitre-detection-strategy/relationship records not needed here), and persist only the
// filtered (~hundreds of KB) result via MitreAttackCacheStore — never the raw 53MB. Nothing
// here is baked into the git repo or the deployed bundle.
import axios from 'axios';
import { createLogger } from '@utils/logger';
import { mitreAttackCacheStore } from './MitreAttackCacheStore';
import type { MitreGroup, MitreMalware, MitreReferenceData, MitreTechnique } from '../../types/MitreAttack';

const log = createLogger({ prefix: 'MitreAttackReferenceService' });

export const STIX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
// ATT&CK revises infrequently (roughly twice a year) — 30 days is generous, not aggressive.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// A group's real description can run to several paragraphs; capped so 191 real groups'
// worth of them stay a reasonable fraction of the filtered dataset's size. Still real text,
// just shortened — not fabricated or summarized.
const DESCRIPTION_MAX_LENGTH = 400;

interface StixExternalRef {
  source_name?: unknown;
  external_id?: unknown;
}

interface StixObject {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  aliases?: unknown;
  description?: unknown;
  external_references?: unknown;
  relationship_type?: unknown;
  source_ref?: unknown;
  target_ref?: unknown;
}

function getMitreId(obj: StixObject): string | null {
  const refs = Array.isArray(obj.external_references) ? obj.external_references as StixExternalRef[] : [];
  const ref = refs.find(r => r.source_name === 'mitre-attack');
  return typeof ref?.external_id === 'string' ? ref.external_id : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Exported for direct unit testing against a small fixture (src/testing/mitreAttackFixture.json)
 * — the live 53MB bundle is real and CORS-open (verified separately, see the live test in
 * this file's own test suite) but far too large to exercise on every test run. Pure and
 * synchronous: no network, no IndexedDB, just the real filter/link logic. */
export function filterStixBundle(objects: StixObject[]): MitreReferenceData {
  const groups: MitreGroup[] = [];
  const techniques: MitreTechnique[] = [];
  const malware: MitreMalware[] = [];
  const techniqueMitreIdByStixId = new Map<string, string>();
  const groupTechniques = new Map<string, Set<string>>();

  for (const obj of objects) {
    const mitreId = getMitreId(obj);
    if (!mitreId) continue;
    const id = typeof obj.id === 'string' ? obj.id : '';
    const name = typeof obj.name === 'string' ? obj.name : '';

    if (obj.type === 'intrusion-set') {
      groups.push({
        id,
        mitreId,
        name,
        aliases: toStringArray(obj.aliases),
        description: (typeof obj.description === 'string' ? obj.description : '').slice(0, DESCRIPTION_MAX_LENGTH),
        techniqueIds: []
      });
    } else if (obj.type === 'attack-pattern') {
      techniques.push({ id, mitreId, name });
      techniqueMitreIdByStixId.set(id, mitreId);
    } else if (obj.type === 'malware') {
      malware.push({ id, mitreId, name });
    }
  }

  for (const obj of objects) {
    if (obj.type !== 'relationship' || obj.relationship_type !== 'uses') continue;
    const sourceRef = typeof obj.source_ref === 'string' ? obj.source_ref : '';
    const targetRef = typeof obj.target_ref === 'string' ? obj.target_ref : '';
    if (!sourceRef.startsWith('intrusion-set--') || !targetRef.startsWith('attack-pattern--')) continue;

    const techniqueMitreId = techniqueMitreIdByStixId.get(targetRef);
    if (!techniqueMitreId) continue;

    const set = groupTechniques.get(sourceRef) ?? new Set<string>();
    set.add(techniqueMitreId);
    groupTechniques.set(sourceRef, set);
  }

  for (const group of groups) {
    const set = groupTechniques.get(group.id);
    if (set) group.techniqueIds = Array.from(set).sort();
  }

  return { groups, techniques, malware, fetchedAt: Date.now() };
}

function isFresh(data: MitreReferenceData): boolean {
  return Date.now() - data.fetchedAt < CACHE_TTL_MS;
}

let inFlight: Promise<MitreReferenceData> | null = null;

/** The full real pipeline: check the real persisted cache first, and only fetch+filter the
 * live 53MB bundle on a genuine miss/expiry. Meant to be called lazily — only when a caller
 * actually needs this (the Known Groups layer was enabled), never on app boot. */
export async function getMitreReferenceData(): Promise<MitreReferenceData> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const cached = await mitreAttackCacheStore.get();
      if (cached && isFresh(cached)) return cached;

      log.debug('Fetching real MITRE ATT&CK STIX bundle (~53MB, one-time per cache period)...');
      const response = await axios.get<{ objects?: unknown }>(STIX_URL, { timeout: 60000 });
      const objects = Array.isArray(response.data.objects) ? response.data.objects as StixObject[] : [];
      const data = filterStixBundle(objects);

      await mitreAttackCacheStore.set(data);
      return data;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
