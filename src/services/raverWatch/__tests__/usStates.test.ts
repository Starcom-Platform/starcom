/**
 * The US state outlines Raver Watch draws a state's alert as (decision RW4):
 * Natural Earth's admin-1 set at 1:50m, cut to the 50 states and DC by
 * scripts/build-us-states.mjs, and served by Starcom, never a third party.
 * The manifest's digest is a provenance claim, so it is held true here.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { usStatesFrom, loadUsStates, US_STATE_CODE, resetUsStatesForTests } from '../usStates';

const PUBLIC = resolve(__dirname, '../../../../public/geopolitical');
const file = readFileSync(resolve(PUBLIC, 'us-states-50m.geojson'), 'utf8');

afterEach(() => { resetUsStatesForTests(); vi.unstubAllGlobals(); });

describe('the US states Starcom serves', () => {
  it('are the 50 states and DC, each by the code Raver Watch uses and its name', () => {
    const states = usStatesFrom(JSON.parse(file));
    expect(states.size).toBe(51);
    for (const [code, state] of states) {
      expect(code).toMatch(US_STATE_CODE);
      expect(state.name.length).toBeGreaterThan(0);
    }
    expect(states.get('us-tx')?.name).toBe('Texas');
    expect(states.get('us-dc')).toBeTruthy();
  });

  it('are the bytes the manifest says they are', () => {
    const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.json'), 'utf8')) as { datasets: Array<{ file: string; sha256: string }> };
    const entry = manifest.datasets.find((d) => d.file === 'us-states-50m.geojson');
    expect(entry?.sha256).toBe(createHash('sha256').update(file).digest('hex'));
  });

  it('are fetched once, from Starcom itself, and a failed fetch is tried again', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(file, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadUsStates()).toBeUndefined();
    const states = await loadUsStates();
    await loadUsStates();
    expect(states?.size).toBe(51);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/geopolitical/us-states-50m.geojson');
  });
});
