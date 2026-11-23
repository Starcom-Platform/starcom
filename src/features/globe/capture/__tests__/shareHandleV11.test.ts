/**
 * Share handle v11, as published: the shot (decision IM1; globe record,
 * section 21). `planShot` stages a shot and says what is in frame without
 * composing; `renderShot` makes its card, whose provenance carries the shot
 * (capture schema 11). The contract names every field a shot may carry, as
 * built or not built yet, so a caller can see what a shot will honour before
 * it sends one.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CAPTURE_SCHEMA_VERSION } from '../shareCardProvenance';
import { SHOT_FIELDS, SHOT_VERSION } from '../shotSpec';

describe('contract v11', () => {
  it('is at version 11 or later, with cards at capture schema 11', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(11);
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(11);
  });

  it('declares planShot and renderShot, each taking a shot and a timeout', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.planShot).toEqual({ args: 2, options: ['timeoutMs'] });
    expect(SHARE_HANDLE_CONTRACT.methods.renderShot).toEqual({ args: 2, options: ['timeoutMs'] });
    expect(SHARE_HANDLE_CONTRACT.returns.planShot).toEqual(['ok', 'shot', 'notes', 'warnings', 'inFrame', 'estimatedComposeMs', 'reason']);
    expect(SHARE_HANDLE_CONTRACT.returns.renderShot).toEqual(['ok', 'card', 'shot', 'notes', 'warnings', 'timing', 'reason']);
  });

  it('lets a batch return each card\'s shot, its notes and its timing', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.renderBatch).toEqual(['ok', 'card', 'reason', 'note', 'notes', 'shot', 'timing']);
  });

  // Typed out in the contract, not imported: the contract is read by a build script with no browser.
  it('publishes the shot\'s fields as the reader of shots knows them', () => {
    expect(SHARE_HANDLE_CONTRACT.shot).toEqual({ version: SHOT_VERSION, built: [...SHOT_FIELDS.built], notBuilt: [...SHOT_FIELDS.notBuilt] });
  });
});
