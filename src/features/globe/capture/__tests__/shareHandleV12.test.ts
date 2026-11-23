/**
 * Share handle v12, as published: `layersFor(category)`, Starcom's layers for
 * one of Mecha Jono's categories (their v9 proposal; layersFor.ts).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v12', () => {
  it('is at version 12', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(12);
  });

  it('declares layersFor, taking a category, and what it returns', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.layersFor).toEqual({ args: 1, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.layersFor).toEqual(['category', 'layers', 'from']);
  });
});
