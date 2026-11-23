/**
 * Starcom's layers for Mecha Jono's categories (`layersFor`, contract v12;
 * their v9 proposal: "vocabulary.json suggests; you decide").
 *
 * Their vocabulary suggests layers for each `group.kind`; this is Starcom's
 * answer. It follows theirs except where Starcom draws the item elsewhere:
 * their conflict items draw on War & Conflict, not on Conflict Zones (GDELT's),
 * since 2 October. A category with no place (declassified records, patents)
 * has no layer. A kind it does not know falls back to its group, as their
 * vocabulary says a reader should, and a group it does not know to Intel
 * Reports. Only layers this build draws are named, and RLSH never.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { layersFor } from '../layersFor';

const DRAWN = ['IntelReports', 'CyberThreats', 'CommHubs', 'EcologicalDisasters', 'EarthWeather', 'WarConflict', 'ConflictZones',
  'DiplomaticEvents', 'DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'Lifeboats', 'Relief', 'FieldMissions', 'RaverMissions'];
const at = (category: string, drawn = DRAWN) => layersFor(category, drawn);

describe('layersFor', () => {
  it('draws their war and conflict items on War & Conflict, whatever their kind', () => {
    for (const kind of ['events', 'airspace', 'nuclear_safety', 'security_council', 'travel_advice', 'wars']) {
      expect(at(`conflict.${kind}`), kind).toEqual({ category: `conflict.${kind}`, layers: ['WarConflict'], from: 'group' });
    }
  });

  it('gives a kind its own layers where they differ from its group\'s', () => {
    expect(at('scene.event')).toEqual({ category: 'scene.event', layers: ['SceneEvents'], from: 'kind' });
    expect(at('scene.safety')).toEqual({ category: 'scene.safety', layers: ['SceneIncidents', 'SceneEvents', 'HeatRisk'], from: 'kind' });
    expect(at('outreach.heat').layers).toEqual(['HeatRisk', 'EarthWeather', 'FieldMissions']);
    expect(at('drugs.checking').layers).toEqual(['DrugCheckAlerts']);
  });

  // Interchange 3.7 (11 October): Hero Watch's records on its layers, and every field mission on Field missions.
  it('draws Hero Watch\'s organisations on Lifeboats and Relief, and field missions where Hero Watch draws them', () => {
    expect(at('heroes.organisations')).toEqual({ category: 'heroes.organisations', layers: ['Lifeboats', 'Relief'], from: 'group' });
    expect(at('relief.disaster').layers).toEqual(['EcologicalDisasters', 'EarthWeather', 'FieldMissions']);
    expect(at('outreach.cold').layers).toEqual(['EarthWeather', 'FieldMissions']);
    // Harm reduction, in both modes (HW8). Naloxone missions are packages, never intel reports, so not Intel Reports.
    expect(at('outreach.naloxone').layers).toEqual(['FieldMissions', 'RaverMissions']);
    expect(at('events.harm_reduction').layers).toEqual(['SceneEvents', 'DrugCheckAlerts', 'HeatRisk', 'FieldMissions', 'RaverMissions']);
    expect(at('awareness.scams').layers).toEqual(['IntelReports', 'FieldMissions']);
    expect(at('intel.situation_picture').layers).toEqual(['IntelReports', 'FieldMissions']);
    for (const category of ['awareness.refunds', 'civic.public_comment', 'cyber.malware_takedown', 'support.partner_vetting']) {
      expect(at(category).layers, category).toEqual(['FieldMissions']);
    }
  });

  it('falls back to its group for a kind it does not know, and to Intel Reports for a group it does not know', () => {
    expect(at('hazard.meteor')).toEqual({ category: 'hazard.meteor', layers: ['EcologicalDisasters', 'EarthWeather'], from: 'group' });
    expect(at('mystery.thing')).toEqual({ category: 'mystery.thing', layers: ['IntelReports'], from: 'default' });
  });

  it('gives no layer to what has no place', () => {
    // Field missions with no place are listed in Hero Watch's panel, under Field missions (Interchange 3.7), so only these have none.
    for (const category of ['declassified.archive', 'patents.government']) {
      expect(at(category).layers, category).toEqual([]);
    }
  });

  it('names only layers this build draws', () => {
    expect(at('scene.safety', ['SceneEvents']).layers).toEqual(['SceneEvents']);
    expect(at('hazard.storm', []).layers).toEqual([]);
  });

  it('reads a group alone as that group', () => {
    expect(at('hazard')).toEqual({ category: 'hazard', layers: ['EcologicalDisasters', 'EarthWeather'], from: 'group' });
  });

  it('refuses what is not a category', () => {
    for (const bad of ['', 'Conflict.Events', 'conflict events', 'a.b.c', 3 as unknown as string]) {
      expect(() => layersFor(bad, DRAWN), String(bad)).toThrow(/group\.kind/);
    }
  });
});

describe('layersFor psi (D-PW, PW62; the kit\'s schemas_psi §3.6)', () => {
  const PSI_ON = ['IntelReports', 'PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows'];

  it('puts each psi family on the layer that draws it, and a call on none', () => {
    expect(layersFor('psi.sky_event', PSI_ON)).toEqual({ category: 'psi.sky_event', layers: ['PsiLines'], from: 'kind' });
    expect(layersFor('psi.window', PSI_ON).layers).toEqual(['PsiWindows', 'PsiLines']);
    expect(layersFor('psi.alert', PSI_ON).layers).toEqual(['PsiRifts']);
    expect(layersFor('psi.field', PSI_ON).layers).toEqual(['PsiField']);
    expect(layersFor('psi.scry_result', PSI_ON).layers).toEqual(['PsiZones']);
    expect(layersFor('psi.call', PSI_ON).layers).toEqual([]);
    expect(layersFor('psi.echo', PSI_ON)).toEqual({ category: 'psi.echo', layers: ['PsiWindows', 'PsiLines'], from: 'group' });
  });

  it('names none while Psi Watch is off, its layers not drawn', () => {
    expect(layersFor('psi.window', ['IntelReports']).layers).toEqual([]);
  });
});
