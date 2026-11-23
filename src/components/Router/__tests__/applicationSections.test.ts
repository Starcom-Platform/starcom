/**
 * Every application belongs to a section, and wears that section's tint in its
 * frame (BD2, BD10). The sections are the interface plan's workspaces.
 */
import { describe, it, expect } from 'vitest';
import { APPLICATIONS } from '../EnhancedApplicationRouter';
import { SECTIONS } from '../../../styles/tokens';

describe('the sections', () => {
  it('place each application as the swatch sheet did', () => {
    expect(Object.fromEntries(APPLICATIONS.map((a) => [a.id, a.section]))).toEqual({
      cybercommand: 'situation',
      netrunner: 'collect',
      inteldashboard: 'collect',
      cases: 'investigate',
      teamworkspace: 'assemble',
      intelanalyzer: 'analyse',
      intelweb: 'analyse',
      marketexchange: 'publish',
    });
  });

  it('name only sections that have a tint', () => {
    for (const app of APPLICATIONS) expect(SECTIONS[app.section], app.id).toBeDefined();
  });
});
