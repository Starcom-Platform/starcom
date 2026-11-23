/**
 * Run a guard against a fabricated repository, and find out whether it can fail.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * This repository has twenty-six guards and, before this file, one test. That
 * is a lot of green with nothing behind it, and the gap is not theoretical: a
 * guard shipped here that printed "skipping" and exited 0 whenever it could not
 * check, so in the deploy container — where the thing it inspects is never
 * present — it would have passed forever while verifying nothing. A separate
 * typecheck command compiled an empty program and reported success for a full
 * working day.
 *
 * A check nobody has watched fail is not a check. It is a claim.
 *
 * ─── WHY IT NEEDS NO CHANGES TO THE GUARDS ─────────────────────────────────
 *
 * Twenty-one of twenty-six resolve their inputs from `process.cwd()`. So
 * running one with its cwd set to a directory we built means it inspects that
 * directory — no scan-root argument to add, no guard to refactor, and, more
 * importantly, the code under test is the code that ships rather than a variant
 * arranged to be testable.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

export interface GuardRun {
  status: number;
  output: string;
}

const GUARD_DIR = resolve(process.cwd(), 'scripts');

/**
 * Write `files` into a throwaway directory and run `guard` there.
 *
 * The guard is addressed absolutely while cwd is the fixture, which is the
 * whole trick: the script under test is the real one, and everything it reads
 * is ours.
 */
export interface GuardOptions {
  /**
   * Initialise a git repository and stage these paths.
   *
   * Some guards ask git what it tracks rather than asking the filesystem what
   * exists — which is the point of them: a file present locally and absent from
   * the repository breaks the next person's clone and nobody else's. Testing
   * that needs a real repository, so the fixture becomes one.
   */
  gitTracked?: string[];
}

export function runGuardIn(
  guard: string,
  files: Record<string, string>,
  env: Record<string, string> = {},
  options: GuardOptions = {},
): GuardRun {
  const dir = mkdtempSync(join(tmpdir(), 'guard-fixture-'));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents, 'utf8');
    }

    if (options.gitTracked) {
      const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
      git(['init', '-q']);
      git(['config', 'user.email', 'fixture@example.invalid']);
      git(['config', 'user.name', 'fixture']);
      if (options.gitTracked.length > 0) git(['add', '--', ...options.gitTracked]);
    }

    try {
      const output = execFileSync(process.execPath, [join(GUARD_DIR, guard)], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // Some guards read the environment — an escape hatch that cannot be
        // exercised is an escape hatch nobody has checked.
        env: { ...process.env, ...env },
      });
      return { status: 0, output };
    } catch (error) {
      // A non-zero exit is the normal, expected result for a violating
      // fixture, so it arrives here rather than as a failure.
      const e = error as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A package.json carrying just the scripts a guard will read. */
export function packageJson(scripts: Record<string, string>): string {
  return JSON.stringify({ name: 'fixture', version: '0.0.0', scripts }, null, 2);
}
