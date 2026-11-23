import React, { useEffect, useRef, useState } from 'react';
import { Glyph } from '../../symbols/Glyph';
import './GlobeLoadingManager.css';
import type { GlobeEngine, TextureState } from '../../globe-engine/GlobeEngine';
import { useEngineTextures } from './Hooks/useEngineTextures';
import { SourceStatusList, type SourceStatus } from '../Shared/SourceStatus';

interface GlobeLoadingManagerProps {
  children: React.ReactNode;
  material: unknown; // THREE.Material or null
  globeEngine: Pick<GlobeEngine, 'on' | 'off' | 'getTextureStates' | 'retryTextures'> | null;
}

const isFlat = (t: TextureState) => t.state === 'failed' || t.state === 'timeout';

const asSource = (t: TextureState): SourceStatus => ({
  id: t.name,
  label: t.label,
  state: t.state,
  detail: t.state === 'ready' && t.ms !== undefined ? `${(t.ms / 1000).toFixed(1)} s` : isFlat(t) ? 'drawn flat' : undefined,
});

/** "City lights", "City lights and Oceans", "Relief, Oceans and City lights". */
const listed = (labels: string[]) =>
  labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

/** Removal after the fade starts; the overlay's fade-out is this long. */
const FADE_MS = 300;
/** Past this, a first visit is slower than usual, and the loader says so. */
const SLOW_AFTER_S = 10;

/**
 * The globe's loader, showing the work it waits on (plan item 8.3, decision D6).
 *
 * It held a first visit for 3 seconds after the globe was ready (0.8 s in a
 * "fast track" nothing turned on), ran five scripted lines ("ESTABLISHING
 * QUANTUM ENCRYPTED CHANNELS…") on timed delays that looked like stages, and
 * drew random "matrix" characters on every render. It shows the two things it
 * can see instead, each as it stands, with the time taken, and lets go the
 * moment both are ready: the engine, and the Earth's surface, whose material
 * exists once its textures have loaded.
 */
const GlobeLoadingManager: React.FC<GlobeLoadingManagerProps> = ({ children, material, globeEngine }) => {
  const ready = Boolean(material && globeEngine);
  const [showLoader, setShowLoader] = useState(!ready);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());
  // Each texture of the surface as it stands (plan item 8.3c). One that failed
  // or timed out is drawn with a one-pixel stand-in, so the globe still shows;
  // the loader used to say "ready" and leave, and nothing said it was flat.
  const textures = useEngineTextures(globeEngine);
  const flat = textures.filter(isFlat);
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const retry = () => {
    if (!globeEngine) return;
    setRetrying(true);
    void globeEngine.retryTextures().finally(() => setRetrying(false));
  };

  // The fade follows `ready` in the same render that shows the globe. Set from
  // this effect, it came a render later, which on a first visit waited out the
  // globe's first frame and landed 7 ms before the removal: no fade at all.
  useEffect(() => {
    if (ready) {
      const remove = setTimeout(() => setShowLoader(false), FADE_MS);
      return () => clearTimeout(remove);
    }
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [ready]);

  const surface = material ? 'ready' : globeEngine ? 'loading' : 'waiting';

  return (
    <>
      {showLoader && (
        <div className={`globe-loading-overlay ${ready ? 'fade-out' : ''}`} data-testid="globe-loader" role="status" aria-live="polite">
          <div className="tactical-loading">
            <div className="tactical-grid">
              <div className="grid-lines horizontal"></div>
              <div className="grid-lines vertical"></div>
            </div>
            <div className="globe-loader-container">
              <div className="scanning-globe">
                <div className="globe-icon"><Glyph name="app:cybercommand" size={24} /></div>
                <div className="scanning-dot"></div>
                <div className="inner-ring"></div>
              </div>
            </div>
            <ul className="load-stages">
              <li data-testid="globe-load-engine" data-state={globeEngine ? 'ready' : 'starting'}>
                Globe engine: {globeEngine ? 'ready' : 'starting'}
              </li>
              <li data-testid="globe-load-surface" data-state={surface}>
                Earth's surface: {surface}
              </li>
            </ul>
            {textures.length > 0 && <SourceStatusList sources={textures.map(asSource)} label="Earth's imagery" />}
            <div className="load-elapsed">{seconds} s</div>
            {!ready && seconds >= SLOW_AFTER_S && (
              <div className="load-slow">This is taking longer than usual. The surface may still be downloading.</div>
            )}
          </div>
        </div>
      )}
      <div className={`globe-content ${ready ? 'visible fade-in' : 'hidden'}`}>
        {children}
        {ready && flat.length > 0 && !dismissed && (
          <div className="globe-surface-notice" role="status" data-testid="globe-surface-notice">
            <span>{listed(flat.map((t) => t.label))} did not load: drawn flat.</span>
            <button type="button" onClick={retry} disabled={retrying}>{retrying ? 'Trying…' : 'Try again'}</button>
            <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)}>✕</button>
          </div>
        )}
      </div>
    </>
  );
};

export default GlobeLoadingManager;
