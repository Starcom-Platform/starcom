/**
 * The build profile (decision D-CS, CS1, CS13, CS14): one codebase, two builds. The non-commercial build is today's
 * starcom.app. The commercial build uses only the sources whose terms allow commercial use, as the source register
 * records them (sourceRegister.ts), and hides entirely whatever a source it may not use would have drawn (CS13). It is
 * built, never deployed, until the owner decides where it lives (CS14).
 *
 * Set at build time: `VITE_BUILD_PROFILE=commercial npm run build` (npm run build:commercial). The variable is read
 * with a static, literal member access, because Vite substitutes nothing else in a browser bundle (publishTargets.ts
 * records how a computed key once silently did nothing). process.env wins, so tests and scripts can choose either.
 */
import { SOURCE_REGISTER, type CommercialStatus } from './sourceRegister';

export type BuildProfile = 'noncommercial' | 'commercial';

function readProfile(): string | undefined {
  try {
    if (typeof process !== 'undefined' && process?.env?.VITE_BUILD_PROFILE !== undefined) return process.env.VITE_BUILD_PROFILE;
  } catch {
    // An unreadable process.env is the same as an unset one.
  }
  try {
    return import.meta.env.VITE_BUILD_PROFILE;
  } catch {
    return undefined;
  }
}

/** The build this is: commercial only when asked for by name. */
export function buildProfile(): BuildProfile {
  return readProfile() === 'commercial' ? 'commercial' : 'noncommercial';
}

/**
 * The statuses a commercial build may use: allowed by the terms; drawn on the person's own key, under their own
 * account; and infrastructure, from which no data is taken under a licence. Mecha Jono's notes are per item: each
 * note's own licence tag decides (noteLicenceAllows), so the source itself stays on.
 */
export const COMMERCIAL_STATUSES: ReadonlySet<CommercialStatus> = new Set(['allowed', 'person-key', 'infrastructure', 'per-item']);

const STATUS = new Map(SOURCE_REGISTER.map((s) => [s.id, s.commercial]));

/** Whether this build may use a source, by its id in the source register. An unknown id is a bug, and throws. */
export function sourceAllowed(id: string, profile: BuildProfile = buildProfile()): boolean {
  const status = STATUS.get(id);
  if (!status) throw new Error(`"${id}" is not in the source register`);
  return profile === 'noncommercial' || COMMERCIAL_STATUSES.has(status);
}

/** The register's sources a commercial build may not use, with the files baked from them. */
export function restrictedSources(): Array<{ id: string; status: CommercialStatus; files: string[] }> {
  return SOURCE_REGISTER
    .filter((s) => !COMMERCIAL_STATUSES.has(s.commercial))
    .map((s) => ({ id: s.id, status: s.commercial, files: s.files ?? [] }));
}
