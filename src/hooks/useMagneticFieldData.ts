import { useState } from 'react';
export interface MagneticFieldData { sampleCount?: number }

// No real magnetic-field/radiation-belt data source is wired up yet — this used to
// fabricate `{ sampleCount: 250 }` unconditionally the moment the layer was toggled on,
// rendered directly in SpaceWeatherLayerPassiveCards.tsx's "Radiation Belts" card as if it
// were live telemetry (a real, user-visible instance of showing something that doesn't
// exist, not just internal dead code). The other genuinely-unimplemented SpaceWeather
// layers in this same catalog (ionosphere, solarActivity, cosmicRays — see
// SpaceWeatherLayerRegistry.ts) are honest about this with a 'planned' capability instead
// of a fake number; this hook now matches that stance. `data` stays null regardless of
// `active`, so the card's own ValueOrShimmer fallback renders '—' — same treatment as any
// other genuinely-missing real-data field elsewhere in that component.
export const useMagneticFieldData = (_active: boolean) => {
  const [data] = useState<MagneticFieldData | null>(null);
  const [lastUpdated] = useState<Date | null>(null);
  return { data, lastUpdated };
};
export default useMagneticFieldData;
