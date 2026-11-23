/**
 * What of the magnetosphere's field lines is drawn (space-weather-visualization.md, SW2, SW4): many,
 * few, or none. One list for every place that offers the choice.
 */
export type FieldLinesDrawn = 'many' | 'few' | 'off';

export const FIELD_LINES_DRAWN: ReadonlyArray<{ drawn: FieldLinesDrawn; label: string; title: string; settings: { showFieldLines: boolean; fieldLineDensity?: 'many' | 'few' } }> = [
  { drawn: 'many', label: 'Many', title: 'About 130 lines, every 3° of magnetic latitude and 2 hours of local time', settings: { showFieldLines: true, fieldLineDensity: 'many' } },
  { drawn: 'few', label: 'Few', title: 'About 40 lines, lighter to trace', settings: { showFieldLines: true, fieldLineDensity: 'few' } },
  { drawn: 'off', label: 'Off', title: 'No field lines', settings: { showFieldLines: false } },
];

/** Which is drawn by these settings: many unless said otherwise, as by settings saved before there was a choice. */
export function fieldLinesDrawnOf(settings: { showFieldLines?: boolean; fieldLineDensity?: 'many' | 'few' }): FieldLinesDrawn {
  if (settings.showFieldLines === false) return 'off';
  return settings.fieldLineDensity === 'few' ? 'few' : 'many';
}
