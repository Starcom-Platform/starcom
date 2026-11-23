/**
 * useGlobeSunBloom — the glow round the Sun on the globe's own post-processing
 * (globe-engine/sunBloom.ts; decision K6, SS2): on while the Sun is drawn and the
 * quality step keeps the glow, off otherwise. Tells the quality governor whether the
 * Sun is drawn, since only then does dropping the glow change the picture.
 */
import { useEffect, useState, type RefObject } from 'react';
import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { attachSunBloom, type SunBloom } from '../../../globe-engine/sunBloom';
import { setGlobeBloomInUse } from '../../../services/globe/globeQuality';

const POLL_MS = 250;

type WithComposer = {
  postProcessingComposer?: () => EffectComposer;
  renderer?: () => THREE.WebGLRenderer;
  scene?: () => THREE.Scene;
};

export function useGlobeSunBloom(globeRef: RefObject<unknown>, allowed: boolean, sunDrawn: boolean): void {
  const [bloom, setBloom] = useState<SunBloom | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let attached: SunBloom | null = null;
    const attach = () => {
      if (cancelled) return;
      const globe = globeRef.current as WithComposer | null;
      const composer = globe?.postProcessingComposer?.();
      const renderer = globe?.renderer?.();
      const scene = globe?.scene?.();
      if (!composer || !renderer || !scene) {
        timer = setTimeout(attach, POLL_MS);
        return;
      }
      attached = attachSunBloom(composer, renderer, scene);
      setBloom(attached);
    };
    attach();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      attached?.dispose();
      setBloom(null);
    };
  }, [globeRef]);

  useEffect(() => {
    setGlobeBloomInUse(sunDrawn);
    bloom?.setActive(allowed && sunDrawn);
  }, [bloom, allowed, sunDrawn]);

  useEffect(() => () => setGlobeBloomInUse(false), []);
}
