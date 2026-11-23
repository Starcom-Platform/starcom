/**
 * Mecha Jono's card templates, in our tokens (decision IM5), and who decides a
 * card's badge (IM14): the item where it says what it is, else the shot.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  CARD_TEMPLATES,
  TEMPLATE_SPECS,
  BUILT_TEMPLATES,
  decideTemplate,
  templateOfItem,
} from '../cardTemplates';
import { DATA_SCALES, SEMANTIC, GUNMETAL } from '../../../../styles/tokens';
import { RAVER_WATCH_REGION_COLOR } from '../../../../components/Globe/raverWatchSprites';

const warItem = (role?: 'critical' | 'actionable' | 'context') => ({ layer: 'WarConflict' as const, ...(role ? { role } : {}) });
const report = { layer: 'IntelReports' as const };
const rave = { layer: 'SceneEvents' as const };

describe('the templates', () => {
  it('are Mecha Jono\'s nine and their kit\'s psi card, by their names', () => {
    expect([...CARD_TEMPLATES].sort()).toEqual([
      'actionable_intel', 'conflict_brief', 'context_report', 'critical_intel', 'declassified',
      'field_mission', 'hazard', 'mission_package', 'psi', 'raver_alert',
    ]);
  });

  it('gives a psi card the one Experimental badge, in Psi Watch\'s aqua, about a front page (D-PW, PW34, PW62)', () => {
    expect(TEMPLATE_SPECS.psi).toEqual({ badge: { text: 'EXPERIMENTAL', tone: DATA_SCALES.psiWatch, ink: expect.any(String), glyph: null }, about: 'front-page' });
  });

  it('badge in colours that already mean those things, and no new hue (IM5)', () => {
    expect(TEMPLATE_SPECS.critical_intel.badge).toMatchObject({ text: 'CRITICAL INTEL', tone: SEMANTIC.danger });
    expect(TEMPLATE_SPECS.actionable_intel.badge).toMatchObject({ text: 'ACTIONABLE INTEL', tone: SEMANTIC.caution });
    expect(TEMPLATE_SPECS.raver_alert.badge).toMatchObject({ text: 'RAVER WATCH', tone: RAVER_WATCH_REGION_COLOR });
    expect(TEMPLATE_SPECS.context_report.badge).toBeNull();
    expect(TEMPLATE_SPECS.hazard.badge).toBeNull();
  });

  it('puts the gunmetal badges\' meaning in a glyph and a word, since their colour cannot carry it', () => {
    const gunmetal = Object.values(GUNMETAL) as string[];
    for (const name of CARD_TEMPLATES) {
      const badge = TEMPLATE_SPECS[name].badge;
      if (badge && gunmetal.includes(badge.tone)) expect(badge.glyph, name).toBeTruthy();
    }
  });

  it('says why each one not built yet cannot be made', () => {
    expect(TEMPLATE_SPECS.mission_package.notBuilt).toMatch(/renderMission/);
    // Built with Hero Watch's field missions (D-HW, HW10-HW11), and the declassified desk's day (plan H9).
    expect(BUILT_TEMPLATES).toContain('field_mission');
    expect(BUILT_TEMPLATES).toContain('declassified');
    expect(BUILT_TEMPLATES).not.toContain('mission_package');
    expect(BUILT_TEMPLATES).toContain('critical_intel');
  });
});

describe('what an item says it is', () => {
  it('a War & Conflict item by its role', () => {
    expect(templateOfItem(warItem('critical'))).toBe('critical_intel');
    expect(templateOfItem(warItem('actionable'))).toBe('actionable_intel');
    expect(templateOfItem(warItem('context'))).toBe('context_report');
    expect(templateOfItem(warItem())).toBeNull();
  });

  it('a Raver Watch item as Raver Watch, and an Intel Report as nothing yet', () => {
    expect(templateOfItem(rave)).toBe('raver_alert');
    expect(templateOfItem({ layer: 'HeatRisk' })).toBe('raver_alert');
    expect(templateOfItem(report)).toBeNull();
    expect(templateOfItem(null)).toBeNull();
  });
});

describe('who decides the badge (IM14)', () => {
  it('the item, when the shot names no template', () => {
    expect(decideTemplate(undefined, warItem('critical'))).toEqual({
      ok: true, template: 'critical_intel', badge: TEMPLATE_SPECS.critical_intel.badge, chosenBy: 'item',
    });
    expect(decideTemplate(undefined, rave)).toMatchObject({ ok: true, template: 'raver_alert', chosenBy: 'item' });
  });

  it('nobody, when neither says: the default card, as before', () => {
    expect(decideTemplate(undefined, report)).toEqual({ ok: true, template: null, badge: null, chosenBy: null });
    expect(decideTemplate(undefined, null)).toEqual({ ok: true, template: null, badge: null, chosenBy: null });
  });

  it('the item, when the shot agrees with it', () => {
    expect(decideTemplate('actionable_intel', warItem('actionable'))).toMatchObject({ ok: true, template: 'actionable_intel', chosenBy: 'item' });
  });

  it('refuses a shot that disagrees with what the item says it is, and says why', () => {
    const r = decideTemplate('critical_intel', warItem('context'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/role is context.*context_report/);
    const rr = decideTemplate('critical_intel', rave);
    expect(rr.ok).toBe(false);
    if (!rr.ok) expect(rr.reason).toMatch(/Raver Watch.*raver_alert/);
  });

  it('the shot, where the item does not say, and the card says the shot chose it', () => {
    expect(decideTemplate('critical_intel', report)).toEqual({
      ok: true, template: 'critical_intel', badge: TEMPLATE_SPECS.critical_intel.badge, chosenBy: 'shot',
    });
    expect(decideTemplate('hazard', null)).toEqual({ ok: true, template: 'hazard', badge: null, chosenBy: 'shot' });
  });

  it('refuses Raver Watch\'s badge on what is not Raver Watch', () => {
    const r = decideTemplate('raver_alert', report);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Raver Watch item/);
  });

  it('refuses a badge about an item on a card that features none', () => {
    for (const name of ['critical_intel', 'actionable_intel', 'context_report', 'raver_alert'] as const) {
      const r = decideTemplate(name, null);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.reason, name).toMatch(/features none/);
    }
  });

  it('refuses one not built yet, with its reason', () => {
    const r = decideTemplate('mission_package', report);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(TEMPLATE_SPECS.mission_package.notBuilt);
  });

  it('makes declassified a front page, its badge on gunmetal with a glyph, chosen by its subject (plan H9)', () => {
    expect(TEMPLATE_SPECS.declassified).toMatchObject({ about: 'front-page', badge: { text: 'DECLASSIFIED', glyph: 'report' } });
    expect(decideTemplate('declassified', null)).toMatchObject({ ok: true, template: 'declassified', chosenBy: 'subject' });
    const featured = decideTemplate('declassified', report);
    expect(featured.ok).toBe(false);
    if (!featured.ok) expect(featured.reason).toMatch(/front page/);
  });
});

describe('a Hero Watch field mission\'s card (D-HW, HW10-HW11)', () => {
  it('is field_mission, its badge FIELD MISSION in rescue orange, whichever layer draws it', () => {
    expect(templateOfItem({ layer: 'FieldMissions' })).toBe('field_mission');
    expect(templateOfItem({ layer: 'RaverMissions' })).toBe('field_mission');
    expect(TEMPLATE_SPECS.field_mission.badge).toEqual({ text: 'FIELD MISSION', tone: DATA_SCALES.heroWatch, ink: GUNMETAL[950], glyph: null });
    expect(decideTemplate(undefined, { layer: 'FieldMissions' })).toMatchObject({ ok: true, template: 'field_mission', chosenBy: 'item' });
  });

  it('is refused for an item that is not a field mission, and another badge for one that is', () => {
    const r = decideTemplate('field_mission', report);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/field_mission is for a Hero Watch field mission/);
    const other = decideTemplate('critical_intel', { layer: 'FieldMissions' });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.reason).toBe('This item is a Hero Watch field mission: its card is field_mission, not critical_intel.');
  });

  it('leaves relief and lifeboats without a badge: Mecha Jono\'s templates have none for them', () => {
    expect(templateOfItem({ layer: 'Relief' })).toBeNull();
    expect(templateOfItem({ layer: 'Lifeboats' })).toBeNull();
  });
});
