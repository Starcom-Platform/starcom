import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PopupProvider } from '../../../components/Popup/PopupManager';
import { CountrySelectionProvider, useCountrySelection } from '../../../context/CountrySelectionContext';
import { VisualizationOverlayProvider } from '../../../context/VisualizationOverlayContext';
import { GeoPoliticalSettingsProvider } from '../../../hooks/useGeoPoliticalSettings';
import { useCountryInfoOverlay } from '../useCountryInfoOverlay';
import { takeCountryPanel } from '../../../context/countryPanel';

// Same Harness pattern already established in PopupManager.test.tsx: a small
// test-only component that calls the hook under test and exposes buttons/
// state for assertions, rendered inside the real PopupProvider (usePopup()
// throws outside one) and CountrySelectionProvider (selection is now shared
// context state, not local to this hook — see useCountryInfoOverlay.ts).
const Harness: React.FC = () => {
  const overlay = useCountryInfoOverlay();
  const { selectedCountry } = useCountrySelection();
  return (
    <div>
      <button onClick={() => overlay.onHoverChange({ countryCode: 'RUS', name: 'Russia' })}>hover-rus</button>
      <button onClick={() => overlay.onHoverChange(null)}>clear-hover</button>
      <button onClick={() => overlay.onSelectChange({ countryCode: 'USA', name: 'United States' })}>select-usa</button>
      <button onClick={() => overlay.onSelectChange({ countryCode: 'CAN', name: 'Canada' })}>select-can</button>
      <button onClick={() => overlay.onSelectChange(null)}>clear-select</button>
      <div data-testid="tooltip-visible">{String(overlay.tooltip.visible)}</div>
      <div data-testid="tooltip-name">{overlay.tooltip.info?.name ?? ''}</div>
      <div data-testid="selected-country-code">{selectedCountry?.countryCode ?? ''}</div>
    </div>
  );
};

// Simulates GlobalHeader.tsx's country search result action, which selects a
// country via the shared context directly — independent of the 3D scene.
const SearchStandIn: React.FC = () => {
  const { selectCountry } = useCountrySelection();
  return (
    <button onClick={() => selectCountry({ countryCode: 'MEX', name: 'Mexico' })}>search-select-mex</button>
  );
};

function renderWithProviders(children: React.ReactNode) {
  // GeoPoliticalSettingsProvider must nest inside VisualizationOverlayProvider (its own
  // state depends on useVisualizationOverlay internally — see useGeoPoliticalSettings.tsx)
  // and, like every provider a popup's content needs, above PopupProvider — PopupProvider's
  // portal content renders as a SIBLING of children within its own render tree, not a
  // descendant, so it only inherits context from providers positioned above itself (see
  // App.tsx's own composition order and the comment there for the full story). Needed here
  // because CountryInfoPopup.tsx (opened via this hook's onSelectChange) calls
  // useGeoPoliticalSettings() for its Resource Zones / Diplomatic Events sections.
  return render(
    <VisualizationOverlayProvider>
      <GeoPoliticalSettingsProvider>
        <CountrySelectionProvider>
          <PopupProvider>{children}</PopupProvider>
        </CountrySelectionProvider>
      </GeoPoliticalSettingsProvider>
    </VisualizationOverlayProvider>
  );
}

describe('useCountryInfoOverlay', () => {
  it('reports the hovered country and clears on hover(null)', () => {
    renderWithProviders(<Harness />);

    expect(screen.getByTestId('tooltip-visible').textContent).toBe('false');
    fireEvent.click(screen.getByText('hover-rus'));
    expect(screen.getByTestId('tooltip-visible').textContent).toBe('true');
    expect(screen.getByTestId('tooltip-name').textContent).toBe('Russia');

    fireEvent.click(screen.getByText('clear-hover'));
    expect(screen.getByTestId('tooltip-visible').textContent).toBe('false');
  });

  it('shows no hover tooltip over an open popup, and shows it again once the popup closes (critique C7)', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByText('select-usa'));
    expect(screen.getByText('United States')).toBeInTheDocument();
    fireEvent.click(screen.getByText('hover-rus'));
    expect(screen.getByTestId('tooltip-visible').textContent).toBe('false');

    fireEvent.click(screen.getByText('clear-select'));
    expect(screen.getByTestId('tooltip-visible').textContent).toBe('true');
  });

  it('opens a popup with the selected country on select, and closes it on select(null)', () => {
    renderWithProviders(<Harness />);

    expect(screen.queryByText('United States')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('select-usa'));
    expect(screen.getByText('United States')).toBeInTheDocument();

    fireEvent.click(screen.getByText('clear-select'));
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
  });

  // D-DP, DP16: while Diplomacy is drawn the selected country is its, in the drawer, not a modal over the globe.
  it('opens no popup while a layer has taken the selected country, and keeps the selection', () => {
    let giveBack = () => {};
    act(() => { giveBack = takeCountryPanel(); });
    try {
      renderWithProviders(<Harness />);
      fireEvent.click(screen.getByText('select-usa'));
      expect(screen.queryByText('United States')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-country-code')).toHaveTextContent('USA');
    } finally {
      act(() => giveBack());
    }
  });

  it('replaces the popup (does not stack a second one) when selection changes to a different country', () => {
    renderWithProviders(<Harness />);

    fireEvent.click(screen.getByText('select-usa'));
    expect(screen.getByText('United States')).toBeInTheDocument();

    fireEvent.click(screen.getByText('select-can'));
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
    expect(screen.getByText('Canada')).toBeInTheDocument();
    /*
     * ONE dialog, counted without qualification.
     *
     * This assertion used to be narrowed to `{ name: /details$/i }`, because
     * three nested elements claimed the role for a single Canada panel:
     * PopupFrame's content div, CountryInfoPopup's Modal wrapper, and the panel
     * inside it. A screen reader was told it had entered three dialogs to read
     * one country, and the outermost — the one announced on entry — carried no
     * name at all, because showPopup was passed no label.
     *
     * The narrowing was the right call at the time: it measured popups rather
     * than how many components declare a role. It is no longer needed. The
     * popup renders no Modal and no role of its own, PopupFrame is the dialog,
     * and the accessible name travels to it at showPopup.
     *
     * Kept unqualified deliberately, so the nesting cannot come back quietly.
     */
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Canada details');
  });

  it('closes an open popup when the overlay unmounts while PopupProvider stays mounted, rather than leaving it orphaned', async () => {
    // Unmounting just the Harness (not the whole PopupProvider tree) is the
    // realistic scenario: Globe.tsx unmounting/remounting while PopupProvider
    // (mounted once in App.tsx) stays alive for the rest of the app.
    const ToggleableHarness: React.FC = () => {
      const [mounted, setMounted] = React.useState(true);
      return (
        <div>
          <button onClick={() => setMounted(false)}>unmount-harness</button>
          {mounted && <Harness />}
        </div>
      );
    };

    renderWithProviders(<ToggleableHarness />);
    fireEvent.click(screen.getByText('select-usa'));
    expect(screen.getByText('United States')).toBeInTheDocument();

    fireEvent.click(screen.getByText('unmount-harness'));
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
    // Flush the deferred selectCountry(null) microtask (see onClose in
    // useCountryInfoOverlay.ts) so it settles within this test, act()-wrapped,
    // rather than leaking into the next one outside of React's tracking.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('opens the info popup when a country is selected via the shared context from OUTSIDE this hook (e.g. GlobalHeader\'s search result), not just via a 3D onSelectChange call', () => {
    renderWithProviders(
      <>
        <SearchStandIn />
        <Harness />
      </>
    );

    expect(screen.queryByText('Mexico')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('search-select-mex'));
    expect(screen.getByText('Mexico')).toBeInTheDocument();
  });

  it('closing the popup via its own X button clears the shared selection too, not just the local popup id', async () => {
    renderWithProviders(<Harness />);

    fireEvent.click(screen.getByText('select-usa'));
    expect(screen.getByTestId('selected-country-code').textContent).toBe('USA');

    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
    // Clearing the shared selection on a genuine user-initiated close is
    // deferred one microtask (see useCountryInfoOverlay.ts's onClose — avoids
    // updating CountrySelectionProvider synchronously from inside
    // PopupManager's own setPopups updater), so this needs to be awaited
    // rather than asserted synchronously right after the click.
    await waitFor(() => {
      expect(screen.getByTestId('selected-country-code').textContent).toBe('');
    });
  });
});
