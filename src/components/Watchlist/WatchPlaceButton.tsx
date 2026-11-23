/**
 * A place's Watch button (D-WL, WL4): on a country's card, it watches the country with the kinds a new watch counts,
 * and says "Watched" once it is. The card names a country by Natural Earth's ADM0_A3; a watch by its two letters, which
 * the territory index gives, so the button waits for it and shows nothing where none is found.
 */
import React, { useEffect, useState } from 'react';
import { Glyph } from '../../symbols/Glyph';
import { useMessages } from '../../i18n/app/i18n';
import { loadTerritories } from '../Globe/Hooks/useTerritories';
import { useWatches } from '../../features/watch/watchlist';
import { watchAndSay } from '../../features/watch/watchPalette';
import styles from './Watchlist.module.css';

export const WatchPlaceButton: React.FC<{ a3: string; name: string }> = ({ a3, name }) => {
  const { m: { watch: w } } = useMessages();
  const [code, setCode] = useState<string | null>(null);
  const list = useWatches();
  useEffect(() => {
    let live = true;
    void loadTerritories().then((index) => { if (live) setCode(index?.a2Of(a3)?.toLowerCase() ?? null); });
    return () => { live = false; };
  }, [a3]);
  if (!code) return null;
  const watched = list.some((x) => x.place.kind === 'territory' && x.place.code === code);
  return (
    <button
      type="button"
      className={styles.minor}
      aria-pressed={watched}
      disabled={watched}
      title={w.watchPlaceSays}
      onClick={() => watchAndSay({ kind: 'territory', code, name })}
      data-testid="watch-place"
    >
      <Glyph name="action:watchlist" size={14} /> {watched ? w.watched : w.watchThis}
    </button>
  );
};

export default WatchPlaceButton;
