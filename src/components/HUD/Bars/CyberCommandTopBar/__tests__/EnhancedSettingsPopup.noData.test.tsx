/**
 * A category with nothing in it must not be reported as fine.
 *
 * The popup's status column showed a green tick for anything that was neither
 * loading nor errored — which includes a category reading "no data". Someone
 * who clicked a blank marquee entry to find out why was told everything was
 * OK. That is the same overstatement as the invented figures this marquee used
 * to print, in a smaller place.
 *
 * It is also the one place a newcomer can be told WHY it is blank: production
 * has no EIA credential, and since a VITE_ variable is inlined into the bundle
 * every visitor downloads, the answer is for them to supply their own.
 *
 * Finding this took a wrong turn worth recording: the popup file contained a
 * complete second copy of this card, in a `renderCategoriesTab` function that
 * was never called. I patched that copy, and this test kept reading the live
 * one — which is how the dead code was found. The tabs are rendered by
 * ./SettingsTabs/*; the dead pair has been deleted.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * focus-trap decides what is "tabbable" from layout, and jsdom performs no
 * layout: every rect is 0x0 and nothing reads as visible, so the real trap
 * throws before the dialog can render. Passing it through keeps this test
 * about what the dialog SAYS, which is the subject here.
 */
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import EnhancedSettingsPopup from '../EnhancedSettingsPopup';
import { TOPBAR_CATEGORIES, NEEDS_EIA_KEY } from '../topbarCategories';

const point = (id: string, value: string) => ({
  id, label: id, icon: '⚡', value, isLoading: false, hasError: false,
});

const open = (points: ReturnType<typeof point>[]) =>
  render(
    <EnhancedSettingsPopup
      open
      onClose={() => {}}
      enabledCategories={{}}
      onCategoryToggle={() => {}}
      categories={TOPBAR_CATEGORIES}
      currentDataPoints={points}
    />
  );

/**
 * The cards live on the DEFAULT tab, not the one called "Data" — which is
 * about refresh intervals. Clicking through to "Data" navigates away from
 * them, as my first attempt at this test did.
 */
describe('a marquee category with no data', () => {
  it('is not given a green tick', () => {
    open([point('power-grid', 'no data')]);
    const card = document.getElementById('datapoint-power-grid');
    expect(card).not.toBeNull();
    expect(card!.textContent).not.toContain('✅');
  });

  it('is not given a green tick when the reason is a missing key either', () => {
    open([point('power-grid', NEEDS_EIA_KEY)]);
    expect(document.getElementById('datapoint-power-grid')!.textContent).not.toContain('✅');
  });

  it('says why it is blank and where to fix it', () => {
    open([point('power-grid', NEEDS_EIA_KEY)]);
    const card = document.getElementById('datapoint-power-grid');
    expect(card!.textContent).toMatch(/EIA credential/i);
    expect(card!.textContent).toMatch(/under Keys/i);
  });

  /**
   * This hint used to be inferred from "no data", so a reader whose key WAS
   * set, on a day EIA returned nothing, was told to go and add one. The key
   * is only blamed when the data hook says there is none.
   */
  it('does not blame the key when one is set and EIA returned nothing', () => {
    open([point('power-grid', 'no data')]);
    const card = document.getElementById('datapoint-power-grid');
    expect(card!.textContent).not.toMatch(/EIA credential/i);
    expect(card!.textContent).toMatch(/asked with your key/i);
  });

  it('has the Keys tab it points to, where the EIA key can be entered', () => {
    open([point('power-grid', NEEDS_EIA_KEY)]);
    fireEvent.click(screen.getByRole('tab', { name: /Keys/ }));
    expect(screen.getByLabelText('EIA key')).toBeTruthy();
  });

  it('leaves a category that HAS data alone', () => {
    open([point('power-grid', 'Grid 352TWh')]);
    const card = document.getElementById('datapoint-power-grid');
    expect(card!.textContent).toContain('✅');
    expect(card!.textContent).not.toMatch(/EIA credential/i);
  });

  it('does not offer an EIA explanation for a category EIA does not feed', () => {
    // 'crypto' is one of the disabled legacy financial categories; blaming a
    // missing energy key for it would be a confident wrong answer.
    open([point('crypto', 'no data')]);
    const card = document.getElementById('datapoint-crypto');
    expect(card!.textContent).not.toMatch(/EIA credential/i);
  });
});
