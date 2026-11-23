/**
 * Which tests a change reaches (scripts/test-affected.mjs; decided by the owner
 * 2026-10-07: a change is checked by the tests it reaches, the whole suite only
 * when asked). The import graph is vitest's; what is decided here is what it
 * cannot see, and what reaches every test.
 */
import { describe, it, expect } from 'vitest';
import { dependenciesChanged, selectTests, setupImports, testsNaming } from '../test-affected.mjs';

const TESTS = new Map([
  ['src/services/pwa/__tests__/serviceWorker.test.ts', "readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')"],
  ['scripts/__tests__/guardCachePolicy.test.ts', "const GUARD = 'guard-cache-policy.mjs';"],
  ['src/components/Globe/__tests__/Globe.test.tsx', "import Globe from '../Globe';\nimport { x } from './index.ts';"],
  ['src/features/globe/capture/__tests__/shotSpec.test.ts', "import { readShot } from '../shotSpec';"],
]);

describe('tests that name a changed file', () => {
  it('finds a test that reads a file by its path, which no import shows', () => {
    expect(testsNaming(['public/sw.js'], TESTS)).toEqual(['src/services/pwa/__tests__/serviceWorker.test.ts']);
  });

  it('finds a guard\'s test, which runs the guard by name', () => {
    expect(testsNaming(['scripts/guard-cache-policy.mjs'], TESTS)).toEqual(['scripts/__tests__/guardCachePolicy.test.ts']);
  });

  it('does not take a name too common to say which file it means', () => {
    expect(testsNaming(['src/somewhere/index.ts'], TESTS)).toEqual([]);
  });

  it('finds what imported a deleted module, by its stem', () => {
    const { named } = selectTests({ changed: [], deleted: ['src/features/globe/capture/shotSpec.ts'], testTexts: TESTS });
    expect(named).toEqual(['src/features/globe/capture/__tests__/shotSpec.test.ts']);
  });
});

describe('what a change reaches', () => {
  it('sends modules to the import graph, runs changed tests, and adds the tests naming a changed file', () => {
    const picked = selectTests({
      changed: ['public/sw.js', 'scripts/stamp-service-worker.mjs', 'src/services/pwa/__tests__/serviceWorker.test.ts', 'docs/notes.md'],
      testTexts: TESTS,
    });
    expect(picked.modules).toEqual(['scripts/stamp-service-worker.mjs']);
    expect(picked.tests).toEqual(['src/services/pwa/__tests__/serviceWorker.test.ts']);
    // Named by sw.js, but already run as a changed test: once.
    expect(picked.named).toEqual([]);
    expect(picked.reachesAll).toEqual([]);
  });

  it('says a change to the test setup, a vitest config, a tsconfig or what the setup imports reaches every test', () => {
    const setup = setupImports("import '@testing-library/jest-dom';\nimport { blockPublicSockets } from './testing/blockPublicSockets';\n");
    expect(setup).toEqual(['src/testing/blockPublicSockets']);
    const { reachesAll } = selectTests({
      changed: ['src/setupVitest.ts', 'vitest.stable.config.ts', 'tsconfig.app.json', 'src/testing/blockPublicSockets.ts', 'src/testing/other.ts'],
      testTexts: TESTS,
      setup,
    });
    expect(reachesAll).toEqual(['src/setupVitest.ts', 'vitest.stable.config.ts', 'tsconfig.app.json', 'src/testing/blockPublicSockets.ts']);
  });

  it('counts package.json as reaching every test only when what is installed changed', () => {
    const before = { scripts: { build: 'a' }, dependencies: { three: '0.170.0' } };
    expect(dependenciesChanged(before, { ...before, scripts: { build: 'a && b' } })).toBe(false);
    expect(dependenciesChanged(before, { ...before, dependencies: { three: '0.171.0' } })).toBe(true);
    expect(selectTests({ changed: ['package.json'], testTexts: TESTS, packages: { before, after: { ...before, devDependencies: { x: '1' } } } }).reachesAll)
      .toEqual(['package.json (dependencies)']);
  });
});
