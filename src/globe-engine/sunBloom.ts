/**
 * The glow round the Sun (decision K6, SS2; record
 * docs/missions/01-architecture-decisions/solar-system.md): a bloom that takes only what
 * is drawn brighter than white. On the globe that is the Sun alone, whose surface is
 * drawn at 1.6 in linear light (sunAppearance.ts); every mark, fill and word stays crisp.
 *
 * globe.gl already draws every frame through an EffectComposer holding one pass, which
 * renders straight to the screen. The bloom, and the pass that turns its linear light
 * into the screen's colours, are added after it and switched on only while the Sun is
 * drawn and the quality step allows (globeQuality.ts drops the glow first). Off, the
 * first pass is the last again and renders straight to the screen, so every other view
 * and every card draws exactly as before and pays nothing for it.
 *
 * A capture renders through it too while it is on (renderThroughBloom), so a card or a
 * clip frame that shows the Sun shows its glow.
 *
 * While it is on, the scene's background is the renderer's own clear colour. The first
 * pass clears its buffer itself, with the clear colour as it was last worked out for the
 * screen, in the screen's colours; into the bloom's linear buffer, and through the pass
 * that converts for the screen, that came out converted twice, and the dark navy behind
 * everything turned a bright indigo (measured: blue 17 became 73). A scene background
 * is worked out at render time, for the buffer drawn into.
 */
import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Only light brighter than white blooms: the Sun's, and nothing else drawn on the globe. */
export const BLOOM_THRESHOLD = 1;
const BLOOM_STRENGTH = 0.9;
const BLOOM_RADIUS = 0.55;

type Composer = Pick<EffectComposer, 'addPass' | 'removePass' | 'setPixelRatio' | 'setSize' | 'render'>;
type Renderer = Pick<THREE.WebGLRenderer, 'getSize' | 'getPixelRatio' | 'getClearColor'>;
type Scene = Pick<THREE.Scene, 'background'>;

export interface SunBloom {
  setActive(active: boolean): void;
  isActive(): boolean;
  /** Renders one frame through the glow, at the renderer's present size and pixel ratio. */
  renderFrame(): void;
  dispose(): void;
}

/** The glow switched on now, if any: there is one globe. */
let activeBloom: SunBloom | null = null;

export function attachSunBloom(composer: Composer, renderer: Renderer, scene: Scene): SunBloom {
  const size = renderer.getSize(new THREE.Vector2());
  let backgroundBefore: Scene['background'] = null;
  const bloom = new UnrealBloomPass(size.clone(), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  const output = new OutputPass();
  bloom.enabled = false;
  output.enabled = false;
  composer.addPass(bloom);
  composer.addPass(output);

  // The composer keeps the pixel ratio it was built with; the quality governor moves the renderer's.
  const fitToRenderer = () => {
    renderer.getSize(size);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };

  const handle: SunBloom = {
    setActive(on: boolean) {
      if (bloom.enabled !== on) {
        bloom.enabled = on;
        output.enabled = on;
        if (on) {
          fitToRenderer();
          backgroundBefore = scene.background;
          scene.background = renderer.getClearColor(new THREE.Color());
        } else {
          scene.background = backgroundBefore;
        }
      }
      if (on) activeBloom = handle;
      else if (activeBloom === handle) activeBloom = null;
    },
    isActive: () => bloom.enabled,
    renderFrame() {
      fitToRenderer();
      composer.render();
    },
    dispose() {
      handle.setActive(false);
      composer.removePass(bloom);
      composer.removePass(output);
      bloom.dispose();
      output.dispose();
    },
  };
  return handle;
}

/**
 * Renders a capture's frame through the glow, if it is on. Returns false if it is not,
 * and the caller renders the frame as it always has.
 */
export function renderThroughBloom(): boolean {
  if (!activeBloom?.isActive()) return false;
  activeBloom.renderFrame();
  return true;
}
