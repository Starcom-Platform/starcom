/**
 * Seeding must happen once, not once per page load.
 *
 * App.tsx calls loadIntelSampleData on every mount in dev or demo mode. It used
 * to seed unconditionally, and measured in a browser across three loads that
 * produced 60 cases, then 120, then 180 — sixty more every time the page was
 * opened, accumulating in IndexedDB forever.
 *
 * No unit test could have caught it, because every test starts from empty. It
 * needed a second load, which is why it survived until someone opened the app
 * twice.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted, because vi.mock factories are lifted above ordinary consts and
// would otherwise reference them before initialisation.
const {
  getCases,
  generateSampleData,
  generateSampleTimelineData,
  generateAttackScenario,
  generateSampleCaseData,
  generateRelatedCaseSeries,
} = vi.hoisted(() => ({
  getCases: vi.fn(),
  generateSampleData: vi.fn().mockResolvedValue(undefined),
  generateSampleTimelineData: vi.fn().mockResolvedValue(undefined),
  generateAttackScenario: vi.fn().mockResolvedValue(undefined),
  generateSampleCaseData: vi.fn().mockResolvedValue(undefined),
  generateRelatedCaseSeries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../adapters/caseManagerAdapter', () => ({ caseManagerAdapter: { getCases } }));
vi.mock('../utils/sampleDataGenerator', () => ({ generateSampleData }));
vi.mock('../utils/timelineDataGenerator', () => ({ generateSampleTimelineData, generateAttackScenario }));
vi.mock('../utils/caseDataGenerator', () => ({ generateSampleCaseData, generateRelatedCaseSeries }));

import { loadIntelSampleData } from '../index';

describe('loadIntelSampleData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seeds when the workspace is empty', async () => {
    getCases.mockResolvedValue([]);
    await loadIntelSampleData();
    expect(generateSampleCaseData).toHaveBeenCalled();
    expect(generateRelatedCaseSeries).toHaveBeenCalled();
  });

  it('seeds nothing when cases already exist', async () => {
    getCases.mockResolvedValue([{ id: 'CASE-1' }]);
    await loadIntelSampleData();

    // Not one generator, not just the case ones — a second pass would duplicate
    // the timeline and attack scenario too.
    expect(generateSampleCaseData).not.toHaveBeenCalled();
    expect(generateRelatedCaseSeries).not.toHaveBeenCalled();
    expect(generateSampleData).not.toHaveBeenCalled();
    expect(generateSampleTimelineData).not.toHaveBeenCalled();
    expect(generateAttackScenario).not.toHaveBeenCalled();
  });

  it('is stable across repeated calls, which is how it is actually used', async () => {
    getCases.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'CASE-1' }]);
    await loadIntelSampleData();
    await loadIntelSampleData();
    await loadIntelSampleData();
    expect(generateSampleCaseData).toHaveBeenCalledTimes(1);
  });

  it('seeds once when calls overlap, as StrictMode and a re-running effect make them', async () => {
    // Each overlapping call used to check the store before any had written to it,
    // so every one found it empty and seeded: a fresh load held each sample event
    // three times. The store check alone cannot see a seeding still in flight.
    getCases.mockResolvedValue([]);
    await Promise.all([loadIntelSampleData(), loadIntelSampleData(), loadIntelSampleData()]);
    expect(generateSampleData).toHaveBeenCalledTimes(1);
    expect(generateSampleTimelineData).toHaveBeenCalledTimes(1);
    expect(generateAttackScenario).toHaveBeenCalledTimes(1);
    expect(generateSampleCaseData).toHaveBeenCalledTimes(1);
  });

  it('asks the store again once an earlier seeding has finished', async () => {
    getCases.mockResolvedValue([]);
    await loadIntelSampleData();
    await loadIntelSampleData();
    // Nothing was written by the mocked generators, so the store still reads empty
    // and the second call seeds: the in-flight guard must not become a run-once flag.
    expect(generateSampleCaseData).toHaveBeenCalledTimes(2);
  });

  it('seeds when the check itself fails, since an empty workspace is worse', async () => {
    getCases.mockRejectedValue(new Error('store unavailable'));
    await loadIntelSampleData();
    expect(generateSampleCaseData).toHaveBeenCalled();
  });
});
