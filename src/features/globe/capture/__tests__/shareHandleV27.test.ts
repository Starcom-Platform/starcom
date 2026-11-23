/**
 * Share handle v27, as published: groups (BA10). Each listed Intel Report
 * carries `group` ({ key, kind, size }); `listGroups()` lists each group with
 * its members most severe first; a card featuring one of a group says which of
 * how many it is.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v27', () => {
  it('is at version 27', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(27);
  });

  it('lists each report\'s group, and the groups', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toContain('group');
    expect(SHARE_HANDLE_CONTRACT.methods.listGroups).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.listGroups).toEqual(['key', 'kind', 'size', 'members', 'lat', 'lng', 'territory']);
  });
});
