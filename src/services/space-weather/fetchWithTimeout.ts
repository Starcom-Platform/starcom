// fetchWithTimeout.ts — a plain `fetch()` with no timeout hangs forever if
// the server accepts the connection but never responds (a real, common
// failure mode for public APIs under load, not a hypothetical). Originally
// this pattern existed only inline in SpaceWeatherLive.ts (guarding the
// solar-wind endpoints) — NOAAGeomagneticService.ts's two fetch() calls had
// no equivalent guard, so a hung Kp endpoint would hang not just the Kp
// reading but everything downstream of it: the geomagnetic-index shell,
// the aurora oval (both keyed off the same fetchLiveKpSnapshot call in
// GlobeEngine.ts), and the HUD panel's forecast/risk readouts. Extracted
// here so every NOAA caller shares one timeout implementation instead of
// each guarding (or forgetting to guard) independently.
export interface TimeoutFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<TimeoutFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { ok: res.ok, status: res.status, json: () => res.json() };
  } finally {
    clearTimeout(timeout);
  }
}
