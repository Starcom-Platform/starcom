/**
 * What the pointer reads over the weather (decision D-W): one line for every
 * field on show at a place: temperature or rain, then wind, then cloud, with each source
 * named once. The heat map's shell and the wind's both answer a hover with
 * it, so whichever the ray meets first, the reading is the same.
 */
import * as THREE from 'three';
import { globeWorldToLatLng } from '../../../utils/globeCoordinates';

export type WeatherFieldKey = 'temperature' | 'rain' | 'wind' | 'clouds';
export interface WeatherPart {
  /** The value, as a person reads it: "21.0 °C", "wind 36.0 km/h from the W". */
  value: string;
  /** Where it comes from and the hour it holds for. */
  source: string;
}
type Reader = (lat: number, lng: number) => WeatherPart | null;

const ORDER: WeatherFieldKey[] = ['temperature', 'rain', 'wind', 'clouds'];
const readers = new Map<WeatherFieldKey, Reader>();

/** A field on show says how to read it at a place; null when it is taken off. */
export function setWeatherReader(key: WeatherFieldKey, reader: Reader | null): void {
  if (reader) readers.set(key, reader);
  else readers.delete(key);
}

/** Every field on show, read at a place; null when none is on or none has a value there. */
export function weatherReadingAt(lat: number, lng: number): string | null {
  const parts = ORDER.map((key) => readers.get(key)?.(lat, lng) ?? null).filter((p): p is WeatherPart => p !== null);
  if (!parts.length) return null;
  const sources = [...new Set(parts.map((p) => p.source))];
  return `${parts.map((p) => p.value).join(' · ')} · ${sources.join('; ')}`;
}

/**
 * Makes an object a weather surface for the pointer: a ray meets it where it
 * crosses a sphere of this radius, near side first (not by testing its
 * triangles or segments on every move), and the hover reads every field on
 * show there.
 */
export function answerHoversAsSphere(object: THREE.Object3D, radius: number): void {
  const sphere = new THREE.Sphere(new THREE.Vector3(), radius);
  const hit = new THREE.Vector3();
  object.raycast = (raycaster, intersects) => {
    if (!raycaster.ray.intersectSphere(sphere, hit)) return;
    const distance = raycaster.ray.origin.distanceTo(hit);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: hit.clone(), object });
  };
  object.userData.readAt = (point: THREE.Vector3) => {
    const { lat, lng } = globeWorldToLatLng(point);
    return weatherReadingAt(lat, lng);
  };
}
