import { subModeAvailable } from '../../../../config/buildGates';
import { hasRailSpec } from '../../../../features/globe/rail/railSpecs';

export const PRIMARY_RAIL_MODES = [
  {
    mode: 'CyberCommand' as const,
    glyph: 'mode:CyberCommand' as const,
    // Intel Watch: renamed by the operator on 7 Nov 2026, its old name being a US combatant command's too
    // (scripts/guard-no-institutional-claims.mjs).
    // The mode's id stays CyberCommand: links, saved workspaces and the share handle use it.
    tooltip: 'Intel Watch'
  },
  {
    mode: 'GeoPolitical' as const,
    glyph: 'mode:GeoPolitical' as const,
    tooltip: 'Geo Political'
  },
  {
    mode: 'EcoNatural' as const,
    glyph: 'mode:EcoNatural' as const,
    tooltip: 'Eco Natural'
  },
  {
    mode: 'RaverWatch' as const,
    glyph: 'mode:RaverWatch' as const,
    tooltip: 'Raver Watch'
  },
  {
    mode: 'HeroWatch' as const,
    glyph: 'mode:HeroWatch' as const,
    tooltip: 'Hero Watch'
  },
  {
    mode: 'AIWatch' as const,
    glyph: 'mode:AIWatch' as const,
    tooltip: 'AI Watch'
  },
  {
    mode: 'Missions' as const,
    glyph: 'mode:Missions' as const,
    tooltip: 'Missions'
  },
  {
    mode: 'PsiWatch' as const,
    glyph: 'mode:PsiWatch' as const,
    tooltip: 'Psi Watch'
  }
] as const;

/** The modes the rail shows: Psi Watch only with its switch on (decision D-PW, PW19). */
export function primaryRailModes(psiOn: boolean) {
  return PRIMARY_RAIL_MODES.filter((entry) => entry.mode !== 'PsiWatch' || psiOn);
}

export const SECONDARY_RAIL_MODES = {
  // The commercial build hides a sub-mode drawn only from sources it may not use (D-CS, CS13).
  CyberCommand: [
    { subMode: 'IntelReports' as const, glyph: 'layer:IntelReports' as const, tooltip: 'Intel Reports' },
    { subMode: 'CyberThreats' as const, glyph: 'layer:CyberThreats' as const, tooltip: 'Cyber Threats' },
    { subMode: 'Satellites' as const, glyph: 'layer:Satellites' as const, tooltip: 'Satellites' },
    { subMode: 'CommHubs' as const, glyph: 'layer:CommHubs' as const, tooltip: 'Communication Hubs' }
  ].filter((item) => subModeAvailable(item.subMode)),
  GeoPolitical: [
    { subMode: 'DiplomaticEvents' as const, glyph: 'layer:DiplomaticEvents' as const, tooltip: 'Diplomatic Events' },
    { subMode: 'ResourceZones' as const, glyph: 'layer:ResourceZones' as const, tooltip: 'Resource Zones' },
    { subMode: 'ConflictZones' as const, glyph: 'layer:ConflictZones' as const, tooltip: 'Conflict Zones' },
    { subMode: 'WarConflict' as const, glyph: 'layer:WarConflict' as const, tooltip: 'War & Conflict' },
    // Civil Unrest and Protest surges are one layer with two looks (OR5): the surges are a choice on its rail. The
    // ProtestSurges id stays the handle's and the links' way to the surges look alone.
    { subMode: 'CivilUnrest' as const, glyph: 'layer:CivilUnrest' as const, tooltip: 'Civil Unrest' }
  ],
  EcoNatural: [
    { subMode: 'SpaceWeather' as const, glyph: 'layer:SpaceWeather' as const, tooltip: 'Space Weather' },
    { subMode: 'EcologicalDisasters' as const, glyph: 'layer:EcologicalDisasters' as const, tooltip: 'Ecological Disasters' },
    { subMode: 'EarthWeather' as const, glyph: 'layer:EarthWeather' as const, tooltip: 'Earth Weather' }
  ],
  // The five that draw: Raver missions are Hero Watch's harm-reduction field missions (D-HW, HW8). Sites wait on a source.
  RaverWatch: [
    { subMode: 'DrugCheckAlerts' as const, glyph: 'layer:DrugCheckAlerts' as const, tooltip: 'Drug-check alerts' },
    { subMode: 'SceneIncidents' as const, glyph: 'layer:SceneIncidents' as const, tooltip: 'Scene incidents' },
    { subMode: 'SceneEvents' as const, glyph: 'layer:SceneEvents' as const, tooltip: 'Scene events' },
    { subMode: 'HeatRisk' as const, glyph: 'layer:HeatRisk' as const, tooltip: 'Heat risk' },
    { subMode: 'RaverMissions' as const, glyph: 'layer:RaverMissions' as const, tooltip: 'Raver missions' }
  ],
  // Hero Watch's four sections (D-HW, HW3).
  HeroWatch: [
    { subMode: 'Lifeboats' as const, glyph: 'layer:Lifeboats' as const, tooltip: 'Lifeboats' },
    { subMode: 'Relief' as const, glyph: 'layer:Relief' as const, tooltip: 'Relief' },
    { subMode: 'FieldMissions' as const, glyph: 'layer:FieldMissions' as const, tooltip: 'Field missions' },
    { subMode: 'RLSH' as const, glyph: 'layer:RLSH' as const, tooltip: 'RLSH Super Heroes' }
  ],
  // AI Watch's four sections, by area (D-AW, AW2).
  AIWatch: [
    { subMode: 'AiIncidents' as const, glyph: 'layer:AiIncidents' as const, tooltip: 'Incidents' },
    { subMode: 'AiFrontier' as const, glyph: 'layer:AiFrontier' as const, tooltip: 'Frontier AI' },
    { subMode: 'AiWar' as const, glyph: 'layer:AiWar' as const, tooltip: 'AI in war' },
    { subMode: 'AiSafety' as const, glyph: 'layer:AiSafety' as const, tooltip: 'Safety & security' }
  ],
  // Missions (D-MF, step 5): the open missions, at their places, and those done from anywhere.
  Missions: [
    { subMode: 'OpenMissions' as const, glyph: 'layer:OpenMissions' as const, tooltip: 'Open missions' },
    { subMode: 'CampaignsOperations' as const, glyph: 'layer:CampaignsOperations' as const, tooltip: 'Campaigns and operations' },
    { subMode: 'SafetyWindows' as const, glyph: 'layer:SafetyWindows' as const, tooltip: 'Safety windows' }
  ],
  // Psi Watch's seven layers (D-PW, PW9): the kit's five by their ids, then Starcom's ψ field and magnetic shield.
  PsiWatch: [
    { subMode: 'PsiLines' as const, glyph: 'layer:PsiLines' as const, tooltip: 'Planet lines' },
    { subMode: 'PsiField' as const, glyph: 'layer:PsiField' as const, tooltip: 'Field readings' },
    { subMode: 'PsiZones' as const, glyph: 'layer:PsiZones' as const, tooltip: 'Tested places' },
    { subMode: 'PsiRifts' as const, glyph: 'layer:PsiRifts' as const, tooltip: 'Psi Alerts' },
    { subMode: 'PsiWindows' as const, glyph: 'layer:PsiWindows' as const, tooltip: 'Windows' },
    { subMode: 'PsiModel' as const, glyph: 'layer:PsiModel' as const, tooltip: 'ψ field' },
    { subMode: 'MagneticShield' as const, glyph: 'layer:MagneticShield' as const, tooltip: 'Magnetic shield' }
  ]
} as const;

/**
 * Whether the left sub rail has anything to show: its settings buttons and
 * toggles. One gate, for the rail and for the layout that makes room for it.
 * Two copies were kept in step by hand, and the Intel Reports settings (BA4)
 * were added to one and not the other, so the layout never mounted the button.
 */
export function leftSubRailShown(mode: { mode: string; subMode: string }, isSpaceWeatherActive: boolean): boolean {
  return (mode.mode === 'EcoNatural' && mode.subMode === 'SpaceWeather' && isSpaceWeatherActive)
    || (mode.mode === 'CyberCommand' && mode.subMode === 'IntelReports')
    || (mode.mode === 'HeroWatch' && mode.subMode === 'RLSH')
    || (mode.mode === 'EcoNatural' && (mode.subMode === 'EarthWeather' || mode.subMode === 'EcologicalDisasters'))
    // Every sub-mode with kits on the rail (critique-2026-11-01, OR1; plan A2).
    || hasRailSpec(mode.subMode);
}
