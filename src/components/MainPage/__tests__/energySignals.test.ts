/**
 * The Globe's energy readings, as the one ticker carries them (K4): only those
 * the visitor has. With no EIA key every one read "needs an EIA key", so a
 * whole second ticker under the header told most visitors nothing, eight times.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { energySignalsFrom } from '../energySignals';
import { NEEDS_EIA_KEY } from '../../HUD/Bars/CyberCommandTopBar/topbarCategories';

const point = (id: string, label: string, value: string, over: { isLoading?: boolean; hasError?: boolean } = {}) =>
  ({ id, label, value, isLoading: false, hasError: false, ...over });

describe('the energy readings the ticker carries', () => {
  it('a reading EIA answered, labelled as the ticker labels its readouts', () => {
    expect(energySignalsFrom([point('power-grid', 'Power Grid', 'Nuclear 64.2 TWh | Coal 51.0 TWh')]))
      .toEqual([{ id: 'energy-power-grid', label: 'POWER GRID', value: 'Nuclear 64.2 TWh | Coal 51.0 TWh' }]);
  });

  it('none that needs a key, has no data, is loading, failed or is N/A', () => {
    expect(energySignalsFrom([
      point('energy-security', 'Energy Security', NEEDS_EIA_KEY),
      point('renewables', 'Clean Energy', 'no data'),
      point('supply-chain', 'Supply Chain', 'Loading...', { isLoading: true }),
      point('trade-balance', 'Trade Balance', 'Error', { hasError: true }),
      point('strategic-fuels', 'Strategic Fuels', 'N/A'),
      point('baseload-power', 'Baseload', 'Nuclear —', { isLoading: true }),
    ])).toEqual([]);
  });

  it('none from a category EIA does not answer: the retired market feeds', () => {
    expect(energySignalsFrom([point('indices', 'Indices', 'Market data disabled')])).toEqual([]);
  });

  it('keeps the order the categories were given', () => {
    expect(energySignalsFrom([
      point('strategic-fuels', 'Strategic Fuels', 'SPR 402 Mbbl'),
      point('commodities', 'Energy Markets', 'Nuclear 64 TWh'),
    ]).map((s) => s.id)).toEqual(['energy-strategic-fuels', 'energy-commodities']);
  });
});
