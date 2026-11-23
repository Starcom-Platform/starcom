// CommHubDetailPopup.tsx — click-to-select detail popup for the CommHubs globe layer.
// Mirrors CountryInfoPopup's visual shape (dark panel, header/close-button/body,
// backdrop) — mounted via usePopup()'s showPopup (see PopupManager.tsx), which already
// supplies the backdrop, z-index, and Escape-to-close handling.
import React from 'react';
import type { CommHubPickResult, SubmarineCable } from '../../../types/CommHubs';
import styles from './CommHubDetailPopup.module.css';

export interface CommHubDetailPopupProps {
  item: CommHubPickResult;
  onClose: () => void;
}

function formatCableStatus(cable: SubmarineCable): string {
  // isPlanned === false should always imply a known rfsYear (see
  // SubmarineCableService.ts's derivation), but that's a convention the type system
  // doesn't enforce across the two independent fields — guard the combination anyway
  // rather than ever rendering the literal string "undefined" to a user.
  if (!cable.isPlanned) {
    return cable.rfsYear !== undefined ? `Active — in service since ${cable.rfsYear}` : 'Active — in-service date unknown';
  }
  if (cable.rfsYear) return `Planned — expected ${cable.rfsYear}`;
  return 'Planned — no confirmed in-service date';
}

// Real per-cable owners/length come through as free-text strings from the source and can
// legitimately be present-but-empty (""), which ?? wouldn't catch (only null/undefined) —
// this treats an empty string the same honest "Unknown" way as a genuinely missing field.
function orUnknown(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : 'Unknown';
}

export const CommHubDetailPopup: React.FC<CommHubDetailPopupProps> = ({ item, onClose }) => {
  const title = item.type === 'cable' ? item.cable.name : item.point.name;
  const kind = item.type === 'cable' ? 'Submarine Cable' : 'Landing Point';

  return (
    /*
     * PopupFrame is the dialog — see CountryInfoPopup for the full reasoning.
     * A Modal here made a second one and a second focus trap, and the inner div
     * a third, for one panel.
     */
    <>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            <div className={styles.kind}>{kind}</div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {item.type === 'cable' ? (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Status</div>
                <div className={`${styles.badge} ${item.cable.isPlanned ? styles.badgePlanned : styles.badgeActive}`}>
                  {formatCableStatus(item.cable)}
                </div>
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Owners</div>
                <div className={styles.value}>{orUnknown(item.cable.owners)}</div>
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Length</div>
                <div className={styles.value}>{orUnknown(item.cable.length)}</div>
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Landing Countries ({item.cable.landingPoints.length})</div>
                {item.cable.landingPoints.length > 0 ? (
                  <ul className={styles.list}>
                    {Array.from(new Set(
                      item.cable.landingPoints
                        .map((lp) => lp.country?.trim())
                        .filter((country): country is string => Boolean(country))
                    )).map((country) => (
                      <li key={country} className={styles.listItem}>{country}</li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyState}>No per-cable landing-point detail available for this cable.</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Country</div>
                <div className={styles.value}>{item.country ?? 'Unknown'}</div>
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Connected Cables ({item.cableCount})</div>
                {item.connectedCables.length > 0 ? (
                  <ul className={styles.list}>
                    {item.connectedCables.map((cable) => (
                      <li key={cable.id} className={styles.listItem}>{cable.name}</li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyState}>No real per-cable detail available for this point.</div>
                )}
              </div>
              {item.point.isTbd && (
                <div className={styles.section}>
                  <div className={styles.badge} style={{ borderColor: '#64748b', color: '#94a3b8' }}>
                    Announced, location to be finalized
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CommHubDetailPopup;
