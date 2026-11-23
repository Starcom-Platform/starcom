/**
 * Which place a click on Diplomacy's marks picked (D-DP, DP8): the mark nearest the pointer among
 * those the ray passed close to, on the side of the globe facing the camera. A Points hit carries
 * the index of the mark; each object holds its places' keys in the same order.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { placeKeyAtHits, withinItsMark } from '../diplomaticPick';

const object = (keys: string[]) => Object.assign(new THREE.Points(), { userData: { placeKeys: keys } });
const camera = new THREE.Vector3(0, 0, 300);
const hit = (o: THREE.Object3D, index: number, distanceToRay: number, z = 100) =>
  ({ object: o, index, distanceToRay, point: new THREE.Vector3(0, 0, z), distance: 200 }) as THREE.Intersection;

describe('the place a click picked', () => {
  const marks = object(['moscow', 'kyiv', 'london']);

  it('is the mark nearest the pointer', () => {
    expect(placeKeyAtHits([hit(marks, 0, 2), hit(marks, 2, 0.5), hit(marks, 1, 1)], camera)).toBe('london');
  });

  it('is never a mark the camera cannot see', () => {
    expect(placeKeyAtHits([hit(marks, 2, 0.1, -100), hit(marks, 1, 1)], camera)).toBe('kyiv');
    expect(placeKeyAtHits([hit(marks, 2, 0.1, -100)], camera)).toBeNull();
  });

  it('is none where the ray passed no mark of this layer', () => {
    expect(placeKeyAtHits([], camera)).toBeNull();
    expect(placeKeyAtHits([hit(new THREE.Points(), 0, 0)], camera)).toBeNull();
  });
});

/*
 * A click must land on what is drawn (found on the build): a flat 12 px took clicks 12 px from an 8 px
 * mark, so the country beside a small place could not be picked, and nothing under the pointer said why.
 */
describe('a hit within its own mark', () => {
  const sized = (sizes: number[]) => {
    const points = new THREE.Points(new THREE.BufferGeometry());
    points.geometry.setAttribute('pointSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
    return points;
  };
  const marks = sized([8, 20]);
  const at = (index: number, distanceToRay: number) => ({ object: marks, index, distanceToRay, point: new THREE.Vector3(), distance: 1 }) as THREE.Intersection;

  it('is one the pointer came within the mark\'s own radius of, and a little slop', () => {
    // At 0.5 world units a pixel: the small mark reaches 4 px + 2, the large 10 px + 2.
    expect(withinItsMark(at(0, 2.9), 0.5)).toBe(true);
    expect(withinItsMark(at(0, 3.5), 0.5)).toBe(false);
    expect(withinItsMark(at(1, 5.9), 0.5)).toBe(true);
  });
});
