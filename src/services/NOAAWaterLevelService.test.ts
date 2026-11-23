import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NOAAWaterLevelService } from './NOAAWaterLevelService';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

const stationsResponse = (stations: Array<{ id: string; name: string; lat: number; lng: number; state?: string }>) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ count: stations.length, stations })
});

const readingResponse = (id: string, name: string, lat: string, lon: string, value: string, t: string) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ metadata: { id, name, lat, lon }, data: [{ t, v: value, s: '0.1', f: '1,0,0,0', q: 'p' }] })
});

describe('NOAAWaterLevelService', () => {
  let service: NOAAWaterLevelService;

  beforeEach(() => {
    service = new NOAAWaterLevelService();
    mockFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('maps real station metadata + a real per-station reading into a combined result', async () => {
    mockFetch.mockResolvedValueOnce(stationsResponse([
      { id: '8518750', name: 'The Battery', lat: 40.7006, lng: -74.0142, state: 'NY' }
    ]));
    mockFetch.mockResolvedValueOnce(readingResponse('8518750', 'The Battery', '40.7006', '-74.0142', '0.177', '2026-08-14 21:24'));

    const result = await service.getCurrentReadings();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        station: { id: '8518750', name: 'The Battery', lat: 40.7006, lng: -74.0142, state: 'NY' },
        waterLevelM: 0.177,
        timestamp: '2026-08-14 21:24'
      }
    ]);
  });

  it('drops a station whose real reading fetch fails, keeping the others', async () => {
    mockFetch.mockResolvedValueOnce(stationsResponse([
      { id: '1', name: 'A', lat: 1, lng: 1 },
      { id: '2', name: 'B', lat: 2, lng: 2 }
    ]));
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) });
    mockFetch.mockResolvedValueOnce(readingResponse('2', 'B', '2', '2', '1.0', '2026-08-14 21:00'));

    const result = await service.getCurrentReadings();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].station.id).toBe('2');
  });

  it('caches readings and does not re-fetch within the TTL', async () => {
    mockFetch.mockResolvedValueOnce(stationsResponse([{ id: '1', name: 'A', lat: 1, lng: 1 }]));
    mockFetch.mockResolvedValueOnce(readingResponse('1', 'A', '1', '1', '0.5', '2026-08-14 21:00'));

    await service.getCurrentReadings();
    const callsAfterFirst = mockFetch.mock.calls.length;
    await service.getCurrentReadings();

    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it('returns a graceful failure result when the real station list fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve(null) });

    const result = await service.getCurrentReadings();

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });
});
