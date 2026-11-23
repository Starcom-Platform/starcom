/**
 * What an observer on the ground can see of the bodies (plan D5): those above their horizon, the plane through the eye
 * square to its own up, which on the globe is the line from the Earth's centre through the eye. The Earth itself is
 * under their feet and never named.
 */
import * as THREE from 'three';
import type { LabelledBody } from '../bodyLabels';

const toward = new THREE.Vector3();
const up = new THREE.Vector3();

export function aboveHorizon<T extends Pick<LabelledBody, 'id' | 'position'>>(bodies: readonly T[], eye: THREE.Vector3): T[] {
  up.copy(eye).normalize();
  return bodies.filter((body) => body.id !== 'earth' && toward.subVectors(body.position, eye).dot(up) > 0);
}
