/**
 * The magnetopause and bow shock for the moment shown (space-weather-visualization.md, SW30, SW31): the engine
 * draws them for the wind it is given while the timeline is paused, drawn fainter where that wind is a model or a
 * stand-in, and for the latest it reads itself once given none.
 */
import { describe, it, expect, vi } from 'vitest';
import { GlobeEngine } from '../GlobeEngine';
import type { BowShockPayload, MagnetopausePayload } from '../../services/SpaceWeatherModeling';
import type { BoundaryWind } from '../../services/spaceWeather/boundaryWind';

vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveSolarWindSnapshot: async () => ({
    snapshot: { speedKmPerSec: 400, densityPerCm3: 5, bz: -1, timestamp: new Date().toISOString() }, quality: 'live',
  }),
  fetchLiveKpSnapshot: async () => ({ snapshot: { kp: 2, timestamp: new Date().toISOString() }, quality: 'live' }),
}));

const MEASURED: BoundaryWind = {
  snapshot: { speedKmPerSec: 400, densityPerCm3: 5, bz: -1, timestamp: '2026-10-20T00:00:00.000Z' },
  kind: 'measured', measuredAt: Date.UTC(2026, 9, 20), pushedBy: null,
};
const PUSHED: BoundaryWind = {
  snapshot: { speedKmPerSec: 900, densityPerCm3: 20, bz: -1, timestamp: '2026-10-27T00:00:00.000Z' },
  kind: 'last-measured', measuredAt: Date.UTC(2026, 9, 25),
  pushedBy: { cmeId: 'c', arrivedAt: Date.UTC(2026, 9, 27), glancing: false, speed: 900, compression: 4 },
};

describe('the boundaries for the moment shown', () => {
  it('stand off from the wind given, fainter where it is modelled, and from the latest once given none', async () => {
    const engine = new GlobeEngine({ mode: 'EcoNatural', overlays: ['spaceWeather', 'spaceWeatherMagnetopause', 'spaceWeatherBowShock'] });
    const magnetopause = () => engine.getOverlayData('spaceWeatherMagnetopause') as MagnetopausePayload | undefined;
    const bowShock = () => engine.getOverlayData('spaceWeatherBowShock') as BowShockPayload | undefined;
    await vi.waitFor(() => expect(magnetopause()).toBeDefined());
    const live = magnetopause()!.standoffRe;

    engine.setBoundaryWind(MEASURED);
    expect(magnetopause()!.quality).toBe('live');
    expect(magnetopause()!.meta).toMatchObject({ wind: { kind: 'measured', measuredAt: MEASURED.measuredAt, pushedBy: null } });
    expect(magnetopause()!.standoffRe).toBeCloseTo(live, 9);

    engine.setBoundaryWind(PUSHED);
    expect(magnetopause()!.standoffRe).toBeLessThan(live - 2);
    expect(magnetopause()!.quality).toBe('fallback');
    expect(bowShock()!.quality).toBe('fallback');
    expect(bowShock()!.radiusRe).toBeGreaterThan(magnetopause()!.standoffRe);

    engine.setBoundaryWind(null);
    expect(magnetopause()!.standoffRe).toBeCloseTo(live, 9);
    expect((magnetopause()!.meta as Record<string, unknown>).wind).toBeUndefined();
    engine.dispose();
  });
});
