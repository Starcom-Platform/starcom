/**
 * The time bar's density strip (critique-2026-11-01, OR17, OR25): how many items the layers drawn now hold at each
 * moment of the bar's range, a bin a pixel column, each bin's count split by its layers' kind colours, stacked the
 * commonest first. Read from the drawn marks (drawnMarks.ts), so it counts what is on the globe and nothing else; a
 * mark that keeps no time is not counted.
 */
import { KIND_COLOURS } from '../../../styles/tokens';

export type KindColourName = keyof typeof KIND_COLOURS;

/** Each layer's kind, for its colour on the strip (OR3: colour by kind everywhere). */
export const LAYER_KIND: Readonly<Record<string, KindColourName>> = {
  IntelReports: 'cyber', CyberThreats: 'cyber', Satellites: 'space', CommHubs: 'infra',
  DiplomaticEvents: 'civic', ResourceZones: 'economy', ConflictZones: 'conflict', WarConflict: 'conflict',
  CivilUnrest: 'unrest', ProtestSurges: 'unrest',
  SpaceWeather: 'space', EcologicalDisasters: 'hazards', EarthWeather: 'weather',
  DrugCheckAlerts: 'health', SceneIncidents: 'health', SceneEvents: 'civic', HeatRisk: 'weather', RaverMissions: 'missions', HarmReductionSites: 'health',
  Lifeboats: 'civic', Relief: 'civic', FieldMissions: 'missions', RLSH: 'civic',
  AiIncidents: 'ai', AiFrontier: 'ai', AiWar: 'ai', AiSafety: 'ai',
  OpenMissions: 'missions', CampaignsOperations: 'missions', SafetyWindows: 'missions',
  PsiLines: 'space', PsiField: 'space', PsiZones: 'space', PsiRifts: 'space', PsiWindows: 'space', PsiModel: 'space', MagneticShield: 'space',
};

/**
 * The layer a mark's own name belongs to: the catalogue's label it starts with, the longest that fits. A layer names
 * its marks as it likes ("Conflict Zones — armed conflict"); the catalogue holds its id and its label.
 */
export function layerIdOfName(name: string | null, catalogue: ReadonlyArray<{ id: string; label: string }>): string | null {
  if (!name) return null;
  let best: { id: string; length: number } | null = null;
  for (const { id, label } of catalogue) {
    if (name.startsWith(label) && (!best || label.length > best.length)) best = { id, length: label.length };
  }
  return best?.id ?? null;
}

export interface DensityBin {
  /** Each colour's count, the commonest first. */
  parts: Array<{ colour: string; count: number }>;
  total: number;
}

export interface DensityStrip {
  bins: DensityBin[];
  /** The fullest bin's total: what the strip's height is measured against. */
  max: number;
  /** Items in the range, and items drawn that keep no time. */
  counted: number;
  untimed: number;
}

/** The strip for a range, in `binCount` bins; `colourOf` gives a mark's colour from its layer's name. */
export function densityStrip(
  marks: Iterable<{ timeMs: number | null; layer: string | null }>,
  range: { start: number; end: number },
  binCount: number,
  colourOf: (layer: string | null) => string,
): DensityStrip {
  const n = Math.max(1, Math.floor(binCount));
  const span = range.end - range.start;
  const counts: Array<Map<string, number>> = Array.from({ length: n }, () => new Map());
  let counted = 0;
  let untimed = 0;
  for (const mark of marks) {
    if (mark.timeMs === null) { untimed += 1; continue; }
    if (!(span > 0) || mark.timeMs < range.start || mark.timeMs > range.end) continue;
    const bin = Math.min(n - 1, Math.floor(((mark.timeMs - range.start) / span) * n));
    const colour = colourOf(mark.layer);
    counts[bin].set(colour, (counts[bin].get(colour) ?? 0) + 1);
    counted += 1;
  }
  let max = 0;
  const bins = counts.map((byColour) => {
    const parts = [...byColour.entries()].map(([colour, count]) => ({ colour, count })).sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour));
    const total = parts.reduce((sum, p) => sum + p.count, 0);
    max = Math.max(max, total);
    return { parts, total };
  });
  return { bins, max, counted, untimed };
}
