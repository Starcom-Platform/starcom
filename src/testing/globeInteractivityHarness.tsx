import React from 'react';
import * as THREE from 'three';
import { MemoryRouter } from 'react-router-dom';
import { composeProviders } from '../context/composeProviders';
import { VisualizationModeProvider } from '../context/VisualizationModeContext';
import { GlobeProvider } from '../context/GlobeContext';
import { CountrySelectionProvider } from '../context/CountrySelectionContext';
import { VisualizationOverlayProvider } from '../context/VisualizationOverlayContext';
import { GlobalGlobeContextMenuProvider } from '../context/GlobalGlobeContextMenuProvider';
import { GeoPoliticalSettingsProvider } from '../hooks/useGeoPoliticalSettings';
import { PopupProvider } from '../components/Popup/PopupManager';
import { ApplicationRouterProvider } from '../components/Router/ApplicationRouter';
import FloatingPanelManager from '../components/HUD/FloatingPanels/FloatingPanelManager';

/**
 * The provider stack Enhanced3DGlobeInteractivity actually needs.
 *
 * ─── WHY THIS IS SHARED RATHER THAN COPIED ─────────────────────────────────
 *
 * Five test files exercise the globe's interactivity, and every one of them
 * needs the same eight providers in the same order. Assembling that by hand
 * meant discovering it by hand: add a provider, run, read the next "must be
 * used within" error, add the next. Seven rounds, and the seventh was a
 * provider added in the wrong POSITION rather than a missing one — the context
 * menu needs the overlay, so nesting it outside produced an error naming a
 * provider that was already present.
 *
 * ─── THE ORDER IS COPIED FROM App.tsx, DELIBERATELY ────────────────────────
 *
 * VisualizationModeProvider → GlobeProvider → CountrySelectionProvider →
 * VisualizationOverlayProvider → GlobalGlobeContextMenuProvider →
 * GeoPoliticalSettingsProvider is exactly the composition App.tsx builds. A
 * test stack in a different order can pass while production fails, or fail
 * while production works, and either way it stops describing the application.
 *
 * PopupProvider and FloatingPanelManager sit inside, matching where the HUD
 * mounts them — the floating panel manager has to be inside the providers its
 * panels read, which is a lesson this codebase learned the expensive way.
 *
 * ApplicationRouterProvider joins them for decision D-F, step 3.3: the globe's
 * context menu opens applications rather than navigating to addresses, two of which
 * had no route at all. It sits just inside MemoryRouter, as App.tsx has it, where the
 * routers wrap the popup layer so that what a popup shows can navigate too. Adding it
 * is the deliberate decision this comment's last paragraph asks for.
 *
 * ─── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 *
 * It does not mount every provider in the application. A wrapper that did would
 * pass whatever the component asked for and stop being evidence of anything —
 * the point is that adding a context dependency to the globe should break these
 * tests until someone decides that dependency is wanted.
 */
const VisualizationProviders = composeProviders(
  VisualizationModeProvider,
  GlobeProvider,
  CountrySelectionProvider,
  VisualizationOverlayProvider,
  GlobalGlobeContextMenuProvider,
  GeoPoliticalSettingsProvider,
);

export const GlobeInteractivityHarness: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>
    <ApplicationRouterProvider>
      <VisualizationProviders>
        <PopupProvider>
          <FloatingPanelManager>{children}</FloatingPanelManager>
        </PopupProvider>
      </VisualizationProviders>
    </ApplicationRouterProvider>
  </MemoryRouter>
);

/**
 * A model mesh the raycaster can actually survive.
 *
 * ─── WHY A REAL Object3D AND NOT A LITERAL ─────────────────────────────────
 *
 * The tests built `{ position, traverse, userData }` by hand and handed it to
 * a component that passes it straight to `THREE.Raycaster.intersectObjects`.
 * three's own intersect() reads `object.layers.test(...)` before anything
 * else, so every hover threw `Cannot read properties of undefined (reading
 * 'test')` — asynchronously, after the test that caused it had been recorded
 * green. Nine such exceptions across two files, and vitest's warning is the
 * part that matters: "This might cause false positive tests."
 *
 * The literal was also missing `uuid`, which the component uses to key its
 * model map, and `getWorldPosition`, which it calls to place popups. Adding
 * those three by hand would have been guessing at three's requirements one
 * crash at a time; a real Mesh satisfies them by construction and cannot drift
 * when three changes.
 *
 * BufferGeometry and a basic material need no WebGL context — only the
 * renderer does — so this is safe under jsdom.
 */
export function testModelMesh(opts: { x?: number; y?: number; z?: number; reportId?: string } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  mesh.userData = { reportId: opts.reportId };
  return mesh;
}

export default GlobeInteractivityHarness;
