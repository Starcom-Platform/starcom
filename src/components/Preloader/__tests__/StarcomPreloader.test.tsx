import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import StarcomPreloader from '../StarcomPreloader';

describe('StarcomPreloader', () => {
  it('renders without a fake progress bar', () => {
    // Previously had a "progress-fill" div whose width was driven purely
    // by a fixed 3s CSS keyframe loop (0% -> 100% -> 0%, repeating
    // forever), completely disconnected from any real load state — no
    // code anywhere set its width from actual progress. Removed rather
    // than wired up, since no progress-emitting API exists yet on the
    // asset-loading/bootstrap services this preloader covers. This test
    // guards against it (or an equivalent) being reintroduced without
    // that context.
    const { container } = render(<StarcomPreloader />);

    expect(container.querySelector('.progress-bar')).toBeNull();
    expect(container.querySelector('.progress-fill')).toBeNull();
  });

  it('still shows a real spinner and status text', () => {
    const { container, getByText } = render(<StarcomPreloader />);

    expect(container.querySelector('.orbital-loader')).not.toBeNull();
    expect(getByText('Initializing Systems...')).toBeTruthy();
  });
});
