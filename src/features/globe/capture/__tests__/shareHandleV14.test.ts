/**
 * Share handle v14, as published: Mecha Jono's card templates (block I, item
 * 3; decisions IM5, IM14, IM15). A shot names its template as `card.template`,
 * `composeFor(address, { template })` makes one item's card with it, and the
 * templates are listed as built or not. A War & Conflict item lists its role,
 * which decides its badge. Discord's 1280×800 is the `embed` preset.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { BUILT_TEMPLATES, CARD_TEMPLATES } from '../cardTemplates';
import { CARD_PRESETS } from '../shareCardLayout';

describe('contract v14', () => {
  it('is at version 14', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(14);
  });

  it('declares composeFor, which returns what compose returns', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.composeFor).toEqual({ args: 2, options: ['template', 'preset', 'scale', 'timeoutMs'] });
    expect(SHARE_HANDLE_CONTRACT.returns.composeFor).toEqual(SHARE_HANDLE_CONTRACT.returns.compose);
  });

  it('lists every template, as built or not built yet, as the code has them', () => {
    // conflict_brief was built in v15.
    expect(SHARE_HANDLE_CONTRACT.templates.built).toEqual(expect.arrayContaining(['critical_intel', 'actionable_intel', 'context_report', 'hazard', 'raver_alert']));
    expect([...SHARE_HANDLE_CONTRACT.templates.built].sort()).toEqual([...BUILT_TEMPLATES].sort());
    expect([...SHARE_HANDLE_CONTRACT.templates.built, ...SHARE_HANDLE_CONTRACT.templates.notBuilt].sort()).toEqual([...CARD_TEMPLATES].sort());
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('card.template');
  });

  it('lists the presets the code has, embed among them', () => {
    expect([...SHARE_HANDLE_CONTRACT.presets].sort()).toEqual(Object.keys(CARD_PRESETS).sort());
    expect(SHARE_HANDLE_CONTRACT.presets).toContain('embed');
  });

  it('lets listReports say an item\'s role', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toContain('role');
  });
});
