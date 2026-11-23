/**
 * The native host, detected — the one join between this app and starcom-desktop.
 *
 * ─── WHY A MODULE AND NOT AN INLINE CHECK ──────────────────────────────────
 *
 * `window.starcomNative` is a global that exists in one build and not the
 * other. Reading it at each call site would spread an untyped `any` and an
 * implicit assumption through the codebase, and would make "does the web build
 * still work" a question nobody could answer without grepping.
 *
 * More importantly: the desktop host shipped five capabilities that NOTHING in
 * this application called. Every one typechecked, every one was covered by its
 * own smoke suite, and every one had no reachable trigger — which is precisely
 * the defect class `src/services/intel/pipeline/pipeline.ts` exists to record.
 * This module is the join that was missing, and it is declared there so the
 * guard can insist a capability has a consumer instead of trusting that it does.
 *
 * ─── DEGRADING HONESTLY ────────────────────────────────────────────────────
 *
 * Absence is the normal case: the web build is the front door and always will
 * be. So nothing here throws on absence, and nothing silently substitutes a
 * weaker result for a stronger one. A caller asks whether a capability is
 * present and takes a different, stated path when it is not — the alternative,
 * a fallback that quietly changes what a measurement means, is how a proxy's
 * headers came to be reported as a target's.
 */

export interface NativeFetchRequest {
  url: string;
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  capture?: boolean;
}

export interface NativeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  /** The TARGET's headers. Unobtainable in the web build at any price. */
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
  redirects: string[];
  elapsedMs: number;
  bytes: number;
  truncated: boolean;
  evidence?: { recordId: string; bodyDigest: string };
}

export interface NativePortResult {
  port: number;
  open: boolean;
  elapsedMs: number;
  outcome: 'open' | 'refused' | 'timeout' | 'unreachable' | 'error';
  banner?: string;
}

export interface NativeCertificate {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: string;
  validTo: string;
  subjectAltNames: string[];
  serialNumber: string;
  fingerprint256: string;
  daysUntilExpiry: number;
}

export interface NativeTlsResult {
  host: string;
  port: number;
  protocol: string | null;
  cipher: { name: string; version: string } | null;
  chain: NativeCertificate[];
  authorized: boolean;
  authorizationError?: string;
  elapsedMs: number;
}

export interface NativeCapture {
  recordId: string;
  url: string;
  title: string;
  /** name -> sha256. `html` and `text` always; `screenshot` when obtainable. */
  artifacts: Record<string, string>;
  observationCount: number;
  thirdPartyHosts: string[];
  /** Set when the screenshot could not be taken; the record still stands. */
  screenshotError?: string;
}

export interface NativeEvidenceIntegrity {
  found: boolean;
  recordIntact: boolean;
  bodyIntact: boolean;
}

export interface NativeSignerStatus {
  ready: boolean;
  /** Hex ML-DSA-65 public key. Absent when not ready. */
  pubkey?: string;
  detail?: string;
}

/**
 * What the host signer will put a signature on.
 *
 * ─── WHY THIS IS A UNION AND NOT A STRING ──────────────────────────────────
 *
 * The host holds a CLOSED SET (`SIGNABLE_KINDS`, desktop/src/signer/entry.ts)
 * and refuses anything outside it, because "sign this object" is one step from
 * "sign these bytes". This union mirrors that set, so sending a kind the host
 * will refuse is a compile error here rather than a refusal a user discovers.
 *
 * `NativeFetchRequest['method']` above has always been written this way against
 * the host's own `ALLOWED_METHODS`. `sign` was typed `string`, and the gap cost
 * exactly what it was always going to: the app began sending 'retraction', the
 * host had never been told about it, and the withdrawal path — the only remedy
 * for a wrong published claim about a real person — stopped working on desktop
 * until someone read the allowlist.
 *
 * Keep it equal to the host's set. guard-native-capabilities asserts that it is.
 */
export type SignableKind =
  | 'finding'
  | 'mission-manifest'
  | 'refutation'
  | 'attested-claim'
  | 'retraction';

export interface NativeSignature {
  alg: 'ml-dsa-65';
  pubkey: string;
  sig: string;
  /**
   * The canonical string the signature actually covers.
   *
   * Returned so a caller can CHECK rather than assume. The signer
   * canonicalises independently — it must, or it would be signing opaque bytes
   * — and two implementations of one canonical form is exactly where a format
   * diverges quietly.
   */
  canonical: string;
}

export interface NativeInferenceStatus {
  available: boolean;
  endpoint: string;
  models: string[];
  detail?: string;
}

/**
 * Mirrors starcom-desktop's contextBridge surface.
 *
 * Declared rather than imported because the host is a separate package with its
 * own build. That is a drift risk and is named here so it is not a surprise:
 * the shapes below and `desktop/src/shared/ipc.ts` must be changed together.
 */
export interface StarcomNative {
  isNative: true;
  capabilities(): Promise<{ native: true; version: string; electron: string; capabilities: string[] }>;
  fetch(request: NativeFetchRequest): Promise<NativeFetchResponse>;
  tcpProbe(request: { host: string; ports: number[]; timeoutMs?: number; banner?: boolean }): Promise<{ host: string; results: NativePortResult[] }>;
  tlsInspect(request: { host: string; port?: number; timeoutMs?: number; servername?: string }): Promise<NativeTlsResult>;
  inference: {
    status(request?: { endpoint?: string }): Promise<NativeInferenceStatus>;
    generate(request: { model: string; prompt: string; system?: string; json?: boolean; temperature?: number; timeoutMs?: number }): Promise<{ text: string; model: string; elapsedMs: number; derivation: { promptDigest: string }; jsonParseError?: string }>;
  };
  signer: {
    status(): Promise<NativeSignerStatus>;
    sign(kind: SignableKind, content: Record<string, unknown>): Promise<NativeSignature>;
  };
  browse: {
    open(request: { url: string; investigationId?: string }): Promise<{ viewId: string; partition: string }>;
    navigate(request: { viewId: string; url: string }): Promise<boolean>;
    setBounds(request: { viewId: string; bounds: { x: number; y: number; width: number; height: number } }): Promise<boolean>;
    snapshot(viewId: string): Promise<{ url: string; title: string; text: string; html: string; capturedAt: string; loadError?: string } | null>;
    observations(viewId: string): Promise<Array<{ url: string; method: string; resourceType: string; statusCode?: number; thirdParty: boolean }> | null>;
    capture(viewId: string): Promise<NativeCapture>;
    close(viewId: string): Promise<boolean>;
  };
  evidence: {
    read(recordId: string): Promise<unknown>;
    verify(recordId: string): Promise<NativeEvidenceIntegrity>;
    list(): Promise<string[]>;
  };
}

declare global {
  interface Window {
    starcomNative?: StarcomNative;
  }
}

/**
 * The host, or null in a browser.
 *
 * Read on every call rather than cached at module load: a cached value taken
 * before the bridge is installed would report absent for the life of the
 * session, and the failure would look like a missing feature rather than a
 * timing bug.
 */
export function nativeHost(): StarcomNative | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.starcomNative;
  return candidate && candidate.isNative === true ? candidate : null;
}

export function isNativeHost(): boolean {
  return nativeHost() !== null;
}

/**
 * What to tell an operator when a capability is not present.
 *
 * One sentence, naming the capability and the reason, because "unavailable" on
 * its own invites the reader to assume a bug. The reason is a property of the
 * browser rather than of this application, and saying so is the difference
 * between an apology and information.
 */
export function requiresNativeHost(capability: string): string {
  return `${capability} needs the Starcom desktop host — a browser tab cannot do it.`;
}
