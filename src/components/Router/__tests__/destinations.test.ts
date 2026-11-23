/**
 * One list of where a person can go (plan item 4.6, decision D5). The bottom
 * bar kept its own copy of every application, with its own names, icons and
 * descriptions; the router's said the globe was "CyberCommand" and the bar's
 * that OpsCenter was "project management". Missions, the pipeline's own stage,
 * had no way in but OpsCenter's tab row; then it was listed beside OpsCenter,
 * one app twice. Now the app is named Missions and listed once (K1).
 */
import { describe, it, expect } from 'vitest';
import { APPLICATIONS, DESTINATIONS } from '../EnhancedApplicationRouter';

describe('DESTINATIONS', () => {
  it('holds every application once, as the registry names and describes it', () => {
    for (const app of APPLICATIONS) {
      const d = DESTINATIONS.filter((x) => x.key === app.id);
      expect(d, app.id).toHaveLength(1);
      expect(d[0]).toMatchObject({ app: app.id, label: app.name, glyph: app.glyph, description: app.description });
      expect(d[0].context).toBeUndefined();
    }
  });

  it('lists Missions once, as the app itself, and OpsCenter not at all (K1)', () => {
    expect(DESTINATIONS).toHaveLength(APPLICATIONS.length);
    const missions = DESTINATIONS.filter((d) => d.app === 'teamworkspace');
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({ label: 'Missions' });
    expect(missions[0].context).toBeUndefined();
    expect(DESTINATIONS.some((d) => /OpsCenter/i.test(d.label))).toBe(false);
  });

  it('names the globe as the bar does, and describes each app by what is in it', () => {
    const byKey = Object.fromEntries(DESTINATIONS.map((d) => [d.key, d]));
    expect(byKey.cybercommand.label).toBe('Globe');
    expect(byKey.teamworkspace.description).not.toMatch(/project management/i);
    expect(byKey.teamworkspace.description).toMatch(/^Assemble missions/);
    expect(byKey.marketexchange.description).toMatch(/Publish a report/);
    expect(byKey.marketexchange.description).not.toMatch(/market intelligence|economic/i);
    for (const d of DESTINATIONS) expect(d.label && d.glyph && d.description, d.key).toBeTruthy();
  });
});
