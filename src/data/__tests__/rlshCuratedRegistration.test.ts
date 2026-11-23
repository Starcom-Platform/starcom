import {
  CURATED_RLSH_REGISTRATIONS,
  CURATED_RLSH_REGISTRATION_DIAGNOSTICS
} from '../rlshCuratedRegistration';

describe('rlshCuratedRegistration role datasets', () => {
  it('produces normalized records with unique IDs', () => {
    const ids = CURATED_RLSH_REGISTRATIONS.map((record) => record.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
    expect(CURATED_RLSH_REGISTRATION_DIAGNOSTICS.totalNormalized).toBe(CURATED_RLSH_REGISTRATIONS.length);
  });

  it('ensures records preserve required reviewer metadata and valid role labels', () => {
    const allowedRoles = new Set(['hero', 'zone_guardian', 'rescue_ranger', 'archangel_knight']);

    CURATED_RLSH_REGISTRATIONS.forEach((record) => {
      expect(record.id.trim().length).toBeGreaterThan(0);
      expect(allowedRoles.has(record.role)).toBe(true);
      expect(typeof record.approved).toBe('boolean');
      expect(typeof record.reviewedBy).toBe('string');
      expect(record.reviewedBy.trim().length).toBeGreaterThan(0);
      expect(typeof record.reviewedAt).toBe('string');
    });
  });
});
