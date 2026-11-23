/**
 * jest-dom's matchers (`toBeInTheDocument` and the rest) on vitest 5's `expect` (security audit, SA4).
 *
 * vitest 3's Assertion extended the global `jest.Matchers`, which @testing-library/jest-dom augments, and that
 * bridge was how these matchers reached the type checker here. vitest 5 dropped it: its interface for custom
 * matchers is `Matchers`, while jest-dom (7.0.1 too) still augments a one-parameter `Assertion` that no longer
 * merges with vitest's two-parameter one. The parameters below must stay identical to vitest's own.
 */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<any, R> {}
}
