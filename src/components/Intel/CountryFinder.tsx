import React, { useRef, useState } from 'react';
import { loadTerritories } from '../Globe/Hooks/useTerritories';
import { findCountries, type Country } from '../../services/intel/place/findCountry';
import { findAreas } from '../../features/globe/areas/findArea';
import styles from './CountryFinder.module.css';

/**
 * Find a country by what it is called, and say the report is about it (plan
 * item 3.5, story S6). The Jurisdictions field wanted codes ("us, us-nj"),
 * which a newcomer does not know. The countries are the globe's own, loaded
 * the first time this is used, so nothing typed here leaves the browser.
 * An area too (BA24): a continent, union, sphere or zone, by its code.
 *
 * A country is a jurisdiction, not a point: choosing one never places the
 * report at the country's centre, which would put it where nobody said.
 *
 * `countriesOnly` leaves the areas out, for a mission's field-work region,
 * which is a country or a state (D-MX, MX11).
 */
const CountryFinder: React.FC<{
  /** The chosen country's or area's code, lower case as jurisdictions are written, and its name. */
  onChoose: (code: string, name: string) => void;
  countriesOnly?: boolean;
}> = ({ onChoose, countriesOnly = false }) => {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  const load = () => {
    if (asked.current) return;
    asked.current = true;
    void loadTerritories().then((index) => {
      if (index) setCountries(index.countries());
      else { setFailed(true); asked.current = false; }
    });
  };

  const matches = countries ? findCountries(query, countries) : [];
  const areas = countries && !countriesOnly ? findAreas(query) : [];
  return (
    <div className={styles.finder}>
      <input
        type="search"
        aria-label={countriesOnly ? 'Find a country' : 'Find a country or area'}
        placeholder={countriesOnly ? 'Find a country by name' : 'Find a country or area by name'}
        value={query}
        onFocus={load}
        onChange={(e) => { load(); setQuery(e.target.value); }}
        data-testid="country-finder"
      />
      {query.trim() && countries && (
        matches.length + areas.length > 0 ? (
          <div className={styles.matches}>
            {matches.map((c) => (
              <button key={c.code} type="button" className={styles.match} onClick={() => { onChoose(c.code.toLowerCase(), c.name); setQuery(''); }}>
                {c.name}
              </button>
            ))}
            {areas.map((a) => (
              <button key={a.code} type="button" className={styles.match} onClick={() => { onChoose(a.code, a.name); setQuery(''); }}>
                {a.name} · {a.kind}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.note}>
            {countriesOnly
              ? 'No country called that. For a state, type its code in Region (us-ca).'
              : 'No country or area called that. A place inside one: pick its country, or its point on the globe.'}
          </div>
        )
      )}
      {failed && <div className={styles.note}>The countries could not be loaded. Type its code in {countriesOnly ? 'Region' : 'Jurisdictions'} instead.</div>}
    </div>
  );
};

export default CountryFinder;
