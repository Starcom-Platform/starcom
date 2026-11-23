/**
 * Role classes are only offered when something is behind them.
 *
 * All four exist in the type and every marker in the embedded dataset resolves
 * to `hero`, so a Zone Guardian or Rescue Ranger filter emptied the globe. An
 * operator reads an empty globe as lost data, not as an unfinished feature —
 * the worse of the two failures, because it makes them distrust the map.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { availableRLSHRoleClasses, RLSH_ROLE_CLASS_AVAILABILITY, ROLE_LABELS } from '../rlshVisualizationTypes';

describe('RLSH role class availability', () => {
  it('offers only hero while the others have no data behind them', () => {
    expect(availableRLSHRoleClasses()).toEqual(['hero']);
  });

  it('does not offer a role that would return nothing', () => {
    for (const role of availableRLSHRoleClasses()) {
      expect(RLSH_ROLE_CLASS_AVAILABILITY[role]).toBe(true);
    }
  });

  it('keeps every class labelled, so gating hides the filter and not the concept', () => {
    // A marker that already carries zone_guardian must still render its name;
    // the gate is about what an operator may FILTER by, not about erasing the
    // taxonomy the registration path is meant to populate.
    for (const role of Object.keys(RLSH_ROLE_CLASS_AVAILABILITY) as Array<keyof typeof ROLE_LABELS>) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it('never offers archangel_knight as a browsing bucket', () => {
    // It is an authority, not a population to filter down to.
    expect(availableRLSHRoleClasses()).not.toContain('archangel_knight');
  });
});
