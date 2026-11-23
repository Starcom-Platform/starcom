/**
 * The Gravity slider pulls the graph toward its centre (critique audit of
 * 2026-10-01, section 7; plan block F, item 4). It was read by nothing: the
 * engine applied link, charge, centre and collision forces, and the slider
 * moved a number. A graph of unconnected reports drifted into an even disc
 * with nothing to gather it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { gravityForces } from '../gravity';

describe('gravityForces', () => {
  it('pull each node toward the centre, as strongly as the slider says', () => {
    const { x, y } = gravityForces(0.25, 800, 600);
    const node = { id: 'n' } as never;
    expect(x.x()(node, 0, [])).toBe(400);
    expect(y.y()(node, 0, [])).toBe(300);
    expect(x.strength()(node, 0, [])).toBe(0.25);
    expect(y.strength()(node, 0, [])).toBe(0.25);
  });
});
