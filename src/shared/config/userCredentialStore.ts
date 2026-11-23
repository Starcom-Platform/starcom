/**
 * API credentials supplied by the person using the app, held in their browser.
 *
 * Every `VITE_*` value is compiled into the shipped bundle. That is not a
 * configuration mistake to tighten up — it is what the mechanism does, and it
 * means a build-time secret in a static site is not a secret at all. Verified:
 * a config key string is present, in plain text, in two files under `dist/`.
 *
 * So a key either belongs to the person using the app, or it does not belong in
 * the client. This holds the first kind.
 *
 * WHAT THIS IS NOT FOR. A credential that grants CONTROL — a bot token, a
 * storage write token — must not be here either. Moving those from one baked-in
 * value to one-per-user does not reduce the exposure, it multiplies it: instead
 * of one published secret there are many, each pasted into a web page by
 * someone who was told it was safe. Those need a server or they need to not
 * exist. See `CONTROL_GRANTING` below, which refuses them.
 */

const STORAGE_KEY = 'starcom_user_api_credentials_v1';

/**
 * Providers whose credentials confer the ability to ACT, not merely to read.
 *
 * Refused by construction rather than by documentation, because the whole
 * failure mode here is a plausible-looking place to put a secret.
 */
const CONTROL_GRANTING = new Set(['telegram', 'discord', 'web3storage']);

export type CredentialSource = 'user' | 'build' | 'none';

export interface ResolvedCredential {
  value: string | null;
  /**
   * Where it came from.
   *
   * Surfaced rather than hidden so a caller can tell an operator's shared quota
   * from the user's own, and so a UI can say which — the same rule the rest of
   * this codebase applies to mock data and derived weight: never render a value
   * without its provenance.
   */
  source: CredentialSource;
}

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Validated, not trusted: this is user-writable storage.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim() !== ''),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function write(all: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota or private-mode failure. The key simply does not persist; the
    // caller finds out by reading back nothing rather than by an exception in
    // an unrelated place.
  }
}

/**
 * Dispatched on window, detail `{ providerId }`, when a credential is saved or
 * cleared in this tab. A key read per request is picked up by the NEXT request;
 * a feature that polls every few minutes needs to know there is one to make
 * now, or a key typed into the provider panel appears to do nothing.
 */
export const CREDENTIALS_CHANGED_EVENT = 'starcom:credentials-changed';

function announce(providerId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CREDENTIALS_CHANGED_EVENT, { detail: { providerId } }));
}

/** True when this provider's credential may be held client-side at all. */
export function mayHoldClientSide(providerId: string): boolean {
  return !CONTROL_GRANTING.has(providerId.toLowerCase());
}

/**
 * Store a credential for a provider.
 *
 * Returns false, and stores nothing, for a control-granting provider. A silent
 * success there would be the worst outcome: the person believes their token is
 * held safely and it is in a static page's storage.
 */
export function setUserCredential(providerId: string, value: string): boolean {
  if (!mayHoldClientSide(providerId)) return false;
  const trimmed = value.trim();
  const all = read();
  if (trimmed === '') delete all[providerId];
  else all[providerId] = trimmed;
  write(all);
  announce(providerId);
  return true;
}

export function clearUserCredential(providerId: string): void {
  const all = read();
  delete all[providerId];
  write(all);
  announce(providerId);
}

/** Provider ids the user has supplied a credential for. Never the values. */
export function listConfiguredProviders(): string[] {
  return Object.keys(read()).sort();
}

/**
 * The credential to use, and where it came from.
 *
 * User first, then the build-time value. The order matters: a person who has
 * gone to the trouble of supplying their own key should get their own quota
 * and their own rate limit, not silently ride on an operator's.
 *
 * `buildTimeValue` is passed in rather than read here, so this module never
 * has to know which `VITE_` name belongs to which provider — and so the
 * build-time path can be removed provider by provider without touching this.
 */
export function resolveCredential(providerId: string, buildTimeValue?: string): ResolvedCredential {
  const mine = read()[providerId];
  if (mine) return { value: mine, source: 'user' };
  const built = buildTimeValue?.trim();
  if (built) return { value: built, source: 'build' };
  return { value: null, source: 'none' };
}
