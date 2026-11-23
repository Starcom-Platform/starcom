/**
 * GlobeAppearancePopup — how the planet looks, where its light comes from, and how much
 * detail this device draws (services/globe/globeQuality.ts).
 *
 * Both were decided for the viewer before this existed. The globe had three looks,
 * picked by whichever data mode was selected, with no control and no label; and the
 * light came from a point fixed above the north pole, in every mode, whatever the
 * clock said. See services/globe/globeAppearance.ts and globe-engine/globeLighting.ts.
 *
 * A share card names both, because both change what a reader sees — and the two light
 * modes that are not the Sun put a caveat on the card saying the day/night line on
 * that image is not real (features/globe/capture/shareCardProvenance.ts).
 */
import React, { useSyncExternalStore } from 'react';
import {
  getGlobeAppearance, subscribeGlobeAppearance, setGlobeAppearance,
  GLOBE_SKIN_LABELS, GLOBE_LIGHT_MODE_LABELS,
  type GlobeSkin, type GlobeLightMode,
} from '../../../services/globe/globeAppearance';
import {
  getGlobeQuality, subscribeGlobeQuality, setGlobeQualitySetting, describeGlobeQuality,
  GLOBE_QUALITY_LABELS, type GlobeQualitySetting,
} from '../../../services/globe/globeQuality';
import styles from './GeopoliticalLayersPopup.module.css';

interface GlobeAppearancePopupProps {
  onClose: () => void;
}

const SKIN_ORDER: Array<GlobeSkin | 'auto'> = ['auto', 'blueMarble', 'dayNight', 'cyberEarth', 'terrain'];

const SKIN_NOTES: Record<GlobeSkin | 'auto', string> = {
  auto: 'The look this data mode has always had.',
  blueMarble: 'The photograph, lit by the Sun.',
  dayNight: 'Daylight where it is day, city lights where it is night.',
  cyberEarth: 'An instrument reading: land and sea in cyan, a graticule, a lit rim.',
  terrain: 'Relief in neutral greys, so the marks on top are the only colour.',
};

const LIGHT_MODE_ORDER: GlobeLightMode[] = ['sun', 'headlamp', 'flat'];

const LIGHT_MODE_NOTES: Record<GlobeLightMode, string> = {
  sun: 'Where the Sun actually is. Half the globe is night, because half of it is.',
  headlamp: 'From the camera, so nothing is in shadow. The day/night line is not real.',
  flat: 'Even light, no day/night line at all. Marks read the same wherever they are.',
};

const QUALITY_ORDER: GlobeQualitySetting[] = ['auto', 'high', 'low'];

const GlobeAppearancePopup: React.FC<GlobeAppearancePopupProps> = ({ onClose }) => {
  const appearance = useSyncExternalStore(subscribeGlobeAppearance, getGlobeAppearance, getGlobeAppearance);
  const quality = useSyncExternalStore(subscribeGlobeQuality, getGlobeQuality, getGlobeQuality);

  return (
    <section className={styles.popup} aria-label="Globe appearance popup">
      <header className={styles.header}>
        <h2 className={styles.title}>Globe Appearance</h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close globe appearance popup"
        >
          ✕
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Planet</div>
          {SKIN_ORDER.map((skin) => (
            <label key={skin} className={styles.toggleRow}>
              <input
                type="radio"
                name="globe-skin"
                checked={appearance.skin === skin}
                onChange={() => setGlobeAppearance({ skin })}
                data-testid={`globe-skin-${skin}`}
              />
              {GLOBE_SKIN_LABELS[skin]}
            </label>
          ))}
          <div className={styles.hint}>{SKIN_NOTES[appearance.skin]}</div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Light</div>
          {LIGHT_MODE_ORDER.map((mode) => (
            <label key={mode} className={styles.toggleRow}>
              <input
                type="radio"
                name="globe-light-mode"
                checked={appearance.lightMode === mode}
                onChange={() => setGlobeAppearance({ lightMode: mode })}
                data-testid={`globe-light-${mode}`}
              />
              {GLOBE_LIGHT_MODE_LABELS[mode]}
            </label>
          ))}
          <div className={styles.hint}>{LIGHT_MODE_NOTES[appearance.lightMode]}</div>

          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Night side</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(appearance.nightFill * 100)}
              onChange={(e) => setGlobeAppearance({ nightFill: parseInt(e.target.value, 10) / 100 })}
              className={styles.slider}
              aria-label="How much of the day side still shows at night, percent"
              disabled={appearance.lightMode !== 'sun'}
              data-testid="globe-night-fill"
            />
            <span className={styles.sliderValue}>{Math.round(appearance.nightFill * 100)}</span>
          </label>
          <div className={styles.hint}>
            {appearance.lightMode === 'sun'
              ? 'A dark half with nothing in it makes the marks on it unreadable.'
              : 'Only the Sun casts a night side.'}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Quality</div>
          {QUALITY_ORDER.map((q) => (
            <label key={q} className={styles.toggleRow}>
              <input
                type="radio"
                name="globe-quality"
                checked={quality.setting === q}
                onChange={() => setGlobeQualitySetting(q)}
                data-testid={`globe-quality-${q}`}
              />
              {GLOBE_QUALITY_LABELS[q]}
            </label>
          ))}
          <div className={styles.hint} data-testid="globe-quality-status">{describeGlobeQuality(quality)}</div>
        </div>
      </div>
    </section>
  );
};

export default GlobeAppearancePopup;
