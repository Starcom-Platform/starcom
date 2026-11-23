/**
 * The live globe's own draws held while a clip records its frames, so each frame is one draw.
 *
 * globe.gl draws on every animation frame through its EffectComposer: three-render-objects' tick updates the
 * controls, calls `postProcessingComposer.render()`, then checks the hover. A clip renders each of its frames
 * itself, with motion held still (captureClock), and between two of them the live loop drew the whole globe once
 * more, at a moment no frame keeps. On a machine drawing in software every draw is the cost: the Jetson, headless,
 * paid about 2.3 to 3 s a footage frame (measured 4-5 Nov) for three draws, where the frame is one.
 *
 * Held, the composer draws only what is rendered while motion is held still: a capture's own render, which goes
 * through it when the Sun's glow is on (renderThroughBloom). Everything else the loop does goes on: the controls and
 * their change events, the hover check, and three-globe's own animation, so its rings and its layers' transitions
 * keep their time as before. Pausing the loop (pauseAnimation) would have stopped three-globe's animation with it,
 * and contended with the render gate (useGlobeRenderGate) over which of them resumes it.
 *
 * Holds count: the composer is given back its own `render` when the last one is let go.
 */
import { stilledAt } from './captureClock';

interface Composer {
  render(deltaTime?: number): void;
}

interface Held {
  count: number;
  draw: Composer['render'];
  /** Whether `render` was the composer's own property, rather than its class's, before the hold. */
  own: boolean;
}

const held = new WeakMap<Composer, Held>();

/** Holds the live loop's draws on this composer until the function returned is called. Nothing to hold, nothing done. */
export function holdLiveDraws(composer: Composer | null | undefined): () => void {
  if (!composer || typeof composer.render !== 'function') return () => {};
  let hold = held.get(composer);
  if (!hold) {
    const draw = composer.render;
    hold = { count: 0, draw, own: Object.prototype.hasOwnProperty.call(composer, 'render') };
    held.set(composer, hold);
    composer.render = function heldRender(this: Composer, deltaTime?: number) {
      // A capture's render (motion held still for it) is drawn; the live loop's, between two frames, is not.
      if (stilledAt() === null) return;
      draw.call(this, deltaTime);
    };
  }
  hold.count += 1;
  const mine = hold;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.count -= 1;
    if (mine.count > 0) return;
    held.delete(composer);
    if (mine.own) composer.render = mine.draw;
    else delete (composer as Partial<Composer>).render;
  };
}
