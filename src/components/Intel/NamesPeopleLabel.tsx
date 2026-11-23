/**
 * The label beside a note that names a person, as a cited source names them (decision D-NP, NP1; the operator,
 * 13 October): "names a person, as <source> names them", the source being its original link's host. Nothing for a
 * note its publisher did not tag `names_people`.
 */
import React from 'react';
import { sourceLinkItems } from '../../services/intel/sourceLinks';
import { fill, useMessages } from '../../i18n/app/i18n';
import styles from './NamesPeopleLabel.module.css';

export const NamesPeopleLabel: React.FC<{ namesPeople?: boolean; sources?: readonly unknown[]; className?: string }> = ({
  namesPeople, sources, className,
}) => {
  const { m: { shared } } = useMessages();
  if (!namesPeople) return null;
  const source = sourceLinkItems(sources).find((item) => item.original)?.host;
  return (
    <span className={`${styles.label}${className ? ` ${className}` : ''}`} data-testid="names-people-label">
      {fill(shared.namesPeople.label, { source: source ?? shared.namesPeople.itsSource })}
    </span>
  );
};

export default NamesPeopleLabel;
