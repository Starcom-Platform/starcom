/**
 * Share handle v15, as published: the War & Conflict Brief's front page
 * (block I, item 3; decision IM16). A shot's subject can be `{ brief }`, the
 * newest UTC day or a named one, made into a front page by theatre under the
 * conflict_brief template, which is built now.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v15', () => {
  it('is at version 15', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(15);
  });

  it('takes the brief as a shot\'s subject, and builds its template', () => {
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('subject.brief');
    expect(SHARE_HANDLE_CONTRACT.templates.built).toContain('conflict_brief');
    expect(SHARE_HANDLE_CONTRACT.templates.notBuilt).not.toContain('conflict_brief');
  });
});
