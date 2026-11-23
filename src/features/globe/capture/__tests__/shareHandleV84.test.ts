/**
 * Share handle v84 (D-RR, RR1): Safety windows is listed, as RLSH is, and never drawn in a card or a clip.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { readShot } from '../shotSpec';

const known = { layers: SHARE_HANDLE_CONTRACT.layers as readonly string[] };

describe('share handle v84', () => {
  it('lists SafetyWindows beside the other Missions sections', () => {
    expect(SHARE_HANDLE_VERSION).toBe(84);
    expect(SHARE_HANDLE_CONTRACT.layers).toEqual(expect.arrayContaining(['OpenMissions', 'CampaignsOperations', 'SafetyWindows']));
  });

  it('refuses a shot that would draw it, as primary or pinned', () => {
    const primary = readShot({ v: 1, subject: { view: { lat: 40.7, lng: -74, altitude: 1 } }, layers: { primary: 'SafetyWindows' } }, known);
    expect(JSON.stringify(primary)).toMatch(/Safety windows are never drawn in a card or a clip/);
    const pinned = readShot({ v: 1, subject: { view: { lat: 40.7, lng: -74, altitude: 1 } }, layers: { pins: ['SafetyWindows'] } }, known);
    expect(JSON.stringify(pinned)).toMatch(/Safety windows are never drawn in a card or a clip/);
  });
});
