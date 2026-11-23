/**
 * A component nothing renders is a wiring stub with a component's clothes on.
 *
 * This repository's recurring failure is code that is fully built, typechecks,
 * has tests, and has no reachable trigger — it reads as done in review, which
 * is what makes it worse than an honest stub. The guard's own header lists four
 * such defects from a single session.
 *
 * It resolves its scope from process.cwd(), so the fixture is a directory we
 * build. No guard change was needed: I had recorded this one as
 * "__dirname-anchored" and blocked, which was wrong.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const G = 'guard-unrendered-components.mjs';

/*
 * The guard checks its exemptions against the tree it scans: an exemption naming a
 * component declared nowhere fails as stale. A fixture without the exempted components
 * therefore fails on that alone, which is how every case here went red when the first
 * two exemptions were added. So each fixture declares them, outside SCOPE so they are
 * not judged themselves, with the names read from the guard's own source so this list
 * cannot drift from it.
 */
const EXEMPT = [...readFileSync(resolve(process.cwd(), 'scripts', G), 'utf8')
  .matchAll(/symbol:\s*'([A-Za-z_$][\w$]*)'/g)].map((m) => m[1]);
const EXEMPT_STUBS: Record<string, string> = {
  'src/exempted.tsx': EXEMPT.map((name) => `export const ${name} = () => null;\n`).join(''),
};

/** The app's entry point, loading the renderer each case writes, as src/main.tsx loads App. */
const APP_ENTRY: Record<string, string> = { 'src/main.tsx': "import './AppShell';\n" };

/** Inside SCOPE, so this file's components are the ones under judgement. */
const IN_SCOPE = 'src/components/Intel/Widget.tsx';

/**
 * The renderer lives OUTSIDE scope but inside ALL_SOURCES ('src/**' + '/*.{ts,tsx}').
 *
 * My first attempt put it in src/components/Intel/ alongside the subject, and
 * the guard correctly failed — on the RENDERER, which was itself a component
 * nothing rendered. The fixture created the very defect it was meant to prove
 * absent. The guard reads every source file for evidence of rendering but only
 * JUDGES files in SCOPE, so a renderer outside scope is the honest shape.
 */
const RENDERER = 'src/AppShell.tsx';

const componentNamed = (name: string) =>
  `import React from 'react';\nexport const ${name}: React.FC = () => <div />;\n`;

describe('guard-unrendered-components', () => {
  it('passes when a component is rendered as JSX somewhere else', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: componentNamed('Widget'),
      [RENDERER]: "import { Widget } from './components/Intel/Widget';\nexport const AppShell = () => <Widget />;\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS on a component nothing renders', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY, [IN_SCOPE]: componentNamed('Widget') });
    expect(run.status).toBe(1);
    // Naming the symbol, not just the exit code: an exit-1 assertion alone
    // passes whenever the guard fails for ANY reason, which is how three of
    // these tests were briefly proving nothing while my renderer was itself
    // an unrendered component.
    expect(run.output).toMatch(/Widget/);
  });

  it('accepts a lazy import as rendering, since a route reaches it', () => {
    // React.lazy and router tables name a component without JSX. Treating
    // those as unrendered would report every lazily-loaded route.
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: componentNamed('Widget'),
      [RENDERER]:
        "const Widget = lazy(() => import('./components/Intel/Widget'));\nexport const routes = [{ element: Widget }];\n",
    });
    expect(run.status).toBe(0);
  });

  it('does not count the component\'s own file as rendering it', () => {
    // A self-reference would make every stub look wired, which is the exact
    // blind spot the guard exists to close.
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: `${componentNamed('Widget')}\nexport const preview = () => <Widget />;\n`,
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/Widget/);
  });

  it('passes on an empty scope rather than crashing', () => {
    // The deploy container has a truncated tree; a guard that throws there
    // takes the build down for a reason unrelated to the code.
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY, 'README.md': '# nothing in scope' });
    expect(run.status).toBe(0);
  });

  it('does not judge an ALL_CAPS constant, which is not a component', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY, [IN_SCOPE]: "export const CORNERS = ['top-left', 'top-right'] as const;\n" });
    expect(run.status).toBe(0);
  });

  it('does not judge a React context, which renders as <Name.Provider> and is read with useContext', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: "import { createContext } from 'react';\nexport const BoardsContext = createContext<number | undefined>(undefined);\n",
    });
    expect(run.status).toBe(0);
  });

  it('counts a render under an alias the component was re-exported as', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: componentNamed('WidgetProvider'),
      'src/barrel.ts': "export { WidgetProvider as ShellProvider } from './components/Intel/Widget';\n",
      [RENDERER]: "import { ShellProvider } from './barrel';\nexport const AppShell = () => <ShellProvider />;\n",
    });
    expect(run.status).toBe(0);
  });

  it('still FAILS on an unrendered component that sits beside a constant', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY, [IN_SCOPE]: `export const LIMIT = 3;\n${componentNamed('Orphan')}` });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/Orphan/);
    expect(run.output).not.toMatch(/LIMIT/);
  });


  it('FAILS when an exemption names a component that is no longer declared anywhere', () => {
    expect(EXEMPT.length).toBeGreaterThan(0);
    const run = runGuardIn(G, {
      [IN_SCOPE]: componentNamed('Widget'),
      [RENDERER]: "import { Widget } from './components/Intel/Widget';\nexport const AppShell = () => <Widget />;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/no longer exist/);
    expect(run.output).toContain(EXEMPT[0]);
  });


  it('FAILS on components that render only each other, when nothing the app loads imports them', () => {
    // src/pages/MainPage/Screens passed for months this way: its screens referenced one another.
    const run = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [RENDERER]: 'export const AppShell = () => null;\n',
      'src/components/Intel/Left.tsx': "import { Right } from './Right';\nexport const Left = () => <Right />;\n",
      'src/components/Intel/Right.tsx': "import { Left } from './Left';\nexport const Right = () => <Left />;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/cannot reach/);
    expect(run.output).toMatch(/Left\.tsx/);
    expect(run.output).toMatch(/Right\.tsx/);
  });

  it('judges a default export by whether the app loads it, whatever name it is imported under', () => {
    const widget = "import React from 'react';\nconst Widget: React.FC = () => <div />;\nexport default Widget;\n";
    const loaded = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY,
      [IN_SCOPE]: widget,
      [RENDERER]: "import Gate from './components/Intel/Widget';\nexport const AppShell = () => <Gate />;\n",
    });
    expect(loaded.status).toBe(0);

    const orphaned = runGuardIn(G, { ...EXEMPT_STUBS, ...APP_ENTRY, [IN_SCOPE]: widget });
    expect(orphaned.status).toBe(1);
    expect(orphaned.output).toMatch(/Widget/);
  });

  it('FAILS when src/main.tsx is missing, rather than calling everything unreachable or passing', () => {
    const run = runGuardIn(G, { ...EXEMPT_STUBS,
      [IN_SCOPE]: componentNamed('Widget'),
      [RENDERER]: "import { Widget } from './components/Intel/Widget';\nexport const AppShell = () => <Widget />;\n",
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/main\.tsx was not found/);
  });

});
