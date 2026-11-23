/**
 * What of the aurora is drawn (space-weather-visualization.md, SW2, SW3): OVATION's band with the
 * night curtain, the band alone, or none. One list for every place that offers the choice.
 */
export type AuroraDrawn = 'curtain' | 'band' | 'off';

export const AURORA_DRAWN: ReadonlyArray<{ drawn: AuroraDrawn; label: string; title: string; settings: { showAuroralOval: boolean; auroraCurtain?: boolean } }> = [
  { drawn: 'curtain', label: 'Curtain', title: 'OVATION\'s band, and a curtain of light rising from it on the night side', settings: { showAuroralOval: true, auroraCurtain: true } },
  { drawn: 'band', label: 'Band', title: 'OVATION\'s band alone', settings: { showAuroralOval: true, auroraCurtain: false } },
  { drawn: 'off', label: 'Off', title: 'No aurora', settings: { showAuroralOval: false } },
];

/** Which is drawn by these settings: a curtain unless it was turned off, as one saved before there was a choice. */
export function auroraDrawnOf(settings: { showAuroralOval?: boolean; auroraCurtain?: boolean }): AuroraDrawn {
  if (settings.showAuroralOval !== true) return 'off';
  return settings.auroraCurtain === false ? 'band' : 'curtain';
}
