import React, { useId } from 'react';
import { setSoundSettings, useSoundSettings, type SoundCategory } from '../../services/audio/soundSettings';
import { setSoundCategoryOn, setSoundOn } from '../../services/audio/sfxLibrary';
import styles from './SoundSettings.module.css';

/** The kinds of sound, as the switches name them. sfxLibrary.ts says which sound is which kind. */
const KINDS: readonly { category: SoundCategory; name: string; hint: string }[] = [
  { category: 'interface', name: 'Interface', hint: 'Clicks and switches, and panels opening and closing.' },
  { category: 'hover', name: 'Pointer over a control', hint: 'A soft tick as the mouse passes a button.' },
  { category: 'globe', name: 'Globe', hint: 'A ping when a place is pointed out, and a mark when you pick a country.' },
  { category: 'notifications', name: 'Alerts and messages', hint: 'Warnings, errors, messages and finished work.' },
];

/**
 * Settings > Sound: every sound on or off, the volume, and which kinds play.
 * Turning a kind on plays what it sounds like; letting go of the volume plays a
 * click at the new level.
 */
export const SoundSettings: React.FC = () => {
  const settings = useSoundSettings();
  const id = useId();
  const volume = Math.round(settings.volume * 100);

  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`} data-testid="sound-settings">
      <h3 id={`${id}-heading`} className={styles.heading}>Sound</h3>

      <label className={styles.row}>
        <input
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={settings.enabled}
          onChange={(event) => setSoundOn(event.target.checked)}
          data-sfx="none"
        />
        <span className={styles.text}>
          <span className={styles.name}>Sound</span>
          <span className={styles.hint}>Off until you turn it on. Kept in this browser.</span>
        </span>
      </label>

      <div className={styles.volume}>
        <label className={styles.name} htmlFor={`${id}-volume`}>Volume</label>
        <input
          id={`${id}-volume`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          disabled={!settings.enabled}
          className={styles.slider}
          onChange={(event) => setSoundSettings({ volume: Number(event.target.value) / 100 })}
        />
        <output htmlFor={`${id}-volume`} className={styles.value}>{volume}%</output>
      </div>

      <fieldset className={styles.kinds} disabled={!settings.enabled}>
        <legend className={styles.legend}>What plays</legend>
        {KINDS.map((kind) => (
          <label key={kind.category} className={styles.row}>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={settings.categories[kind.category]}
              onChange={(event) => setSoundCategoryOn(kind.category, event.target.checked)}
              data-sfx="none"
            />
            <span className={styles.text}>
              <span className={styles.name}>{kind.name}</span>
              <span className={styles.hint}>{kind.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
};

export default SoundSettings;
