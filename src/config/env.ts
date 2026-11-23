/**
 * Typed, validated environment configuration.
 *
 * Central source of truth for all VITE_ environment variables.
 * Import `env` instead of reading `import.meta.env.VITE_*` directly.
 */

/**
 * These take the VALUE, not the key, and that is load-bearing.
 *
 * They used to read `import.meta.env[key]` with a computed key. Vite cannot
 * statically analyse that, so it inlined the ENTIRE env object into the
 * bundle — every VITE_ variable present at build time, whether or not any code
 * referenced it. A credential set on the deploy host therefore shipped to
 * every visitor without appearing anywhere in the source.
 *
 * That is not hypothetical. A Telegram bot token was served publicly from
 * production this way. `env.ts` never referenced it and no code used it; it
 * rode along inside the object this indirection forced Vite to emit.
 *
 * With static member access, Vite replaces only the specific references that
 * exist, and an unreferenced variable cannot reach the bundle at all.
 */
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v !== '' ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v !== 'string' || v === '') return fallback;
  return v === 'true' || v === '1';
}

/** All VITE_ environment variables, typed and validated. */
export const env = {
  // ── Analytics ──
  analyticsEnabled: bool(import.meta.env.VITE_ANALYTICS_ENABLED),
  gaMeasurementId: str(import.meta.env.VITE_GA_MEASUREMENT_ID),

  // ── Deployment / Build ──
  target: str(import.meta.env.VITE_TARGET, 'vercel') as 'vercel' | 'ipfs',
  routerMode: str(import.meta.env.VITE_ROUTER_MODE, 'browser') as 'browser' | 'hash',
  deploymentDebug: bool(import.meta.env.VITE_DEPLOYMENT_DEBUG),
  showStorageBadge: str(import.meta.env.VITE_SHOW_STORAGE_BADGE) !== 'false',
  demoMode: bool(import.meta.env.VITE_DEMO_MODE),
  /**
   * Renders correlation output (corroborated findings, contradictions) on the
   * globe.
   *
   * ON by default as of the honesty pass. The hold was conditional, and its
   * two stated conditions are met and verified:
   *
   *   - Provenance marking. Every mark carries isMock; every layer carries
   *     derivedFrom, algorithmVersion and blindSpots.
   *   - A truthful empty state. GlobeEmptyReason distinguishes nothing to
   *     analyse, analysis ran and nothing qualified, and results that could
   *     not be placed — rendered by GlobeIntelStatus, which speaks the shared
   *     disclosure vocabulary.
   *
   * A third condition nobody had written down was found and fixed first: the
   * analysis merge was not gated on the visualization mode, so marks would
   * have rendered over space weather and submarine cables, where a correlation
   * finding is indistinguishable from a geomagnetic reading.
   *
   * Set VITE_GLOBE_INTEL_LAYER=false to turn it off per-deployment.
   */
  globeIntelLayer: import.meta.env.VITE_GLOBE_INTEL_LAYER === undefined
    ? true
    : bool(import.meta.env.VITE_GLOBE_INTEL_LAYER),

  // ── API Keys ──
  /*
   * REMOVED: eiaApiKey, openWeatherMapApiKey, n2yoApiKey, alphaVantageApiKey.
   *
   * These four feeds are bring-your-own-key. Reading them here is what put
   * them in the bundle: Vite substitutes every `import.meta.env.VITE_*` it can
   * see, so merely NAMING the variable in this file compiles the value into
   * the JavaScript every visitor downloads. Verified — a build with
   * VITE_EIA_API_KEY set wrote that key in full into dist/assets/index-*.js.
   *
   * They were exempted in guard-bundle-secrets as "operator fallbacks", on the
   * reasoning that a public-interest map should not require every visitor to
   * register for a weather key. Defensible, but it described something that was
   * not happening: production never had these set, so the fallback did not
   * exist, nobody ever saw the data, and a set of invented constants in
   * useTopBarData stood in for it. The exemption permitted a leak in exchange
   * for a benefit nobody received.
   *
   * A single key shared by every visitor is also the exact pattern EIA's terms
   * describe blocking, and when it is blocked it fails for everyone at once.
   *
   * The keys now come from userCredentialStore only — the user's own, entered
   * in the provider panel, held in their browser. There is no build-time path,
   * which is why this comment replaces four lines instead of documenting them.
   */
  web3StorageToken: str(import.meta.env.VITE_WEB3_STORAGE_TOKEN),
  /*
   * REMOVED: telegramBotToken.
   *
   * VITE_* values are compiled into the shipped bundle, and a bot token grants
   * control of the bot. The widget now takes it from runtime config only, which
   * keeps it out of the build — see TelegramWidget for what that still does NOT
   * fix (Telegram puts the token in the URL path).
   */
  telegramChannelId: str(import.meta.env.VITE_TELEGRAM_CHANNEL_ID),
  /*
   * REMOVED: discordBotToken.
   *
   * Vite compiles VITE_* values into the shipped bundle, so a bot token here
   * was readable by anyone who opened devtools on the deployed site — and it
   * was additionally sent from every visitor's browser in an Authorization
   * header. A bot token grants CONTROL of the bot, not read access to a
   * member count.
   *
   * There is no client-side fix. A build-time secret in a static site is not a
   * secret, and asking each user for their own bot token would be worse. The
   * widget now uses Discord's public widget.json, which needs no credential
   * and gives the online count instead of the total.
   */

  // ── API URLs ──
  //
  // These defaulted to https://api.starcom.app/*, a host that does not
  // resolve. A default pointing at a dead host turns "not configured" into
  // "configured and failing", which reads as a transient outage rather than
  // the permanent absence it is — and each of these already has a working
  // direct open-data source in front of it.
  //
  // Undefined is the honest default: unset means unset.
  alertsApiUrl: str(import.meta.env.VITE_ALERTS_API_URL),
  spaceAssetsApiUrl: str(import.meta.env.VITE_SPACE_ASSETS_API_URL),
  reliefWebApiUrl: str(import.meta.env.VITE_RELIEF_WEB_API_URL),
  /** Optional CORS proxy prefix. Unset means requests go direct — see ProxyUtils. */
  corsProxyUrl: str(import.meta.env.VITE_CORS_PROXY_URL),
  /** UCDP now requires an access token; without one the source is not registered at all. */
  /*
   * REMOVED: ucdpAccessToken.
   *
   * Its only consumer was UCDPDataService, itself referenced nowhere but in
   * commented-out imports. UCDP moved to a static CC BY 4.0 asset deliberately
   * — a credential held by one person is exactly the single-operator
   * dependency the OSEE pillar's own test rejects — so the token had no
   * remaining purpose and was still being compiled into the bundle.
   */
  gdacsApiUrl: str(import.meta.env.VITE_GDACS_API_URL),
  geoEventsApiUrl: str(import.meta.env.VITE_GEO_EVENTS_API_URL),

  // ── Vite built-ins ──
  isDev: import.meta.env.DEV as boolean,
  isProd: import.meta.env.PROD as boolean,
  mode: import.meta.env.MODE as string,
} as const;


/**
 * The curated env map, for the few places that must look a value up BY KEY at
 * runtime (generic config loaders, validators).
 *
 * Every entry is a static member access, so Vite substitutes each one
 * individually and never emits the whole `import.meta.env` object. That makes
 * this an allowlist by construction: a variable absent from this map cannot
 * reach the bundle, which is the property that stops a credential set on the
 * deploy host from shipping to visitors merely because it exists.
 *
 * Adding a key here publishes it. That is the point of it being a list.
 *
 * Deliberately absent: VITE_EIA_API_KEY, VITE_OPENWEATHERMAP_API_KEY,
 * VITE_N2YO_API_KEY and VITE_ALPHA_VANTAGE_API_KEY. Those four feeds are
 * bring-your-own-key, so there is no build-time path to them by design —
 * listing one here would publish it to every visitor. VITE_ACLED_API_KEY has
 * always been absent for the same reason, which is the precedent.
 *
 * The consequence is intended: ApiConfigManager reports those providers
 * disabled, because without a user credential they are. The user's own key is
 * resolved separately, at each call site, through resolveCredential.
 */
export const rawEnv: Record<string, string | undefined> = {
  VITE_ALERTS_API_URL: import.meta.env.VITE_ALERTS_API_URL,
  VITE_ANALYTICS_ENABLED: import.meta.env.VITE_ANALYTICS_ENABLED,
  VITE_CORS_PROXY_URL: import.meta.env.VITE_CORS_PROXY_URL,
  VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
  VITE_DEPLOYMENT_DEBUG: import.meta.env.VITE_DEPLOYMENT_DEBUG,
  VITE_GA_MEASUREMENT_ID: import.meta.env.VITE_GA_MEASUREMENT_ID,
  VITE_GDACS_API_URL: import.meta.env.VITE_GDACS_API_URL,
  VITE_GEO_EVENTS_API_URL: import.meta.env.VITE_GEO_EVENTS_API_URL,
  VITE_GLOBE_INTEL_LAYER: import.meta.env.VITE_GLOBE_INTEL_LAYER,
  VITE_RELIEF_WEB_API_URL: import.meta.env.VITE_RELIEF_WEB_API_URL,
  VITE_ROUTER_MODE: import.meta.env.VITE_ROUTER_MODE,
  VITE_SHOW_STORAGE_BADGE: import.meta.env.VITE_SHOW_STORAGE_BADGE,
  VITE_SPACE_ASSETS_API_URL: import.meta.env.VITE_SPACE_ASSETS_API_URL,
  VITE_TARGET: import.meta.env.VITE_TARGET,
  VITE_TELEGRAM_CHANNEL_ID: import.meta.env.VITE_TELEGRAM_CHANNEL_ID,
  VITE_WEB3_STORAGE_TOKEN: import.meta.env.VITE_WEB3_STORAGE_TOKEN,
};
