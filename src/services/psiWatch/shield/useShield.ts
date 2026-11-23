/**
 * The magnetic shield at the cursor (decision D-PW, PW58), shared by the globe's layer and the panel: IGRF-14 and the
 * poles' tracks read once a visit while the layer shows, the grid's lines found once a year and kept for the last few
 * years seen, the poles moved with the cursor between their yearly points. IGRF-14 holds 1900 to 2025 and forecasts to
 * 2030: a cursor outside is drawn at the nearer end, and said so.
 */
import { useEffect, useMemo, useState } from 'react';
import { decimalYear, poleAt, shieldAt, type Shield, type ShieldData } from './shield';

export const SHIELD_DATA_URL = '/data/psi-igrf14.json';
/** The years IGRF-14 holds: its first epoch, its last, and the end of its forecast. */
export const FIRST_YEAR = 1900;
export const LAST_EPOCH = 2025;
export const LAST_YEAR = 2030;

let data: Promise<ShieldData | null> | null = null;
/** IGRF-14 and the poles' tracks, read once a visit; a failed read is tried again next time. */
export const loadShieldData = (): Promise<ShieldData | null> => (data ??= fetch(SHIELD_DATA_URL)
  .then((r) => (r.ok ? r.json() as Promise<ShieldData> : null))
  .catch(() => null)
  .then((d) => { if (!d) data = null; return d; }));

const KEPT = 4;
const byYear = new Map<number, Shield>();
/** A whole year's shield, found at mid-year; the last few kept, so the layer and the panel find it once. */
export function shieldForYear(d: ShieldData, year: number): Shield {
  const kept = byYear.get(year);
  if (kept) return kept;
  const shield = shieldAt(d, year + 0.5);
  byYear.set(year, shield);
  if (byYear.size > KEPT) byYear.delete(byYear.keys().next().value as number);
  return shield;
}

export const resetShieldForTests = (): void => { data = null; byYear.clear(); };

export interface ShieldAtCursor {
  shield: Shield;
  /** The year drawn: the cursor's, held to IGRF-14's span. */
  year: number;
  /** Whole years, for the lines and the words. */
  wholeYear: number;
  /** Where the cursor stood against that span: inside, before 1900, after 2030; and whether the year is forecast. */
  clamped: 'before' | 'after' | null;
  forecast: boolean;
  poles: { north: { lat: number; lon: number }; south: { lat: number; lon: number } };
}

/** The year drawn for a cursor: held to IGRF-14's span, to a hundredth of a year (the poles move a few hundred metres in that). */
export function shieldYear(cursorMs: number): Pick<ShieldAtCursor, 'year' | 'wholeYear' | 'clamped' | 'forecast'> {
  const cursorYear = decimalYear(cursorMs);
  const year = Math.round(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, cursorYear)) * 100) / 100;
  return {
    year,
    wholeYear: Math.floor(year),
    clamped: cursorYear < FIRST_YEAR ? 'before' : cursorYear >= LAST_YEAR + 1 ? 'after' : null,
    forecast: year > LAST_EPOCH,
  };
}

export interface ShieldState {
  /** The shield at the cursor; null while IGRF-14 is read, or when it could not be. */
  at: ShieldAtCursor | null;
  /** IGRF-14 could not be read: tried again when the layer is next turned on. */
  failed: boolean;
}

export function useShield(active: boolean, cursorMs: number): ShieldState {
  const [loaded, setLoaded] = useState<ShieldData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active || loaded) return undefined;
    let live = true;
    setFailed(false);
    void loadShieldData().then((d) => { if (!live) return; if (d) setLoaded(d); else setFailed(true); });
    return () => { live = false; };
  }, [active, loaded]);
  const { year, wholeYear, clamped, forecast } = shieldYear(cursorMs);
  const shield = useMemo(() => (active && loaded ? shieldForYear(loaded, wholeYear) : null), [active, loaded, wholeYear]);
  const at = useMemo(() => (shield && loaded ? {
    shield, year, wholeYear, clamped, forecast,
    poles: { north: poleAt(loaded.poles.north, year), south: poleAt(loaded.poles.south, year) },
  } : null), [shield, loaded, year, wholeYear, clamped, forecast]);
  return { at, failed: active && failed };
}
