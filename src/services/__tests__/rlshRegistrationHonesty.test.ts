/**
 * The app must not say 195 people are in a queue they never joined.
 *
 * 195 of the 197 RLSH markers are scraped from wiki.rlsh.net by a third party.
 * They carry no registration, and the popup rendered
 * `registrationApproved ? 'Approved' : 'Pending curation'` — so every one of
 * them was labelled as awaiting curation. These are real, named people, most
 * with a secret identity, who did not ask to be in this dataset.
 *
 * "Nobody submitted this" and "somebody submitted this and we have not reviewed
 * it" are different facts, and only the second is about the person. Likewise
 * `roleClass` is assigned 'hero' to every scraped marker — necessary, because
 * the role filter drops a marker without one — but displaying it plainly
 * presents our default as the person's own claim.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RLSHOverlayMarker } from '../../interfaces/RLSHOverlay';
import { rlshVisualizationService } from '../RLSHVisualizationService';

const svc = rlshVisualizationService as unknown as {
  applyCuratedRegistration(m: RLSHOverlayMarker): void;
};

const bare = (id: string) => ({ id, displayName: id, tags: [] } as unknown as RLSHOverlayMarker);

describe('RLSH registration honesty', () => {
  it('says NOT REGISTERED for a scraped record, not "pending"', () => {
    const m = bare('rlsh-asylum-22');
    svc.applyCuratedRegistration(m);
    expect(m.registrationStatus).toBe('none');
    expect(m.registrationApproved).toBe(false);
  });

  it('marks an assigned role as assumed, not as the person\'s claim', () => {
    const m = bare('rlsh-asylum-22');
    svc.applyCuratedRegistration(m);
    // The class is still SET, because isMarkerIncludedByRoleFilter drops a
    // marker without one and the globe would go empty.
    expect(m.roleClass).toBe('hero');
    expect(m.roleSource).toBe('assumed');
  });

  it('distinguishes submitted-but-unreviewed from never-submitted', () => {
    // Three states, not two. Collapsing them is what made the label lie.
    const statuses = new Set<string>();
    for (const id of ['rlsh-asylum-22', 'rlsh-ace-1']) {
      const m = bare(id);
      svc.applyCuratedRegistration(m);
      statuses.add(m.registrationStatus ?? 'missing');
    }
    expect(statuses.has('none')).toBe(true);
    // rlsh-ace-1 is one of the two REAL registrations — approved, reviewed,
    // role zone_guardian. Discovered by picking it as a "scraped" example and
    // being told it was approved.
    expect(statuses.has('approved')).toBe(true);
    expect(statuses.has('missing')).toBe(false);
  });

  it('keeps every marker filterable, so honesty does not empty the globe', () => {
    // The trap: making roleClass undefined for unregistered people would be
    // more "honest" and would hide 195 of 197 markers, because the role filter
    // excludes a marker that has none.
    for (const id of ['rlsh-asylum-22', 'rlsh-ace-1', 'rlsh-captain-ozone-71']) {
      const m = bare(id);
      svc.applyCuratedRegistration(m);
      expect(m.roleClass, id).toBeTruthy();
    }
  });

  it('records the registered people\'s OWN role, not our default', () => {
    /*
     * Both real registrations are zone_guardian and rescue_ranger — the two
     * classes gated behind a feature flag today. The rail also defaulted its
     * role filter to 'hero', and the filter matches exactly, so the only two
     * people who actually registered were excluded from the globe and the
     * buttons that could reveal them had just been removed.
     *
     * Registering made a person invisible. The rail now defaults to everyone.
     */
    const ace = bare('rlsh-ace-1');
    svc.applyCuratedRegistration(ace);
    expect(ace.roleClass).toBe('zone_guardian');
    expect(ace.roleSource).toBe('registered');

    const seven = bare('rlsh-agent-seven-3');
    svc.applyCuratedRegistration(seven);
    expect(seven.roleClass).toBe('rescue_ranger');
    expect(seven.roleSource).toBe('registered');
  });
});
