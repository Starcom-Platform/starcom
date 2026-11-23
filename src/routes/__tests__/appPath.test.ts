/**
 * Every application's address (appPath.ts).
 *
 * The app named Missions (K1) lives at /app/missions. Its id stays
 * `teamworkspace`, so links to /app/teamworkspace, which were OpsCenter's,
 * still open it.
 */
import { describe, it, expect } from 'vitest';
import { appFromPath, appPath, recordFromPath } from '../appPath';

describe('appPath', () => {
  it('puts the Globe at / and every other app at /app/<id>', () => {
    expect(appPath('cybercommand')).toBe('/');
    expect(appPath('cases')).toBe('/app/cases');
  });

  it('puts Missions at /app/missions', () => {
    expect(appPath('teamworkspace')).toBe('/app/missions');
  });
});

describe('appFromPath', () => {
  it('reads Missions from its address, and from OpsCenter\'s old one', () => {
    expect(appFromPath('/app/missions')).toBe('teamworkspace');
    expect(appFromPath('/app/teamworkspace')).toBe('teamworkspace');
  });

  it('reads every app back from the address it gives it', () => {
    for (const id of ['cybercommand', 'netrunner', 'cases', 'teamworkspace', 'marketexchange'] as const) {
      expect(appFromPath(appPath(id))).toBe(id);
    }
  });

  it('says unknown for an app this build does not have, and nothing for a page that is not an app', () => {
    expect(appFromPath('/app/opscenter')).toBe('unknown');
    expect(appFromPath('/join')).toBeNull();
  });
});

describe('recordFromPath', () => {
  it('reads a record under either of Missions\' addresses', () => {
    expect(recordFromPath('/app/missions/m1', 'teamworkspace')).toBe('m1');
    expect(recordFromPath('/app/teamworkspace/m1', 'teamworkspace')).toBe('m1');
    expect(recordFromPath('/app/cases/m1', 'teamworkspace')).toBeNull();
  });
});
