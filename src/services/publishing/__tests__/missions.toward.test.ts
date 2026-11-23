/**
 * The publish review says what a package works toward (the owner's RS59): each Cause or Initiative by its title as
 * read here, or by its address when it has not been read; nothing when it names none.
 */
import { describe, it, expect, vi } from 'vitest';

const K = 'a'.repeat(64);
vi.mock('../../roster/rosterRead', () => ({
  rosterItems: () => [{ address: `30084:${'a'.repeat(64)}:cause-water`, title: 'Clean water for Flint' }],
}));

import { showManifest } from '../missions';
import type { PackageManifest } from '../../exchange/types';

const manifest = { name: 'Test the taps', description: 'd', author: 'Priya', license: 'CC-BY-4.0', objectives: [], metadata: {} } as unknown as PackageManifest;

describe('showManifest, works toward', () => {
  it('names each by its title as read here, or its address, in the order given', () => {
    const fields = showManifest(manifest, [], 0, [{ coordinate: `30084:${K}:cause-water` }, { coordinate: `30084:${K}:init-unread` }]).fields;
    expect(fields.find((f) => f.label === 'Works toward')?.value).toBe(`Clean water for Flint; 30084:${K}:init-unread`);
  });

  it('says nothing when it works toward none', () => {
    expect(showManifest(manifest).fields.some((f) => f.label === 'Works toward')).toBe(false);
  });
});
