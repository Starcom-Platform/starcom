/**
 * What version of Starcom this is.
 *
 * ─── WHAT WAS HERE, AND WHY IT WAS REMOVED ─────────────────────────────────
 *
 * A hand-maintained DEPLOYMENT_INFO block:
 *
 *     deployedVersion: '0.1.0',
 *     deployedDate: '2025-08-04',
 *
 * Nobody updated it, which is what always happens to a constant somebody has
 * to remember. By the time it was found, package.json said 0.1.2 and the
 * deployed commit was thirteen months newer than that date — and the app was
 * rendering the date to every visitor through GitHubWidget as the latest
 * release. `hasVersionMismatch()` compared 0.1.2 against 0.1.0 and so reported
 * an update permanently available.
 *
 * Neither value was ever checked against anything, so neither could ever be
 * found wrong by the build. Derive state, never narrate it.
 *
 * Both now come from the build: the version from package.json, the date and
 * commit from getBuildIdentity(), which reads what the build itself published
 * to /.well-known/starcom-health.json. Nothing to remember, and nothing that
 * can drift.
 */

import packageJson from '../../package.json';
import { formatBuildLine, getBuildIdentity, shortSha, type BuildIdentity } from './buildIdentity';

/** Current app version, from package.json. */
export const getAppVersion = (): string => packageJson.version;

export interface VersionStatus {
  version: string;
  /** The build's commit, short form, or null when unidentified. */
  commit: string | null;
  /** ISO timestamp of the build, or null. */
  builtAt: string | null;
  /**
   * A line to show a person, or null when the build cannot be identified.
   *
   * Null rather than a partial string: a caller that renders nothing is
   * honest, where "v0.1.2 • unknown" reads as a broken build rather than an
   * unbuilt one.
   */
  display: string | null;
}

export const getVersionStatus = (identity: BuildIdentity = getBuildIdentity()): VersionStatus => {
  const version = getAppVersion();
  return {
    version,
    commit: shortSha(identity.sha),
    builtAt: identity.builtAt,
    display: formatBuildLine(version, identity),
  };
};
