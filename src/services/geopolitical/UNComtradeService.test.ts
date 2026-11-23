import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RealTradeRoute } from './UNComtradeService';

describe('trade-routes-baked.json — real UN Comtrade data (checked directly from disk, not mocked)', () => {
  function loadBakedRoutes(): RealTradeRoute[] {
    const raw = readFileSync(join(__dirname, '../../../public/geopolitical/trade-routes-baked.json'), 'utf-8');
    return (JSON.parse(raw) as { routes: RealTradeRoute[] }).routes;
  }

  it('is real, well-formed, and every route has a positive real trade value', () => {
    const routes = loadBakedRoutes();
    expect(routes.length).toBeGreaterThan(5);
    routes.forEach((route) => {
      expect(route.from).toMatch(/^[A-Z]{3}$/);
      expect(route.to).toMatch(/^[A-Z]{3}$/);
      expect(route.value).toBeGreaterThan(0);
    });
  });

  it('includes the real, well-known Australia -> China iron ore relationship, correctly one of the largest flows here', () => {
    const routes = loadBakedRoutes();
    const ausChn = routes.find((r) => r.from === 'AUS' && r.to === 'CHN');
    expect(ausChn).toBeDefined();
    // Real-world sanity check: Australia->China iron ore is one of the world's largest
    // bilateral trade relationships by value; should be the largest or near-largest here.
    const maxValue = Math.max(...routes.map((r) => r.value));
    expect(ausChn!.value).toBe(maxValue);
  });

  it('has no duplicate route ids', () => {
    const routes = loadBakedRoutes();
    const ids = routes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
