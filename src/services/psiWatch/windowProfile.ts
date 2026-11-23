/**
 * A window's weight through time, the vocabulary PsiOps and RLSH share (Mecha Jono's kit v0, `schemas_psi.md` §1,
 * `vectors_psi.json` → `profile_weights`): how strongly an event's window holds at τ seconds from its anchor (a sky
 * event's exact moment, a recurrence window's anchor). Four kinds, as the wire carries them, every element a string:
 *
 * - `["profile","gauss_orb", h, cap, rate, accel]`: the orb runs rate·d + ½·accel·d² degrees (d = τ in days); the
 *   weight is 2^−(orb/h)² while |orb| is within the cap, on the span round exact, else 0.
 * - `["profile","past_boundary", h, cap, rate]`: 0 before exact; then the same curve over |rate|·d, to the cap.
 * - `["profile","rise_halflife", lead, peak, halfLife, end]` (minutes): 0 before −lead, rising straight to 1 at the
 *   peak, then halving every halfLife, 0 below 0.05 or past the end.
 * - `["profile","speed_fraction", half, cap]`: a station; no curve in v0, the window is drawn as a band.
 *
 * An unknown kind is drawn generically, as a band, never refused.
 */

export type ProfileKind = 'gauss_orb' | 'past_boundary' | 'rise_halflife' | 'speed_fraction';

export type Profile =
  | { kind: 'gauss_orb'; h: number; cap: number; rate: number; accel: number }
  | { kind: 'past_boundary'; h: number; cap: number; rate: number }
  | { kind: 'rise_halflife'; leadMin: number; peakMin: number; halfLifeMin: number; endMin: number }
  | { kind: 'band'; name: string };

const DAY_S = 86_400;
/** Below this, a rise-and-halve window has ended. */
export const RISE_HALFLIFE_FLOOR = 0.05;

/** A profile from its tag, or null when a number in it is not one. */
export function readProfile(tag: readonly string[]): Profile | null {
  if (tag[0] !== 'profile' || !tag[1]) return null;
  const n = tag.slice(2).map(Number);
  const numbers = (count: number) => n.length >= count && n.slice(0, count).every(Number.isFinite);
  switch (tag[1]) {
    case 'gauss_orb':
      return numbers(4) ? { kind: 'gauss_orb', h: n[0], cap: n[1], rate: n[2], accel: n[3] } : null;
    case 'past_boundary':
      return numbers(3) ? { kind: 'past_boundary', h: n[0], cap: n[1], rate: n[2] } : null;
    case 'rise_halflife':
      return numbers(4) ? { kind: 'rise_halflife', leadMin: n[0], peakMin: n[1], halfLifeMin: n[2], endMin: n[3] } : null;
    default:
      return { kind: 'band', name: tag[1] };
  }
}

const halving = (orb: number, h: number) => Math.pow(2, -((orb / h) ** 2));

/**
 * Where a quadratic orb first reaches the cap on one side of exact, in seconds (`side` 1 after, −1 before), or
 * Infinity when it never does.
 */
function capCrossing(rate: number, accel: number, cap: number, side: 1 | -1): number {
  // |rate·d + ½·accel·d²| = cap, for the smallest d of the side's sign.
  let best = Infinity;
  for (const target of [cap, -cap]) {
    const a = accel / 2;
    const roots: number[] = [];
    if (Math.abs(a) < 1e-15) {
      if (rate !== 0) roots.push(target / rate);
    } else {
      const disc = rate * rate + 4 * a * target;
      if (disc >= 0) roots.push((-rate + Math.sqrt(disc)) / (2 * a), (-rate - Math.sqrt(disc)) / (2 * a));
    }
    for (const d of roots) if (d * side > 0 && Math.abs(d) < best) best = Math.abs(d);
  }
  return best * DAY_S;
}

/** The span round the anchor where the weight is above zero, seconds [from, until]; a band has none of its own. */
export function profileSpan(profile: Profile): [number, number] | null {
  switch (profile.kind) {
    case 'gauss_orb':
      return [-capCrossing(profile.rate, profile.accel, profile.cap, -1), capCrossing(profile.rate, profile.accel, profile.cap, 1)];
    case 'past_boundary':
      return [0, profile.rate === 0 ? Infinity : (profile.cap / Math.abs(profile.rate)) * DAY_S];
    case 'rise_halflife': {
      // Halving past the peak falls below the floor after log2(1/floor) half-lives.
      const fade = profile.peakMin + profile.halfLifeMin * Math.log2(1 / RISE_HALFLIFE_FLOOR);
      return [-profile.leadMin * 60, Math.min(profile.endMin, fade) * 60];
    }
    default:
      return null;
  }
}

/**
 * The weight at τ seconds from the anchor, 0–1; null for a band, which has no curve. `capped: false` leaves the orb
 * curves (`gauss_orb`, `past_boundary`) uncut at the cap, for a window whose own edges bound them.
 */
export function profileWeight(profile: Profile, tau: number, { capped = true }: { capped?: boolean } = {}): number | null {
  switch (profile.kind) {
    case 'gauss_orb': {
      if (capped) {
        const [from, until] = profileSpan(profile)!;
        if (tau < from || tau > until) return 0;
      }
      const d = tau / DAY_S;
      return halving(profile.rate * d + 0.5 * profile.accel * d * d, profile.h);
    }
    case 'past_boundary': {
      if (tau < 0) return 0;
      const orb = (Math.abs(profile.rate) * tau) / DAY_S;
      return !capped || orb <= profile.cap ? halving(orb, profile.h) : 0;
    }
    case 'rise_halflife': {
      const minutes = tau / 60;
      if (minutes < -profile.leadMin || minutes > profile.endMin) return 0;
      if (minutes <= profile.peakMin) {
        const rise = profile.peakMin + profile.leadMin;
        return rise > 0 ? (minutes + profile.leadMin) / rise : 1;
      }
      const w = Math.pow(2, -(minutes - profile.peakMin) / profile.halfLifeMin);
      return w < RISE_HALFLIFE_FLOOR ? 0 : w;
    }
    default:
      return null;
  }
}

/** An event's window as its tags give it: the edges, the peak, the moment its τ counts from, and its profile. */
export interface EventWindow {
  from: number;
  peak: number;
  until: number;
  /** Unix seconds τ counts from: a sky event's `exact`, a recurrence window's `anchor`, else the peak. */
  anchor: number;
  profile: Profile | null;
}

/** An event's window from its tags, or null without a whole `window` tag. */
export function readWindow(tags: readonly (readonly string[])[]): EventWindow | null {
  const find = (name: string) => tags.find((tag) => tag[0] === name);
  const [from, peak, until] = (find('window') ?? []).slice(1, 4).map(Number);
  if (![from, peak, until].every(Number.isFinite) || from > until) return null;
  const profileTag = find('profile');
  const profile = profileTag ? readProfile(profileTag) : null;
  const exact = Number(find('exact')?.[1]);
  const anchorTag = Number(find('anchor')?.[1]);
  const anchor = Number.isFinite(anchorTag)
    ? anchorTag
    : Number.isFinite(exact)
      ? exact
      : profile?.kind === 'rise_halflife'
        ? from + profile.leadMin * 60
        : peak;
  return { from, peak, until, anchor, profile };
}

/**
 * The window's weight at a moment, unix seconds. The tag's edges bound it: they come from the sky itself, where the
 * profile is a curve fitted at exact (over a slow pair's six weeks the two part by hours). Null inside a band, which
 * has no curve; 0 outside the window.
 */
export function windowWeightAt(window: EventWindow, unix: number): number | null {
  if (unix < window.from || unix > window.until) return 0;
  if (!window.profile) return null;
  return profileWeight(window.profile, unix - window.anchor, { capped: false });
}

export const WINDOW_STATES = ['drafted', 'armed', 'live', 'closed'] as const;
export type WindowState = (typeof WINDOW_STATES)[number];

/**
 * The state to show (`schemas_rlsh.md` §1.2): the published state held to the viewer's clock, both ends inclusive.
 * An armed window shows live from its opening even if the publisher's update is late, any window closed a second
 * after its end, and a drafted one never goes live by the clock. A sky event has no published state: the clock
 * alone decides. Null for a state the kit does not name, which is refused (`unknown-window-state`).
 */
export function shownState(published: string | undefined, from: number, until: number, now: number): WindowState | null {
  if (published !== undefined && !(WINDOW_STATES as readonly string[]).includes(published)) return null;
  if (published === 'closed' || now > until) return 'closed';
  if (published === 'drafted') return 'drafted';
  return now < from ? 'armed' : 'live';
}

/** An age as the words say it: just now, minutes, hours, or days. */
export type Age = { unit: 'now' } | { unit: 'minutes' | 'hours' | 'days'; n: number };

/** How old something is, from its age in seconds. */
export function ageOf(seconds: number): Age {
  if (seconds < 60) return { unit: 'now' };
  if (seconds < 3600) return { unit: 'minutes', n: Math.floor(seconds / 60) };
  if (seconds < 48 * 3600) return { unit: 'hours', n: Math.floor(seconds / 3600) };
  return { unit: 'days', n: Math.floor(seconds / 86_400) };
}

/** The window's curve, sampled evenly from its start to its end: [unix, weight] pairs, a band's weights null. */
export function windowCurve(window: EventWindow, samples = 160): [number, number | null][] {
  const span = window.until - window.from;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = window.from + (span * i) / samples;
    return [t, windowWeightAt(window, t)];
  });
}
