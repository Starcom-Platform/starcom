/**
 * The tooltip says when a pin is a stack.
 *
 * The RLSH source geocodes to a CITY CENTROID, so 197 markers occupy 107
 * coordinates — San Diego is one pin that is fourteen people, Seattle thirteen,
 * Portland nine. The globe now draws one pin per location and only the
 * representative is pickable, so without this line nothing tells a reader the
 * others exist. RLSHPopupPortal can already page through them; nobody would
 * think to try.
 *
 * Written because I had built this and never seen it work: three live hovers
 * showed no notice, and all three markers turned out to be singletons — which
 * proved nothing either way. About 64% of pins stand alone, so a blind probe
 * was always likely to miss.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportTooltip } from '../IntelReportTooltip';

// The tooltip renders a three.js preview, which has no WebGL context in jsdom.
// Same mock as this directory's existing tooltip test.
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const report = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'p1', title: 'Darkfire', content: '', tags: ['RLSH'],
  latitude: 32.7, longitude: -117.1, timestamp: 0, author: 'wiki.rlsh.net',
  kind: 'rlsh', ...over,
});

const show = (r: IntelReportOverlayMarker) =>
  render(<IntelReportTooltip report={r} visible position={{ x: 10, y: 10 }} />);

describe('tooltip stack notice', () => {
  it('says how many others share the pin', () => {
    show(report({ groupSize: 14 }));
    expect(screen.getByText('+13 more here')).toBeInTheDocument();
  });

  it('says nothing when the marker stands alone', () => {
    // ~64% of pins are singletons. A notice on those would be noise, and would
    // make the real ones stop registering.
    show(report({ groupSize: 1 }));
    expect(screen.queryByText(/more here/)).not.toBeInTheDocument();
  });

  it('says nothing when the producer set no group size', () => {
    // Intel markers have no group concept at all.
    show(report({ kind: 'intel', groupSize: undefined }));
    expect(screen.queryByText(/more here/)).not.toBeInTheDocument();
  });

  it('counts the OTHERS, not the group', () => {
    // Off by one here reads as an extra person at every stacked location.
    show(report({ groupSize: 2 }));
    expect(screen.getByText('+1 more here')).toBeInTheDocument();
  });
});
