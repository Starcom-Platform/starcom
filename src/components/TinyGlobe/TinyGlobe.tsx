import React, { useEffect, useRef, useState, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useGlobeContext } from '../../context/GlobeContext';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useGlobeLayerControl } from '../Globe/Hooks/useGlobeLayerControl';
import styles from './TinyGlobe.module.css';
import Globe, { GlobeMethods } from 'react-globe.gl';
import { GlobeEngine } from '../../globe-engine/GlobeEngine';
import * as THREE from 'three';
import type { GlobeEvent } from '../../globe-engine/GlobeEngine';
import { globeCameraTelemetry } from '../../services/globe/GlobeCameraTelemetry';
import { resolveGlobeClickLatLng } from '../../utils/globeClickRaycast';
import { useMinimapLive } from './useMinimapLive';
import { DATA_SCALES, GUNMETAL } from '../../styles/tokens';
import { withAlpha } from '../../features/globe/capture/drawShareCard';
import { MinimapOrbit } from './minimapOrbit';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { aimGlobeLightRig, createGlobeLightRig, DEFAULT_NIGHT_FILL, subsolarDirectionWorld, sunMomentFor } from '../../globe-engine/globeLighting';
import { GlobeMaterialManager } from '../../globe-engine/GlobeMaterialManager';
import { GlobeModeMapping } from '../../globe-engine/GlobeModeMapping';
import { MinimapCanvas, type MinimapPoint } from './MinimapCanvas';
import { MinimapStill } from './MinimapStill';

type OverlayPayload = { overlay: string; data: object[] };

// Shared by both the mode-accent ring and the activity-pulse dots, matching the
// exact category convention Quick Access used (retired into the command palette, D-CP).
const CATEGORY_COLORS: Record<string, string> = {
    CyberCommand: '#00ffff',
    GeoPolitical: '#ffa500',
    EcoNatural: '#00ff41',
    RaverWatch: '#c77dff',
    HeroWatch: DATA_SCALES.heroWatch,
    AIWatch: DATA_SCALES.aiWatch,
    Missions: DATA_SCALES.missions,
    PsiWatch: DATA_SCALES.psiWatch,
};

const ORIENTATION_MARKER_COLOR = GUNMETAL[100];
/**
 * Where the main globe looks (D-MG, MG2): flat on the ground and a few degrees across, so it reads at
 * 110 px. It stood 0.6 radii tall, a point a few pixels wide face on and a spike off the rim edge on.
 * In WebGL it is an unlit disc, not one of react-globe.gl's points, which are lit: on the night side a
 * point all but vanished, and the 2D minimap's stays bright.
 */
const MARKER_ALTITUDE = 0.01;
const MARKER_RADIUS_DEG = 2.2;
/** react-globe.gl's globe radius, in its scene's units. */
const GLOBE_RADIUS = 100;
/** The disc's radius, as wide as a react-globe.gl point of MARKER_RADIUS_DEG draws (1.8 times its arc). */
const MARKER_DISC_RADIUS = GLOBE_RADIUS * Math.sin(MARKER_RADIUS_DEG * 1.8 * (Math.PI / 180));
/** A ring that swells from it and fades, slowly: the minimap is live, and here is the view. */
const MARKER_RING = { maxRadiusDeg: 9, speedDegPerS: 6, repeatMs: 1600 };
/** The same ring, as the 2D minimap draws it (MG1). */
const FLAT_MARKER_RING = { maxRadiusDeg: MARKER_RING.maxRadiusDeg, repeatMs: MARKER_RING.repeatMs, color: ORIENTATION_MARKER_COLOR };
/** The atmosphere's colour, on both minimaps. */
const MINIMAP_ATMOSPHERE = '#00C4FF';

function subscribeToCameraOrientation(callback: () => void): () => void {
    return globeCameraTelemetry.subscribe(callback);
}

/** The minimap's distance out, in globe radii: the whole planet with its rim. */
const MINIMAP_ALTITUDE = 2;
/** The subsolar point moves a quarter of a degree a minute. */
const SUN_REFRESH_MS = 60_000;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The Sun's direction for the main globe's moment (D-MG, MG4): now while the timeline is live, the
 * paused moment otherwise, so the two globes are lit alike. Always sunlit, whatever the main globe's
 * light mode.
 */
function useMinimapSun(): THREE.Vector3 {
    const temporal = useTemporalStateOptional();
    const pausedAt = temporal && !temporal.isLive ? temporal.currentTime : null;
    const [sun, setSun] = useState(() => subsolarDirectionWorld(sunMomentFor(temporal, Date.now())));
    useEffect(() => {
        const paused = pausedAt === null ? null : { isLive: false, currentTime: pausedAt };
        const tick = () => setSun(subsolarDirectionWorld(sunMomentFor(paused, Date.now())));
        tick();
        if (paused) return undefined;
        const timer = setInterval(tick, SUN_REFRESH_MS);
        return () => clearInterval(timer);
    }, [pausedAt]);
    return sun;
}

const TinyGlobe: React.FC = () => {
    const { setFocusLocation } = useGlobeContext();
    const { visualizationMode } = useVisualizationMode();
    const { layers } = useGlobeLayerControl();
    const globeRef = useRef<GlobeMethods>();
    const canvasWrapperRef = useRef<HTMLDivElement>(null);
    const [globeReady, setGlobeReady] = useState(false);
    const [material, setMaterial] = useState<THREE.Material | null>(null);
    const [globeData, setGlobeData] = useState<object[]>([]);
    // No engine and no second globe until it may draw (plan item 8.3, block B4).
    const { live, flat, why } = useMinimapLive();
    const reducedMotion = useMemo(prefersReducedMotion, []);

    // Where the MAIN globe's camera is currently pointed — see GlobeCameraTelemetry.ts.
    const cameraOrientation = useSyncExternalStore(
        subscribeToCameraOrientation,
        globeCameraTelemetry.getCurrent
    );

    useEffect(() => {
        if (!live) {
            setMaterial(null);
            return;
        }
        // One GlobeEngine instance drives both material and overlay data.
        // Previously this effect and a second, separate effect each
        // constructed their own GlobeEngine — the overlay listener was
        // wired to an engine whose overlays array was always empty, so
        // nothing was ever fetched. Worse, the original overlay-request
        // loop (`engine.getOverlays().forEach(o => engine.addOverlay(o))`)
        // would have been a no-op even with a populated array: addOverlay()
        // guards on `!this.overlays.includes(overlay)`, so it can never
        // trigger real data for something already in the engine's own list.
        // addOverlay('alerts') below is the one overlay type with a real,
        // working fetch behind it (fetchAlerts() -> overlayDataUpdated).
        const engine = new GlobeEngine({ mode: visualizationMode.mode });

        const checkMaterial = setInterval(() => {
            const mat = engine.getMaterial();
            if (mat) {
                setMaterial(mat);
                clearInterval(checkMaterial);
            }
        }, 100);

        const handler = ({ type, payload }: GlobeEvent) => {
            if (type === 'overlayDataUpdated' && payload && typeof payload === 'object') {
                const p = payload as OverlayPayload;
                if (p.overlay === 'alerts') {
                    setGlobeData(p.data || []);
                }
            }
        };
        engine.on('overlayDataUpdated', handler);
        engine.addOverlay('alerts');

        return () => {
            clearInterval(checkMaterial);
            // The engine this run built. The cleanup used to stop only the
            // interval, so every mode change left an engine behind — its
            // material, its handler and its 'alerts' overlay.
            engine.dispose();
        };
    }, [visualizationMode.mode, live]);

    // Lit by the real Sun (D-MG, MG4): the shader skins through their uniform, the Phong skins through
    // a light rig of the minimap's own, which replaces react-globe.gl's lights fixed over the north pole.
    const sun = useMinimapSun();
    const lightRigRef = useRef(createGlobeLightRig());
    useEffect(() => {
        GlobeMaterialManager.applyLighting(material, { direction: sun, nightFill: DEFAULT_NIGHT_FILL, flat: false });
    }, [material, sun]);
    useEffect(() => {
        const globe = globeRef.current as unknown as { lights?: (l: THREE.Light[]) => void } | undefined;
        if (!globeReady || !globe?.lights) return;
        aimGlobeLightRig(lightRigRef.current, sun);
        globe.lights(lightRigRef.current.lights);
    }, [globeReady, sun]);

    // Where the camera is (D-MG, MG2, MG3, MG5): orbiting, turning to the main globe's view when it
    // moves, holding it, paused while hovered. A focused place reaches it as the main view, once the
    // main globe has flown there.
    const orbitRef = useRef<MinimapOrbit | null>(null);
    orbitRef.current ??= new MinimapOrbit({ reducedMotion });
    useEffect(() => {
        if (cameraOrientation) orbitRef.current!.view({ lat: cameraOrientation.lat, lng: cameraOrientation.lng }, performance.now());
    }, [cameraOrientation]);
    useEffect(() => {
        if (!globeReady) return undefined;
        let frame = 0;
        const follow = () => {
            const pose = orbitRef.current!.pose(performance.now());
            globeRef.current?.pointOfView({ lat: pose.lat, lng: pose.lng, altitude: MINIMAP_ALTITUDE }, 0);
            frame = requestAnimationFrame(follow);
        };
        follow();
        return () => cancelAnimationFrame(frame);
    }, [globeReady]);

    // TinyGlobe is a display/navigation widget, not an independently-orbitable
    // globe — letting a user drag-rotate it would fight both the orientation
    // marker (driven by the MAIN globe's camera) and click-to-fly below, which
    // needs every click to be unambiguous (no drag-vs-click disambiguation).
    useEffect(() => {
        if (!globeReady || !globeRef.current) return;
        const controls = globeRef.current.controls();
        if (controls) {
            controls.enabled = false;
        }
    }, [globeReady]);

    // Merge the real-time alerts overlay with a marker showing where the main
    // globe's camera is currently pointed.
    const pointsWithOrientationMarker = useMemo(() => {
        if (!cameraOrientation) return globeData;
        return [
            ...globeData,
            {
                lat: cameraOrientation.lat,
                lng: cameraOrientation.lng,
                color: ORIENTATION_MARKER_COLOR,
                size: MARKER_ALTITUDE,
                radius: MARKER_RADIUS_DEG,
            }
        ];
    }, [globeData, cameraOrientation]);
    // The marker's disc, one geometry and material for the minimap's life.
    const markerDisc = useMemo(() => ({
        geometry: new THREE.CircleGeometry(MARKER_DISC_RADIUS, 24),
        material: new THREE.MeshBasicMaterial({ color: ORIENTATION_MARKER_COLOR, side: THREE.DoubleSide }),
    }), []);
    useEffect(() => () => { markerDisc.geometry.dispose(); markerDisc.material.dispose(); }, [markerDisc]);
    const markerData = useMemo(() => (cameraOrientation ? [{ lat: cameraOrientation.lat, lng: cameraOrientation.lng }] : []), [cameraOrientation]);
    // Still with reduced motion (MG5): the point alone says where the view is.
    const markerRings = useMemo(
        () => (cameraOrientation && !reducedMotion ? [{ lat: cameraOrientation.lat, lng: cameraOrientation.lng }] : []),
        [cameraOrientation, reducedMotion],
    );

    // Which globe layers are actually live right now (excludes layers with no
    // real rendering behind them — see useGlobeLayerControl's isImplemented).
    const activeLayers = useMemo(
        () => layers.filter(l => l.isActive && l.isImplemented),
        [layers]
    );

    const modeColor = CATEGORY_COLORS[visualizationMode.mode] || '#00C4FF';

    // Click-to-fly: raycast against TinyGlobe's own globe mesh and ask the main
    // globe (already listening to GlobeContext.focusLocation) to fly there.
    const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!globeRef.current || !canvasWrapperRef.current) return;
        const camera = globeRef.current.camera();
        const scene = globeRef.current.scene();
        if (!camera || !scene) return;

        const rect = canvasWrapperRef.current.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const hit = resolveGlobeClickLatLng(x, y, camera, scene);
        if (hit) {
            setFocusLocation(hit);
        }
    }, [setFocusLocation]);

    return (
        <div data-testid="tiny-globe-container" className={styles.tinyGlobeContainer} style={{ borderColor: modeColor }}>
            {live && material ? (
                <div
                    ref={canvasWrapperRef}
                    className={`${styles.canvasWrapper} ${styles.flatMinimap}`}
                    onClick={handleClick}
                    onPointerEnter={() => orbitRef.current!.hover(true, performance.now())}
                    onPointerLeave={() => orbitRef.current!.hover(false, performance.now())}
                    title="Click to fly the main globe here"
                >
                    {!globeReady && <MinimapStill color={modeColor} why="Loading the minimap" reducedMotion={reducedMotion} className={styles.underlay} />}
                    <div className={styles.fadeIn} style={{ opacity: globeReady ? 1 : 0 }}>
                    <Globe
                        ref={globeRef}
                        width={110}
                        height={110}
                        backgroundColor="rgba(0, 0, 0, 0)"
                        showAtmosphere={true}
                        atmosphereColor={MINIMAP_ATMOSPHERE}
                        atmosphereAltitude={0.18}
                        globeMaterial={material ?? undefined}
                        pointsData={globeData}
                        pointAltitude="size"
                        pointColor="color"
                        pointRadius={(d: object) => (d as { radius?: number }).radius ?? 0.25}
                        customLayerData={markerData}
                        customThreeObject={() => new THREE.Mesh(markerDisc.geometry, markerDisc.material)}
                        customThreeObjectUpdate={(obj: THREE.Object3D, d: object) => {
                            const { lat, lng } = d as { lat: number; lng: number };
                            const at = globeRef.current?.getCoords(lat, lng, MARKER_ALTITUDE);
                            if (!at) return;
                            obj.position.set(at.x, at.y, at.z);
                            // Its face to the centre, so it lies on the ground, seen from outside.
                            obj.lookAt(0, 0, 0);
                        }}
                        ringsData={markerRings}
                        ringColor={() => (t: number) => withAlpha(ORIENTATION_MARKER_COLOR, 1 - t)}
                        ringMaxRadius={MARKER_RING.maxRadiusDeg}
                        ringPropagationSpeed={MARKER_RING.speedDegPerS}
                        ringRepeatPeriod={MARKER_RING.repeatMs}
                        enablePointerInteraction={false}
                        onGlobeReady={() => setGlobeReady(true)}
                    />
                    </div>
                </div>
            ) : flat ? (
                // Where the governor steps the device down: drawn flat, no WebGL context (D-MG, MG1).
                <MinimapCanvas
                    skin={GlobeModeMapping.getRenderConfigForMode(visualizationMode.mode).shader}
                    orbit={orbitRef.current!}
                    sun={sun}
                    nightFill={DEFAULT_NIGHT_FILL}
                    points={pointsWithOrientationMarker as MinimapPoint[]}
                    marker={cameraOrientation}
                    ring={FLAT_MARKER_RING}
                    atmosphere={MINIMAP_ATMOSPHERE}
                    stillColor={modeColor}
                    reducedMotion={reducedMotion}
                    onPick={setFocusLocation}
                />
            ) : (
                // A still globe until it may draw, saying why, breathing (D-MG, MG6). It was a spinning
                // emoji over "INIT..." in 8 px type, then a still outline the owner read as dead.
                <MinimapStill color={modeColor} why={why} reducedMotion={reducedMotion} />
            )}
            {activeLayers.length > 0 && (
                <div
                    className={styles.activityRow}
                    title={activeLayers.map(l => l.label).join(', ')}
                >
                    {activeLayers.map(layer => (
                        <span
                            key={layer.id}
                            className={styles.activityDot}
                            style={{ backgroundColor: CATEGORY_COLORS[layer.category] || '#00ffff' }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default TinyGlobe;
// AI-NOTE: Refactored to use GlobeEngine. See globe-engine-api.artifact for integration details.
