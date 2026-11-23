// GlobeCameraTelemetry — broadcasts the main 3D globe's current camera orientation
// (lat/lng/altitude) to anyone interested, e.g. TinyGlobe's orientation marker.
//
// Deliberately NOT part of GlobeContext: focusLocation there is a low-frequency,
// explicit "fly here" signal, while this fires on every camera-drag frame. Mixing
// the two would blur that single-purpose semantics and, since Globe.tsx is itself a
// GlobeContext consumer, would re-render Globe.tsx (1000+ lines) on every emission of
// its own camera position. This is a plain module-level pub/sub with no React state
// in the publisher — mirrors the subscribe/notify pattern already used in
// IntelReportVisualizationService.ts.

export interface GlobeCameraOrientation {
  lat: number;
  lng: number;
  altitude: number;
}

type Listener = (orientation: GlobeCameraOrientation) => void;

let current: GlobeCameraOrientation | null = null;
const listeners = new Set<Listener>();

export const globeCameraTelemetry = {
  publish(orientation: GlobeCameraOrientation): void {
    current = orientation;
    listeners.forEach(listener => listener(orientation));
  },

  getCurrent(): GlobeCameraOrientation | null {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (current) {
      listener(current);
    }
    return () => {
      listeners.delete(listener);
    };
  }
};
