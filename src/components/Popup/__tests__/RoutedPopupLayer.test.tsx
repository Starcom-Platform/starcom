/**
 * What a popup shows can navigate, like anything else in the app.
 *
 * PopupProvider draws each popup beside its children, not inside them, so a popup
 * reaches only the providers above PopupProvider. The page router and the application
 * router were mounted inside the app's content, below it, so a popup that navigates
 * threw "useEnhancedApplicationRouter must be used within an
 * EnhancedApplicationRouterProvider": clicking an intel report on the globe took the
 * whole app to its error screen, from 6ffe9177 (2026-08-29) until it was found while
 * checking decision D-F, step 3.1.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RoutedPopupLayer } from '../RoutedPopupLayer';
import { usePopup } from '../PopupManager';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';

/** What IntelReportPopup does: navigate from inside a popup. */
const NavigatingPopup: React.FC<{ onClose: () => void }> = () => {
  const { navigateToApp } = useApplicationRouter();
  const navigate = useNavigate();
  return (
    <div data-testid="navigating-popup">
      <button type="button" onClick={() => navigateToApp('inteldashboard')}>Open in IntelDashboard</button>
      <button type="button" onClick={() => navigate('/cases-dashboard')}>Go to a page</button>
    </div>
  );
};

/** The page: it opens the popup, and shows where the app and the page are. */
const Page: React.FC = () => {
  const { showPopup } = usePopup();
  const { currentApp } = useApplicationRouter();
  const { pathname } = useLocation();
  return (
    <>
      <button type="button" onClick={() => showPopup({ component: NavigatingPopup, label: 'Intel report' })}>
        Open report
      </button>
      <span data-testid="page-app">{currentApp}</span>
      <span data-testid="page-path">{pathname}</span>
    </>
  );
};

const openReport = () => {
  render(
    <RoutedPopupLayer>
      <Page />
    </RoutedPopupLayer>,
  );
  fireEvent.click(screen.getByText('Open report'));
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('RoutedPopupLayer', () => {
  it('lets what a popup shows use the application router and the page router', () => {
    openReport();
    expect(screen.getByTestId('navigating-popup')).toBeTruthy();
  });

  it('moves the same application the page shows, from inside a popup', () => {
    openReport();
    fireEvent.click(screen.getByText('Open in IntelDashboard'));
    expect(screen.getByTestId('page-app').textContent).toBe('inteldashboard');
  });

  it('moves the same page, from inside a popup', () => {
    openReport();
    fireEvent.click(screen.getByText('Go to a page'));
    expect(screen.getByTestId('page-path').textContent).toBe('/cases-dashboard');
  });
});
