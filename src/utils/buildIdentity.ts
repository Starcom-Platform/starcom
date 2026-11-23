/**
 * Which build is this.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The app already publishes its identity: scripts/publish-health.mjs writes
 * the commit and a build timestamp to /.well-known/starcom-health.json on
 * every build. Nothing running in the browser could read it, so the app had no
 * idea which build it was — and filled the gap with a hand-maintained
 * constant, which by the time it was found claimed a deployment date thirteen
 * months stale and rendered it to every visitor as a release date.
 *
 * That is the failure this codebase names most often: a value narrated by hand
 * where one could be derived. So this derives it, from the same file the
 * endpoint serves, injected at build time by vite.config.ts.
 *
 * ─── ABSENCE IS A REAL ANSWER ──────────────────────────────────────────────
 *
 * In a `vite dev` session that has never had a build run, there is no commit
 * to report. This returns null rather than a placeholder, because the callers
 * that matter — a share card claiming to depict a build, a header claiming a
 * version — need to be able to say "unknown" rather than show something that
 * reads as a fact.
 */

import { formatUtcDate } from './utcTime';

/*
 * Declared here rather than in src/vite-env.d.ts on purpose.
 *
 * Four tsconfig projects compile this tree and they do not all include the
 * same files: tsconfig.starcom.json takes src/utils/** but not the ambient
 * declaration file, so a global declared there is invisible to exactly the
 * project that compiles this module. Keeping the declaration beside its only
 * consumer means no project can see the code without also seeing the type.
 */
declare global {
  /** Injected by vite.config.ts. Null when the bundle was not built from a commit. */
  const __BUILD_SHA__: string | null;
  /** Injected by vite.config.ts. ISO timestamp of the build, or null. */
  const __BUILT_AT__: string | null;
  /**
   * Injected by vite.config.ts. True when the build came from a tree with
   * uncommitted changes, null when it could not be determined.
   */
  const __BUILD_TREE_DIRTY__: boolean | null;
}

export interface BuildIdentity {
  /** Full commit sha of the build, or null when it was not built from one. */
  sha: string | null;
  /** ISO timestamp of the build, or null on the same terms. */
  builtAt: string | null;
  /**
   * Whether the tree it was built from had uncommitted changes. True means the sha
   * above names a commit that does NOT describe this code — a reader who fetches that
   * commit to check an image gets something else. Null means the question could not be
   * asked, which is a different answer from clean and is not treated as one.
   */
  treeDirty: boolean | null;
}

/** Short form for display. Null in, null out — never a placeholder. */
export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 8) : null;
}

export function getBuildIdentity(): BuildIdentity {
  // typeof guards: these are compile-time substitutions, so they are simply
  // absent in any context vite did not define them for — a vitest run, or a
  // consumer importing this module outside the build.
  const sha = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : null;
  const builtAt = typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : null;
  const treeDirty = typeof __BUILD_TREE_DIRTY__ === 'boolean' ? __BUILD_TREE_DIRTY__ : null;
  return { sha, builtAt, treeDirty };
}

/**
 * A line a person can read, derived entirely from the build.
 *
 * Returns null when the build is unidentified, so a caller renders nothing
 * rather than "v0.0.0 • unknown", which reads as a broken build rather than an
 * unbuilt one.
 */
export function formatBuildLine(version: string, identity = getBuildIdentity()): string | null {
  if (!identity.builtAt) return null;
  const date = new Date(identity.builtAt);
  if (Number.isNaN(date.getTime())) return null;
  const stamp = formatUtcDate(date.getTime(), { year: true });
  const short = shortSha(identity.sha);
  // A sha with uncommitted changes behind it is marked, not presented as the code.
  const commit = short ? (identity.treeDirty ? `${short}+` : short) : null;
  return commit ? `v${version} • ${stamp} • ${commit}` : `v${version} • ${stamp}`;
}
