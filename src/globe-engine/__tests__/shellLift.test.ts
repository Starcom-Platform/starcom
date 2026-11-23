/**
 * Every mark rides on the territories' raised shell (decision K5, TS1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GROUND_FIELD_ORDER,
  RAISED_SHELL_ORDER,
  groundField,
  groundUnderShell,
  liftForHeight,
  liftRiders,
  readAtLift,
  resetShellLiftForTest,
  ridesShell,
  shellLift,
  threeGlobeLayerGroup,
} from '../shellLift';
import { BASE_MAP } from '../../components/Globe/globeAltitudes';

afterEach(() => resetShellLiftForTest());

describe('the lift', () => {
  it('puts the base map\'s band on the shell, and never lowers anything', () => {
    expect(liftForHeight(3.5) * 100 * BASE_MAP).toBeCloseTo(103.5, 9);
    expect(liftForHeight((BASE_MAP - 1) * 100)).toBe(1);
    expect(liftForHeight(0)).toBe(1);
    expect(liftForHeight(Number.NaN)).toBe(1);
  });

  it('scales the riders the scene holds, and leaves the ground, the sky and the rest where they are', () => {
    const scene = new THREE.Scene();
    const rider = ridesShell(new THREE.Group());
    const ground = groundField(new THREE.Group());
    const sky = new THREE.Group();
    scene.add(rider, ground, sky);
    liftRiders(scene, 1.03);
    expect(rider.scale.toArray()).toEqual([1.03, 1.03, 1.03]);
    expect(ground.scale.x).toBe(1);
    expect(sky.scale.x).toBe(1);
    expect(shellLift()).toBe(1.03);
    liftRiders(scene, 1);
    expect(rider.scale.x).toBe(1);
    expect(shellLift()).toBe(1);
  });

  it('reaches the render it is set for: the world matrix carries the lift at once', () => {
    // three.js updates world matrices before the scene's onBeforeRender, where the lift is set.
    const scene = new THREE.Scene();
    const rider = ridesShell(new THREE.Group());
    const mark = new THREE.Object3D();
    mark.position.set(0, 0, 101);
    rider.add(mark);
    scene.add(rider);
    scene.updateMatrixWorld(true);
    liftRiders(scene, 1.03);
    expect(new THREE.Vector3().setFromMatrixPosition(mark.matrixWorld).z).toBeCloseTo(104.03, 6);
    liftRiders(scene, 1);
    expect(new THREE.Vector3().setFromMatrixPosition(mark.matrixWorld).z).toBeCloseTo(101, 6);
  });

  it('keeps a rider\'s own turn: the scale composes with it rather than replacing the matrix', () => {
    const scene = new THREE.Scene();
    const rider = ridesShell(new THREE.Group());
    rider.rotation.y = -Math.PI / 2;
    scene.add(rider);
    liftRiders(scene, 1.03);
    expect(rider.rotation.y).toBeCloseTo(-Math.PI / 2);
  });

  it('lifts a root a layer replaced since the last render, at the next one', () => {
    const scene = new THREE.Scene();
    liftRiders(scene, 1.03);
    const replaced = ridesShell(new THREE.Group());
    scene.add(replaced);
    liftRiders(scene, 1.03);
    expect(replaced.scale.x).toBe(1.03);
  });
});

describe('reading the scene at a card\'s lift', () => {
  it('holds every rider at the lift asked for while it reads, and puts back the screen\'s after, even if the read throws', () => {
    const scene = new THREE.Scene();
    const rider = ridesShell(new THREE.Group());
    scene.add(rider);
    liftRiders(scene, 1.03);
    const seen = readAtLift(scene, 1, () => rider.matrixWorld.elements[0]);
    expect(seen).toBeCloseTo(1, 9);
    expect(rider.scale.x).toBe(1.03);
    expect(shellLift()).toBe(1.03);
    expect(() => readAtLift(scene, 1, () => { throw new Error('unreadable'); })).toThrow('unreadable');
    expect(rider.scale.x).toBe(1.03);
  });
});

describe('reading the scene when nothing is raised', () => {
  it('touches no rider, so a scene that is not three.js\'s own can be read', () => {
    const notAScene = {} as THREE.Scene;
    expect(readAtLift(notAScene, 1, () => 'read')).toBe('read');
  });
});

describe('the draw order', () => {
  it('draws the ground fields, then a raised shell, then everything at 0 or above', () => {
    expect(GROUND_FIELD_ORDER).toBeLessThan(RAISED_SHELL_ORDER);
    expect(RAISED_SHELL_ORDER).toBeLessThan(0);
    expect(groundField(new THREE.Group()).renderOrder).toBe(GROUND_FIELD_ORDER);
  });
});

describe('three-globe\'s arcs and rings', () => {
  /** A root as three-globe 2.44 builds it: fifteen layer groups, the Earth in the first. */
  function threeGlobe(arcs: string[] = ['arc'], rings: string[] = ['ring']) {
    const root = new THREE.Group();
    for (let i = 0; i < 15; i++) root.add(new THREE.Group());
    const earth = Object.assign(new THREE.Group(), { __globeObjType: 'globe' });
    root.children[0].add(earth);
    for (const type of arcs) root.children[2].add(Object.assign(new THREE.Group(), { __globeObjType: type }));
    for (const type of rings) root.children[10].add(Object.assign(new THREE.Group(), { __globeObjType: type }));
    return root;
  }

  it('rise with the riders, the Earth and three-globe\'s root staying where they are', () => {
    const scene = new THREE.Scene();
    const root = threeGlobe();
    scene.add(root);
    liftRiders(scene, 1.03);
    expect(root.children[2].scale.x).toBe(1.03);
    expect(root.children[10].scale.x).toBe(1.03);
    expect(root.scale.x).toBe(1);
    expect(root.children[0].scale.x).toBe(1);
  });

  it('are left alone where their place holds anything else, rather than moving a stranger', () => {
    const scene = new THREE.Scene();
    const root = threeGlobe(['path'], ['label']);
    scene.add(root);
    expect(threeGlobeLayerGroup(scene, 'arcs')).toBeNull();
    liftRiders(scene, 1.03);
    expect(root.children[2].scale.x).toBe(1);
    expect(root.children[10].scale.x).toBe(1);
  });

  it('are found where three-globe puts them: its layer order is the one shellLift.ts counts on', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../node_modules/three-globe/dist/three-globe.mjs'), 'utf8');
    const listed = /var layers = \[([^\]]+)\]/.exec(source)?.[1] ?? '';
    const layers = listed.split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(layers.indexOf('arcsLayer')).toBe(2);
    expect(layers.indexOf('ringsLayer')).toBe(10);
  });
});

describe('what a pointer points at', () => {
  const camera = new THREE.Vector3(0, 0, 400);
  const rayTo = (target: THREE.Vector3) => new THREE.Ray(camera.clone(), target.clone().sub(camera).normalize());

  it('is the ground hit itself when nothing is raised', () => {
    const hit = new THREE.Vector3(60, 0, 80);
    expect(groundUnderShell(rayTo(hit), hit)).toBe(hit);
  });

  it('is the place drawn under it on a raised shell: where the ray meets the shell, at the ground\'s radius', () => {
    const scene = new THREE.Scene();
    liftRiders(scene, liftForHeight(3.5));
    // A ray off to the side: it meets the raised shell before the ground.
    const hit = new THREE.Vector3(80, 0, 60);
    const ray = rayTo(hit);
    const shell = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 100 * shellLift()), new THREE.Vector3())!;
    const under = groundUnderShell(ray, hit);
    expect(under.length()).toBeCloseTo(100, 6);
    expect(under.clone().normalize().angleTo(shell.clone().normalize())).toBeCloseTo(0, 6);
    expect(under.angleTo(hit)).toBeGreaterThan(0.01);
  });
});

/*
 * Every file that puts something in the globe's scene says which it is, so a new
 * layer cannot be left under a raised shell by being forgotten. A rider marks its
 * root with ridesShell, a ground field with groundField; the sky and the rest are
 * named here with why.
 */
const ROLES: Record<string, 'rides' | 'ground' | 'sky' | 'places itself' | 'own scene' | 'registry' | 'debug'> = {
  'src/components/Globe/Globe.tsx': 'rides',
  'src/components/Globe/Hooks/useScreenMarkLayer.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiObserver.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeVolcanoCatalog.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeVolcanoPlumes.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeWaterGauges.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeEarthWeather.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeRegionMarks.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeGdacsGeometry.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeIntelSprites.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeIntelOutlines.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeRaverWatch.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeHeroWatch.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeAiWatch.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeCivilUnrest.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiLines.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeMagneticShield.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiModel.ts': 'rides',
  'src/geopolitical/hooks/useConflictEventMarks.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeEcoKindMarks.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeQuakePlates.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeQuakePings.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeWatchPings.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiZones.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiEchoes.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiFinder.ts': 'rides',
  'src/components/Globe/Hooks/useGlobePsiCalls.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeMissions.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeSafetyWindows.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeRosterOps.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeWarConflict.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeTourPing.ts': 'rides',
  'src/hooks/useCyberAttacks3D.ts': 'rides',
  'src/hooks/useCommHubs3D.ts': 'rides',
  // The geoelectric field is the layer's subject, so it rides over the fills, not under them (D-SW, step 1).
  'src/components/Globe/Hooks/useGlobeEField.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeAurora.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeHeatMap.ts': 'ground',
  'src/components/Globe/Hooks/useGlobeRain.ts': 'ground',
  'src/components/Globe/Hooks/useGlobeWindFlow.ts': 'ground',
  'src/components/Globe/Hooks/useGlobeRealClouds.ts': 'ground',
  'src/components/Globe/Hooks/useGlobeCloudLayer.ts': 'ground',
  // At their true orbits: a physical height, under or over the shell as it is.
  'src/components/Globe/Hooks/useGlobeSatellites.ts': 'sky',
  // The magnetosphere's field lines, traced through space at their true distances (D-SW, SW4).
  'src/components/Globe/Hooks/useGlobeFieldLines.ts': 'sky',
  // The Van Allen belts, a glow marched through space round the Earth (D-SW, SW5).
  'src/components/Globe/Hooks/useGlobeVanAllenBelts.ts': 'sky',
  // The cusps' lines and the bursts at the magnetopause, in space (D-SW, SW5).
  'src/components/Globe/Hooks/useGlobeCusps.ts': 'sky',
  // The magnetotail's current sheet, a surface down the night side (D-SW, SW5).
  'src/components/Globe/Hooks/useGlobeTailSheet.ts': 'sky',
  // The solar wind from the Sun, placed as the solar system is (D-SW, SW6).
  'src/components/Globe/Hooks/useGlobeHeliosphere.ts': 'sky',
  // Sky from a place's stars, figures, names and dome (plan D5): far beyond Neptune, or round the observer's eye.
  'src/components/Globe/Hooks/useGlobeSky.ts': 'sky',
  // The solar wind streaming past the magnetosphere, in space at its true scale (D-SW, SW17).
  'src/components/Globe/Hooks/useGlobeNearEarthFlow.ts': 'sky',
  'src/components/Globe/Hooks/useGlobeEnlil.ts': 'sky',
  'src/components/Globe/Hooks/useGlobeCmes.ts': 'sky',
  'src/solar-system/SolarSunManager.ts': 'sky',
  'src/solar-system/components/Planet.ts': 'sky',
  'src/solar-system/components/Moon.ts': 'sky',
  'src/solar-system/components/EarthOrbit.ts': 'sky',
  'src/solar-system/bodyLabels.ts': 'sky',
  'src/solar-system/effects/SolarActivityVisualizer.ts': 'sky',
  // Sets its own position each frame, so reads shellLift() rather than being scaled.
  'src/features/globe/rendering/useCursorTrail3D.ts': 'places itself',
  // Its own off-screen scene, whose proxies copy the fills' world matrices.
  'src/geopolitical/picking/IdPickingPass.ts': 'own scene',
  // Adds what the geopolitical layers build; they mark their own roots, below.
  'src/geopolitical/LayerRegistry.ts': 'registry',
  'src/geopolitical/hooks/useNationalTerritories3D.ts': 'rides',
  'src/geopolitical/hooks/useSimpleGeoOverlayLayer.ts': 'rides',
  'src/components/Globe/Hooks/useGlobeDebugTools.ts': 'debug',
};

function sourcesAdding(dir: string): string[] {
  const root = path.resolve(__dirname, '../../..');
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const next = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(next);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        if (/\bscene\??\.add\(|\.scene\(\)\.add\(/.test(fs.readFileSync(path.join(root, next), 'utf8'))) out.push(next);
      }
    }
  };
  walk(dir);
  return out;
}

describe('every layer says whether it rides the shell', () => {
  const root = path.resolve(__dirname, '../../..');
  const adding = ['src/components/Globe', 'src/hooks', 'src/geopolitical', 'src/features/globe', 'src/solar-system', 'src/globe-engine']
    .flatMap(sourcesAdding);

  it('names every file that adds to the scene', () => {
    expect(adding.filter((file) => !(file in ROLES))).toEqual([]);
  });

  it('marks a rider\'s root with ridesShell and a ground field\'s with groundField', () => {
    for (const [file, role] of Object.entries(ROLES)) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      if (role === 'rides') expect(source, file).toMatch(/ridesShell\(/);
      if (role === 'ground') expect(source, file).toMatch(/groundField\(/);
      if (role === 'places itself') expect(source, file).toMatch(/shellLift\(\)/);
    }
  });
});
