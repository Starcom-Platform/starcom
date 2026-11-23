import heroesJson from './rlshRoles/heroes.json';
import zoneGuardiansJson from './rlshRoles/zone-guardians.json';
import rescueRangersJson from './rlshRoles/rescue-rangers.json';
import archangelKnightsJson from './rlshRoles/archangel-knights.json';

export type RLSHRegistrationRole = 'hero' | 'zone_guardian' | 'rescue_ranger' | 'archangel_knight';

export interface CuratedRLSHRegistrationRecord {
  id: string;
  role: RLSHRegistrationRole;
  approved: boolean;
  reviewedBy: string;
  reviewedAt: string;
  notes?: string;
  nostrNpub?: string;
  contactEmail?: string;
  socialLinks?: string[];
  contactConsent?: {
    nostr?: boolean;
    email?: boolean;
    social?: boolean;
  };
}

interface CuratedRegistrationJsonRecord {
  id?: unknown;
  approved?: unknown;
  reviewedBy?: unknown;
  reviewedAt?: unknown;
  notes?: unknown;
  nostrNpub?: unknown;
  contactEmail?: unknown;
  socialLinks?: unknown;
  contactConsent?: {
    nostr?: unknown;
    email?: unknown;
    social?: unknown;
  } | unknown;
}

export interface CuratedRLSHRegistrationDiagnosticEntry {
  role: RLSHRegistrationRole;
  index: number;
  reason: 'invalid-file-format' | 'missing-id' | 'invalid-reviewed-at' | 'invalid-approved-type';
}

export interface CuratedRLSHRegistrationDiagnostics {
  totalNormalized: number;
  totalInvalid: number;
  duplicateIds: string[];
  invalidEntries: CuratedRLSHRegistrationDiagnosticEntry[];
}

const normalizeRoleRecords = (
  role: RLSHRegistrationRole,
  records: unknown,
  invalidEntries: CuratedRLSHRegistrationDiagnosticEntry[]
): CuratedRLSHRegistrationRecord[] => {
  if (!Array.isArray(records)) {
    invalidEntries.push({
      role,
      index: -1,
      reason: 'invalid-file-format'
    });
    return [];
  }

  return records.flatMap((raw, index): CuratedRLSHRegistrationRecord[] => {
    if (!raw || typeof raw !== 'object') {
      invalidEntries.push({
        role,
        index,
        reason: 'missing-id'
      });
      return [];
    }

    const candidate = raw as CuratedRegistrationJsonRecord;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id) {
      invalidEntries.push({
        role,
        index,
        reason: 'missing-id'
      });
      return [];
    }

    if (typeof candidate.approved !== 'undefined' && typeof candidate.approved !== 'boolean') {
      invalidEntries.push({
        role,
        index,
        reason: 'invalid-approved-type'
      });
    }

    const approved = typeof candidate.approved === 'boolean' ? candidate.approved : false;
    const reviewedBy = typeof candidate.reviewedBy === 'string' ? candidate.reviewedBy.trim() : '';
    const reviewedAtRaw = typeof candidate.reviewedAt === 'string' ? candidate.reviewedAt.trim() : '';
    if (reviewedAtRaw && Number.isNaN(Date.parse(reviewedAtRaw))) {
      invalidEntries.push({
        role,
        index,
        reason: 'invalid-reviewed-at'
      });
    }

    const reviewedAt = reviewedAtRaw && !Number.isNaN(Date.parse(reviewedAtRaw)) ? reviewedAtRaw : '';
    const notes = typeof candidate.notes === 'string' ? candidate.notes.trim() : undefined;
    const nostrNpub = typeof candidate.nostrNpub === 'string' ? candidate.nostrNpub.trim() : '';
    const contactEmail = typeof candidate.contactEmail === 'string' ? candidate.contactEmail.trim() : '';
    const socialLinks = Array.isArray(candidate.socialLinks)
      ? candidate.socialLinks
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
      : [];
    const contactConsentCandidate = (candidate.contactConsent && typeof candidate.contactConsent === 'object')
      ? candidate.contactConsent as { nostr?: unknown; email?: unknown; social?: unknown }
      : null;
    const contactConsent = contactConsentCandidate
      ? {
        nostr: typeof contactConsentCandidate.nostr === 'boolean' ? contactConsentCandidate.nostr : undefined,
        email: typeof contactConsentCandidate.email === 'boolean' ? contactConsentCandidate.email : undefined,
        social: typeof contactConsentCandidate.social === 'boolean' ? contactConsentCandidate.social : undefined
      }
      : undefined;

    return [{
      id,
      role,
      approved,
      reviewedBy,
      reviewedAt,
      notes,
      nostrNpub,
      contactEmail,
      socialLinks,
      contactConsent
    }];
  });
};

const roleSourceOrder: Array<{ role: RLSHRegistrationRole; records: unknown }> = [
  { role: 'hero', records: heroesJson },
  { role: 'zone_guardian', records: zoneGuardiansJson },
  { role: 'rescue_ranger', records: rescueRangersJson },
  { role: 'archangel_knight', records: archangelKnightsJson }
];

const dedupeById = (records: CuratedRLSHRegistrationRecord[]): CuratedRLSHRegistrationRecord[] => {
  const byId = new Map<string, CuratedRLSHRegistrationRecord>();
  const duplicateIds: string[] = [];

  records.forEach((record) => {
    if (byId.has(record.id)) {
      duplicateIds.push(record.id);
    }
    byId.set(record.id, record);
  });

  dedupeByIdDuplicateIds.splice(0, dedupeByIdDuplicateIds.length, ...duplicateIds);
  return [...byId.values()];
};

const invalidEntries: CuratedRLSHRegistrationDiagnosticEntry[] = [];
const dedupeByIdDuplicateIds: string[] = [];

const normalizedRecords = roleSourceOrder.flatMap(({ role, records }) => normalizeRoleRecords(role, records, invalidEntries));

export const CURATED_RLSH_REGISTRATIONS: CuratedRLSHRegistrationRecord[] = dedupeById(normalizedRecords);

export const CURATED_RLSH_REGISTRATION_DIAGNOSTICS: CuratedRLSHRegistrationDiagnostics = {
  totalNormalized: CURATED_RLSH_REGISTRATIONS.length,
  totalInvalid: invalidEntries.length,
  duplicateIds: [...new Set(dedupeByIdDuplicateIds)],
  invalidEntries
};
