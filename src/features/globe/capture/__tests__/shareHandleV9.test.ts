/**
 * Share handle v9, as published: the two parts of Mecha Jono's v9 proposal
 * the owner chose to build now (2026-10-02). `whenReady` takes an address and
 * says why it is not ready; `renderBatch` makes many cards in one page load.
 * The rest of v9 (focusEvent, composeFor, frameArea, renderMission, layersFor)
 * waits for block H, and the contract must not claim it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CAPTURE_SCHEMA_VERSION } from '../shareCardProvenance';

describe('contract v9', () => {
  it('is at version 9 or later; a card says what it said at v8', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(9);
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(10);
  });

  it('lets whenReady wait for one item, and say why it is not ready', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.whenReady).toEqual({ args: 1, options: ['timeoutMs', 'address'] });
    expect(SHARE_HANDLE_CONTRACT.returns.whenReady).toEqual(['ready', 'waitedMs', 'reason']);
  });

  it('declares renderBatch, what a request may say, and what each result says', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.renderBatch).toEqual({ args: 2, options: ['timeoutMs'] });
    // v36 added a theatre beside an area, v37 a brief and how many of its theatres, v38 tonight.
    // `week` since v42 (Hero Watch's week, HW10), `declassified` since v58 (the declassified desk's day, plan H9).
    expect(SHARE_HANDLE_CONTRACT.batchRequest).toEqual(['address', 'area', 'theatre', 'brief', 'theatres', 'tonight', 'week', 'declassified', 'psiEvent', 'at', 'psiBriefing', 'preset', 'layers', 'window', 'template']);
    // v11 added a shot, notes and timing after these.
    expect(SHARE_HANDLE_CONTRACT.returns.renderBatch.slice(0, 4)).toEqual(['ok', 'card', 'reason', 'note']);
  });

  // layersFor came in v12; the rest wait for what makes them keep their promise (globe record, section 21).
  it('claims none of the rest of v9 yet, but composeFor, with the templates (v14), and frameArea, with areas (v30)', () => {
    expect(SHARE_HANDLE_CONTRACT.methods).toHaveProperty('composeFor');
    expect(SHARE_HANDLE_CONTRACT.methods).toHaveProperty('frameArea');
    for (const later of ['focusEvent', 'renderMission']) {
      expect(SHARE_HANDLE_CONTRACT.methods, later).not.toHaveProperty(later);
    }
  });
});
