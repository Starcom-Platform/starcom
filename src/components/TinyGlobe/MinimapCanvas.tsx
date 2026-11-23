/**
 * The mini-globe on a 2D canvas, where the quality governor steps a device down (decision D-MG, MG1):
 * no WebGL context, the same skin, Sun, orbit, marker and click-to-fly as the WebGL minimap.
 *
 * Its skin's textures are read at 512 × 256 from the files the globe fetches, so they come from the
 * same cache. The planet's pixels are worked out again only when the pose has moved or the Sun has,
 * and at most every REDRAW_MS: at 4° a second the surface moves about 3 px a second at 110 px, so a
 * redraw every 140 ms is smooth. The glow, the points and the marker's ring go over it each frame.
 * Until the first frame is drawn the still shows, and the canvas fades in over it.
 */
import React, { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { GlobeSkin } from '../../services/globe/globeAppearance';
import { GlobeTextureLoader } from '../../globe-engine/GlobeTextureLoader';
import { withAlpha } from '../../features/globe/capture/drawShareCard';
import type { MinimapOrbit, Pose } from './minimapOrbit';
import {
    discRadius, drawMinimapPixels, MINIMAP_SKIN_TEXTURES, MINIMAP_TEXTURE_SIZE, pickMinimap, projectToMinimap, sunPlaceOf,
    type MinimapTextureName, type Pixels,
} from './minimapPixels';
import { MinimapStill } from './MinimapStill';
import styles from './TinyGlobe.module.css';

const SIZE = 110;
const REDRAW_MS = 140;
/** Backing pixels per CSS pixel: sharp on a 1.5× screen, and no more work than that on a 3× one. */
const MAX_PIXEL_RATIO = 1.5;
const DEG = Math.PI / 180;
/**
 * How much larger react-globe.gl draws a point than its radius in degrees: measured on the rendered
 * WebGL minimap (2026-10-11), its 2.2° marker 2.9 px across the radius where 2.2° of arc is 1.6 px.
 */
const POINT_SCALE = 1.8;
/** The glow round the rim, as react-globe.gl's atmosphere reads at this size: faint, and close. */
const GLOW = { inner: 0.94, outer: 1.14, alpha: 0.4 };

export interface MinimapPoint {
    lat: number;
    lng: number;
    color: string;
    /** Its radius in degrees of arc. */
    radius?: number;
}

async function readTexture(name: MinimapTextureName): Promise<Pixels> {
    const urls = GlobeTextureLoader.urlsOf(name);
    if (!urls) throw new Error(`No texture is named ${name}.`);
    const fetchBlob = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.blob();
    };
    const blob = await fetchBlob(urls.webp).catch(() => fetchBlob(urls.url));
    const { width, height } = MINIMAP_TEXTURE_SIZE;
    // Decoded at the small size where the browser can, off the main thread.
    const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' })
        .catch(() => createImageBitmap(blob));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2D canvas to read a texture with.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

export const MinimapCanvas: React.FC<{
    skin: GlobeSkin;
    orbit: MinimapOrbit;
    sun: THREE.Vector3;
    nightFill: number;
    points: readonly MinimapPoint[];
    /** Where the main globe looks, ringed. */
    marker: { lat: number; lng: number } | null;
    ring: { maxRadiusDeg: number; repeatMs: number; color: string };
    atmosphere: string;
    stillColor: string;
    reducedMotion: boolean;
    onPick: (place: { lat: number; lng: number }) => void;
}> = ({ skin, orbit, sun, nightFill, points, marker, ring, atmosphere, stillColor, reducedMotion, onPick }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    /**
     * The textures read, with the skin they were read for: when the skin changes, the paint loop starts
     * again in the same commit, before the old skin's textures are cleared, and must not draw the new
     * skin with them.
     */
    const [read, setRead] = useState<{ skin: GlobeSkin; textures: Partial<Record<MinimapTextureName, Pixels>> } | null>(null);
    const textures = read?.skin === skin ? read.textures : null;
    const [failed, setFailed] = useState(false);
    const [drawn, setDrawn] = useState(false);
    // Read each frame without restarting the loop.
    const live = useRef({ sun, points, marker });
    live.current = { sun, points, marker };
    /** The pose the planet's pixels were drawn for, so the points sit on it. */
    const shownRef = useRef<Pose | null>(null);

    useEffect(() => {
        let cancelled = false;
        setRead(null);
        setFailed(false);
        setDrawn(false);
        const names = MINIMAP_SKIN_TEXTURES[skin];
        Promise.all(names.map(async (name) => [name, await readTexture(name)] as const))
            .then((pairs) => { if (!cancelled) setRead({ skin, textures: Object.fromEntries(pairs) }); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [skin]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!textures || !canvas || !ctx) return undefined;
        const backing = Math.round(SIZE * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        canvas.width = backing;
        canvas.height = backing;
        const planet = document.createElement('canvas');
        planet.width = backing;
        planet.height = backing;
        const planetCtx = planet.getContext('2d');
        if (!planetCtx) return undefined;
        const pixels = planetCtx.createImageData(backing, backing);
        const r = discRadius(backing);
        const centre = backing / 2;
        let drawnAt = -Infinity;
        let drawnSun: THREE.Vector3 | null = null;
        let frame = 0;
        let first = true;

        const paint = (now: number) => {
            const { sun: sunNow, points: pointsNow, marker: markerNow } = live.current;
            const pose = orbit.pose(now);
            const shown = shownRef.current;
            const moved = !shown || Math.abs(pose.lat - shown.lat) + Math.abs(((pose.lng - shown.lng + 540) % 360) - 180) > 0.05;
            if ((moved || sunNow !== drawnSun) && now - drawnAt >= REDRAW_MS) {
                drawMinimapPixels(pixels, skin, textures, pose, { sun: sunPlaceOf(sunNow), nightFill });
                planetCtx.putImageData(pixels, 0, 0);
                shownRef.current = pose;
                drawnAt = now;
                drawnSun = sunNow;
            }
            const at = shownRef.current!;
            ctx.clearRect(0, 0, backing, backing);
            // The atmosphere's glow round the rim, as react-globe.gl's reads at this size.
            const glow = ctx.createRadialGradient(centre, centre, r * GLOW.inner, centre, centre, r * GLOW.outer);
            glow.addColorStop(0, withAlpha(atmosphere, GLOW.alpha));
            glow.addColorStop(1, withAlpha(atmosphere, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(centre, centre, r * GLOW.outer, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(planet, 0, 0);
            for (const point of pointsNow) {
                const p = projectToMinimap(point.lat, point.lng, at, backing);
                if (!p.front) continue;
                ctx.fillStyle = point.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1.5, (point.radius ?? 0.25) * POINT_SCALE * DEG * r), 0, Math.PI * 2);
                ctx.fill();
            }
            if (markerNow && !reducedMotion) {
                const p = projectToMinimap(markerNow.lat, markerNow.lng, at, backing);
                if (p.front) {
                    const t = (now % ring.repeatMs) / ring.repeatMs;
                    ctx.strokeStyle = withAlpha(ring.color, 1 - t);
                    ctx.lineWidth = Math.max(1, backing / 110);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, t * ring.maxRadiusDeg * DEG * r, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            if (first) {
                first = false;
                setDrawn(true);
            }
            frame = requestAnimationFrame(paint);
        };
        frame = requestAnimationFrame(paint);
        return () => cancelAnimationFrame(frame);
    }, [textures, skin, orbit, nightFill, reducedMotion, ring, atmosphere]);

    const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const at = shownRef.current;
        if (!at) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const place = pickMinimap(((event.clientX - rect.left) / rect.width) * SIZE, ((event.clientY - rect.top) / rect.height) * SIZE, SIZE, at);
        if (place) onPick(place);
    };

    return (
        <div className={styles.flatMinimap} data-testid="tiny-globe-flat">
            {!drawn && (
                <MinimapStill
                    color={stillColor}
                    why={failed ? 'The minimap could not read its maps.' : 'Loading the minimap'}
                    reducedMotion={reducedMotion || failed}
                    className={styles.underlay}
                />
            )}
            <canvas
                ref={canvasRef}
                className={styles.fadeIn}
                style={{ width: SIZE, height: SIZE, opacity: drawn ? 1 : 0 }}
                onClick={handleClick}
                onPointerEnter={() => orbit.hover(true, performance.now())}
                onPointerLeave={() => orbit.hover(false, performance.now())}
                title="Click to fly the main globe here"
            />
        </div>
    );
};
