/**
 * Where a note's information was published, to follow (decision D-CT, CT2): its sources from its
 * `r` tags, in tag order. The first is marked as the original source; each is named by its host.
 *
 * The links come from public relays. They are read again here, so a stored copy cannot slip one
 * through: http and https only, at most 20, each opened in a new tab with no opener and no referrer.
 */
import React from 'react';
import { sourceLinkItems } from '../../services/intel/sourceLinks';
import styles from './SourceLinks.module.css';

export interface SourceLinksProps {
  links: readonly unknown[] | undefined;
  /** Say that none was given, rather than show nothing. */
  sayNone?: boolean;
  className?: string;
  /** The heading's look where the view has its own (a popup's panel titles); '' takes the view's own rule. */
  headingClassName?: string;
  /** The heading's level, to sit among the view's own headings. */
  headingAs?: 'h3' | 'h4';
  testId?: string;
}

export const SourceLinks: React.FC<SourceLinksProps> = ({ links, sayNone = false, className, headingClassName, headingAs: Heading = 'h3', testId = 'source-links' }) => {
  const items = sourceLinkItems(links);
  if (!items.length && !sayNone) return null;
  return (
    <section className={`${styles.sources}${className ? ` ${className}` : ''}`} aria-label="Sources" data-testid={testId}>
      <Heading className={headingClassName ?? styles.heading}>Sources</Heading>
      {items.length === 0 ? (
        <p className={styles.none}>No source link was given.</p>
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <li key={item.href} className={styles.item}>
              <a className={styles.link} href={item.href} target="_blank" rel="noopener noreferrer" title={item.href}>
                {item.host}
              </a>
              {item.original && <span className={styles.original}>Original source</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default SourceLinks;
