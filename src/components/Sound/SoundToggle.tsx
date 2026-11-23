import React from 'react';
import { Glyph } from '../../symbols/Glyph';
import { useSoundSettings } from '../../services/audio/soundSettings';
import { setSoundOn } from '../../services/audio/sfxLibrary';
import { useMessages } from '../../i18n/app/i18n';

/**
 * Sound on or off, one press from any screen (asked for 2026-10-05). Off until
 * pressed, by decision N12. It shows the state: a speaker while sound is on, a
 * struck-out speaker while it is off. The volume, and which kinds of sound
 * play, are in Settings.
 */
export const SoundToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { enabled } = useSoundSettings();
  const { m: { header: t } } = useMessages();
  return (
    <button
      type="button"
      className={className}
      aria-label={t.sound}
      aria-pressed={enabled}
      title={enabled ? t.soundOn : t.soundOff}
      // It plays its own: a chirp down before muting, a chirp up once on.
      data-sfx="none"
      data-testid="sound-toggle"
      onClick={() => setSoundOn(!enabled)}
    >
      <Glyph name={enabled ? 'action:soundOn' : 'action:soundOff'} size={20} />
    </button>
  );
};

export default SoundToggle;
