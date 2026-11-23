/**
 * An engine that is replaced must actually stop.
 *
 * ─── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * GlobeEngine had no dispose() at all. Globe.tsx built a new engine on every
 * layer switch — its effect depended on `subMode`, though the planet's skin
 * depends only on the mode — and the effect's cleanup cleared its timers and
 * never touched the engine it had made. Measured on 2026-09-25: twenty-one
 * layer switches constructed twenty-four engines.
 *
 * Each one registers pollers under a key unique to its own instance, so
 * nothing but that instance could stop them. VisualizationModeContext stops
 * every poller scoped to the OLD MODE when the mode changes, which bounds the
 * damage — but a switch within one mode (Space Weather to Earth Weather and
 * back) left the previous engine's space-weather poller registered, along with
 * its material and overlay objects, until the mode changed.
 *
 * Measured honestly, the network cost of that was nil in practice — one NOAA
 * fetch across twenty-one switches, because something downstream dedupes. The
 * cost that was real is the engine churn itself: a new material per switch, and
 * a globe that was mid-rebuild whenever a capture asked for a frame.
 */
import { describe, it, expect, vi } from 'vitest';
import { GlobeEngine } from '../GlobeEngine';
import { pollerRegistry } from '../../services/pollerRegistry';

const solarWind = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveSolarWindSnapshot: async () => { solarWind.calls += 1; return { snapshot: null, quality: 'unavailable' }; },
  fetchLiveKpSnapshot: async () => ({ snapshot: null, quality: 'unavailable' }),
}));

const spaceWeatherPollers = () =>
  pollerRegistry.debugDump().filter((p) => p.key.endsWith('-space-weather'));

describe('GlobeEngine.dispose', () => {
  it('stops the space-weather poller the engine registered', async () => {
    const before = spaceWeatherPollers().length;
    const engine = new GlobeEngine({ mode: 'EcoNatural', overlays: ['spaceWeather'] });
    await vi.waitFor(() => expect(spaceWeatherPollers().length).toBe(before + 1));

    engine.dispose();

    // The key is unique to this instance; if dispose does not stop it, nothing
    // else in the application can.
    expect(spaceWeatherPollers().length).toBe(before);
  });

  it('does not let an init still in flight bring a disposed engine back', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    // init() is async and loads textures; dispose lands before it finishes.
    engine.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // A material built after disposal would be handed to react-globe.gl by a
    // component that has already moved on — a leak that looks like a render.
    expect(engine.getMaterial()).toBeNull();
  });

  it('stops calling handlers once disposed', () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    const handler = vi.fn();
    engine.on('overlayRemoved', handler);

    engine.dispose();
    engine.removeOverlay('alerts');

    expect(handler).not.toHaveBeenCalled();
  });

  it('is safe to call twice', () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });
});

/**
 * Starting what is already running must not restart it.
 *
 * Globe.tsx now adds the five space-weather overlays to a living engine one by
 * one. Each add called startSpaceWeatherUpdates, which stopped and
 * re-registered the poller with `immediate: true` — so one layer selection
 * polled five times at once, and NOAA saw five requests where there should be
 * one. Measured live before this: 6 solar-wind requests across a sweep that
 * previously made 1.
 */
describe('space-weather polling', () => {
  it('polls once when all five space-weather overlays are added', async () => {
    const engine = new GlobeEngine({ mode: 'EcoNatural' });
    solarWind.calls = 0;
    for (const o of ['spaceWeather', 'spaceWeatherMagnetopause', 'spaceWeatherBowShock',
      'spaceWeatherAurora', 'spaceWeatherGeomagneticIndex']) {
      engine.addOverlay(o);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(solarWind.calls).toBe(1);
    engine.dispose();
  });

  it('polls again after the overlays are removed and re-added', async () => {
    // Idempotent start must not become "never restarts": leaving the layer
    // stops the poller, and coming back is a new selection.
    const engine = new GlobeEngine({ mode: 'EcoNatural' });
    engine.addOverlay('spaceWeather');
    await new Promise((resolve) => setTimeout(resolve, 50));
    engine.removeOverlay('spaceWeather');
    solarWind.calls = 0;
    engine.addOverlay('spaceWeather');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(solarWind.calls).toBe(1);
    engine.dispose();
  });
});

describe('the space-weather poller is armed once per selection', () => {
  it('is not re-armed when init finishes after the overlays were added', async () => {
    // The sequence Globe.tsx produces: the engine is constructed, the
    // overlay-sync effect adds the space-weather overlays straight away, and
    // init() — still awaiting textures — finishes afterwards, sees them, and
    // starts the poller again. Without an idempotent start that second start
    // tore the running poller down and re-armed it, with an immediate poll.
    //
    // A first version of this test counted registrations synchronously and
    // passed with the guard deleted: init had not finished yet, so the case it
    // exists for never happened. Hence the wait.
    const register = vi.spyOn(pollerRegistry, 'register');
    const engine = new GlobeEngine({ mode: 'EcoNatural' });
    for (const o of ['spaceWeather', 'spaceWeatherMagnetopause', 'spaceWeatherBowShock',
      'spaceWeatherAurora', 'spaceWeatherGeomagneticIndex']) {
      engine.addOverlay(o);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const spaceWeatherRegistrations = register.mock.calls.filter(([key]) => String(key).endsWith('-space-weather'));
    expect(spaceWeatherRegistrations).toHaveLength(1);
    register.mockRestore();
    engine.dispose();
  });
});
