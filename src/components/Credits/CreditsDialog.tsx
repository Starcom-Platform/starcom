import React from 'react';
import { IMAGERY, type ImageSource } from '../../globe-engine/imagery';
import { CREDITS } from '../../features/globe/capture/sourceCredits';
import styles from './Credits.module.css';

/**
 * Who made what Starcom draws, and under which licence (decisions TX8, TX11, TX12; record
 * docs/missions/01-architecture-decisions/earth-textures.md): every image the globe can
 * draw, with what it was made from and what Starcom changed, and every data source.
 *
 * Read from the same lists a card's credits come from (globe-engine/imagery.ts and
 * sourceCredits.ts), so the page and the cards cannot disagree. CC BY asks that changes
 * be said, and a link to a page holding the credits can meet it: this is that page.
 */
const Source: React.FC<{ source: ImageSource }> = ({ source }) => (
  <span>
    {source.url
      ? <a className={styles.link} href={source.url} target="_blank" rel="noopener noreferrer">{source.keyText ?? source.text}</a>
      : (source.keyText ?? source.text)}
    {source.licence && (
      <>
        {' ('}
        <a className={styles.link} href={source.licence.url} target="_blank" rel="noopener noreferrer">{source.licence.name}</a>
        {')'}
      </>
    )}
  </span>
);

export const CreditsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className={styles.panel} data-testid="credits">
    <div className={styles.header}>
      <h2 className={styles.title}>Credits</h2>
      <button type="button" className={styles.close} onClick={onClose}>Close</button>
    </div>
    <p className={styles.lead}>Who made what Starcom draws. A card names them too, after its data.</p>

    <section aria-labelledby="credits-imagery">
      <h3 id="credits-imagery" className={styles.heading}>Imagery</h3>
      <ul className={styles.list}>
        {Object.entries(IMAGERY).map(([id, image]) => (
          <li key={id} data-testid={`credits-image-${id}`}>
            <span className={styles.what}>{image.what}</span>
            <Source source={image.source} />
            <span className={styles.detail}>Made from {image.from}. Changed by Starcom: {image.changes}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>NASA imagery is used under NASA&apos;s media guidelines. NASA does not endorse Starcom.</p>
    </section>

    <section aria-labelledby="credits-data">
      <h3 id="credits-data" className={styles.heading}>Data</h3>
      <ul className={styles.list}>
        {Object.entries(CREDITS).map(([id, credit]) => (
          <li key={id} data-testid={`credits-data-${id}`}>
            <Source source={credit} />
          </li>
        ))}
      </ul>
    </section>
  </div>
);

export default CreditsDialog;
