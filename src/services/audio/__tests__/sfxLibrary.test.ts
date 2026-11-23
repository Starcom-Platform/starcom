import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  playSfx, preloadSfx, clearSfx, setSoundOn, setSoundCategoryOn, SFX, SFX_FILES, SFX_GAIN, CATEGORY_SAMPLE,
  type SfxMoment,
} from '../sfxLibrary';
import { getSoundSettings, resetSoundSettingsForTests, setSoundSettings } from '../soundSettings';
import { audioContextManager } from '../audioContextManager';
import { setAudioTelemetryHandler, clearAudioTelemetryHandler, type AudioTelemetryEvent } from '../audioTelemetry';

class FakeGainNode {
  gain = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn(() => {
    queueMicrotask(() => this.onended?.());
  });
}

const sources: FakeBufferSource[] = [];
const gains: FakeGainNode[] = [];
/** The state a new context starts in: a page before its first gesture holds it suspended. */
let startState: AudioContextState = 'running';

class FakeAudioContext {
  sampleRate = 48000;
  currentTime = 0;
  state: AudioContextState = startState;
  destination = {} as AudioDestinationNode;
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => ({ length: data.byteLength }) as unknown as AudioBuffer);
  createGain(): FakeGainNode {
    const g = new FakeGainNode();
    gains.push(g);
    return g;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    sources.push(s);
    return s;
  }
  close = vi.fn(async () => {});
  // Held until a gesture, as a browser holds it: the promise never settles here.
  resume = vi.fn(() => (this.state === 'running' ? Promise.resolve() : new Promise<void>(() => {})));
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** The moments that played, by the files their sources were given, in order. */
const playedFiles = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  sources.map((s) => {
    const index = (s.buffer as unknown as { length: number }).length;
    return String(fetchMock.mock.calls[index]?.[0] ?? index);
  });

describe('sfxLibrary', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let fetched: string[];

  beforeEach(async () => {
    (globalThis as typeof globalThis & { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
    fetched = [];
    // Each file decodes to a "buffer" whose length is its fetch's index, so a source says which file it plays.
    fetchMock = vi.fn(async (url: string) => {
      fetched.push(url);
      const index = fetched.length - 1;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(index) };
    });
    vi.stubGlobal('fetch', fetchMock);
    sources.length = 0;
    gains.length = 0;
    startState = 'running';
    localStorage.clear();
    resetSoundSettingsForTests();
    setSoundSettings({ enabled: true, volume: 1 });
    clearSfx();
    clearAudioTelemetryHandler();
    await audioContextManager.forceClose();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    clearSfx();
    clearAudioTelemetryHandler();
    await audioContextManager.forceClose();
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  it('plays nothing, fetches nothing and falls back to nothing while sound is off', async () => {
    setSoundSettings({ enabled: false });
    const fallback = vi.fn();
    playSfx('alert', fallback);
    playSfx('click');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('plays nothing of a kind the visitor turned off, and the other kinds still play', async () => {
    setSoundSettings({ categories: { hover: false } });
    playSfx('hover');
    await settle();
    expect(sources).toHaveLength(0);
    playSfx('click');
    await settle();
    expect(sources).toHaveLength(1);
  });

  it("plays the moment's file at its gain times the volume, and fetches it only once", async () => {
    setSoundSettings({ volume: 0.5 });
    const fallback = vi.fn();
    playSfx('hover', fallback);
    await settle();
    await wait(SFX.hover.gapMs + 20);
    playSfx('hover', fallback);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SFX_FILES.hover);
    expect(sources).toHaveLength(2);
    expect(sources[0].start).toHaveBeenCalled();
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(SFX_GAIN.hover * 0.5, 0);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('plays one sound for one action: the one that says the most', async () => {
    // A click that opens a panel, in one task.
    playSfx('click');
    playSfx('open');
    playSfx('hover');
    await settle();
    expect(sources).toHaveLength(1);
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES.open]);
  });

  it('drops a weaker sound just after a stronger one, and plays a stronger one at once', async () => {
    playSfx('designate');
    await settle();
    // The country's panel opens a frame later.
    playSfx('open');
    await settle();
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES.designate]);
    playSfx('alert');
    await settle();
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES.designate, SFX_FILES.alert]);
  });

  it('plays a moment again only after its gap', async () => {
    playSfx('click');
    await settle();
    playSfx('click');
    await settle();
    expect(sources).toHaveLength(1);
    await wait(SFX.click.gapMs + 20);
    playSfx('click');
    await settle();
    expect(sources).toHaveLength(2);
  });

  it('gives a sound up rather than play it late, when the browser holds the context for a gesture', async () => {
    startState = 'suspended';
    playSfx('click');
    await settle();
    await wait(200);
    expect(sources).toHaveLength(0);
    expect(audioContextManager.getActiveSources()).toBe(0);
  });

  it('makes no context before the page has been clicked or typed in, where a browser would only warn', async () => {
    const activation = { hasBeenActive: false };
    vi.stubGlobal('navigator', { ...navigator, userActivation: activation });
    playSfx('hover');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);

    activation.hasBeenActive = true;
    await wait(SFX.hover.gapMs + 20);
    playSfx('hover');
    await settle();
    expect(sources).toHaveLength(1);
  });

  it('plays the old tone when the file cannot be fetched, and does not ask again', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    const fallback = vi.fn();
    playSfx('click', fallback);
    await settle();
    await wait(SFX.click.gapMs + 20);
    playSfx('click', fallback);
    await settle();
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(0);
    expect(audioContextManager.getActiveSources()).toBe(0);
  });

  it('releases every source it takes', async () => {
    playSfx('message');
    await settle();
    await wait(200);
    playSfx('alert');
    await settle();
    expect(sources).toHaveLength(2);
    expect(audioContextManager.getActiveSources()).toBe(0);
  });

  it('reports its sounds to audio telemetry', async () => {
    const events: AudioTelemetryEvent[] = [];
    setAudioTelemetryHandler((event) => events.push(event));
    playSfx('success');
    await settle();
    const ours = events.filter((e) => 'toneKey' in e && e.toneKey === 'sfx:success').map((e) => e.type);
    expect(ours).toEqual(['source_started', 'source_stopped']);
  });

  it("preloads every moment's file once, and lets go of the context", async () => {
    const files = new Set(Object.values(SFX_FILES)).size;
    preloadSfx();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(files);
    expect(audioContextManager.getActiveSources()).toBe(0);
    playSfx('warning');
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(files);
  });

  it('says so when sound is turned on or off: a chirp up once on, a chirp down before off', async () => {
    setSoundSettings({ enabled: false });
    setSoundOn(true);
    await settle();
    expect(getSoundSettings().enabled).toBe(true);
    expect(sources.length).toBe(1);
    expect(fetched).toContain(SFX_FILES.toggleOn);
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES.toggleOn]);

    await wait(200);
    setSoundOn(false);
    await settle();
    expect(getSoundSettings().enabled).toBe(false);
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES.toggleOn, SFX_FILES.toggleOff]);
  });

  it('plays what a kind of sound sounds like when it is turned on', async () => {
    setSoundSettings({ categories: { globe: false } });
    setSoundCategoryOn('globe', true);
    await settle();
    expect(getSoundSettings().categories.globe).toBe(true);
    expect(playedFiles(fetchMock)).toEqual([SFX_FILES[CATEGORY_SAMPLE.globe]]);
  });

  describe('the files and their levels', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/assets/sfx/manifest.json'), 'utf8')) as {
      sounds: { file: string; moments: string[]; loudest_50ms_lufs: number }[];
    };

    it('ships every file it plays', () => {
      for (const url of Object.values(SFX_FILES)) {
        expect(existsSync(join(process.cwd(), 'public', url))).toBe(true);
      }
    });

    it('ships no file that nothing plays, and the manifest names the moments that play each', () => {
      const played = new Set(Object.values(SFX_FILES).map((url) => url.split('/').pop()));
      expect(new Set(manifest.sounds.map((s) => s.file))).toEqual(played);
      for (const sound of manifest.sounds) {
        const moments = (Object.keys(SFX) as SfxMoment[]).filter((m) => SFX_FILES[m].endsWith(`/${sound.file}`));
        expect(sound.moments.sort()).toEqual(moments.sort());
      }
    });

    it('sets each gain from the loudness measured on the shipped file', () => {
      for (const sound of manifest.sounds) {
        for (const moment of sound.moments as SfxMoment[]) {
          expect(SFX[moment].loudness, moment).toBe(sound.loudest_50ms_lufs);
        }
      }
      for (const [moment, gain] of Object.entries(SFX_GAIN)) {
        expect(gain, moment).toBeGreaterThan(0);
        expect(gain, moment).toBeLessThanOrEqual(1);
      }
    });

    it('puts the pointer under the interface, the interface under the Globe, and alerts on top', () => {
      const level = (m: SfxMoment) => SFX[m].level;
      expect(level('hover')).toBeLessThan(level('click'));
      for (const m of ['click', 'switch', 'toggleOn', 'toggleOff', 'open', 'close', 'confirm', 'deny'] as const) {
        expect(level(m), m).toBeLessThan(level('spot'));
        expect(SFX[m].category, m).toBe('interface');
      }
      for (const m of ['warning', 'error', 'alert', 'message'] as const) {
        expect(level(m), m).toBeGreaterThan(level('spot'));
        expect(SFX[m].category, m).toBe('notifications');
      }
    });
  });
});
