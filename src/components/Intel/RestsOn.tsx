import React, { useState } from 'react';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { useCitedObservations, type CitedObservation } from '../../services/intel/observations/useCitedObservations';
import { seenWords, howObserved } from '../../services/intel/observations/fieldObservations';
import { formatCoordinate } from '../../types/intel/SourceObservation';
import { formatUtcDateTime } from '../../utils/utcTime';
import { readsRelay } from '../../services/nostr/publishTargets';
import styles from './RestsOn.module.css';
import OperatorCard from './OperatorCard';
import type { FieldObservation } from '../../services/intel/observations/fieldObservations';

/** An observation by the start of its id; the whole id is on hover. */
const named = (id: string) => `this observation (${id.slice(0, 8)}…)`;

/**
 * Why a cited observation is not shown, in words true of this node (D-MX,
 * MX23). The relay a citation names is asked only when this node reads it
 * anyway, so the sentence about it says which.
 */
function notShown(cite: ReportCitation, answer: CitedObservation | undefined): string {
  if (!answer || answer.state === 'looking') return `Looking for ${named(cite.eventId)} on the relays Starcom reads.`;
  if (answer.state === 'unreachable') return `No relay Starcom reads answered, so ${named(cite.eventId)} could not be looked for.`;
  const unasked = cite.relay && !readsRelay('MISSION', cite.relay)
    ? ` It names ${cite.relay}, which Starcom does not ask: asking would tell that relay who is reading.`
    : '';
  return `No relay Starcom reads holds ${named(cite.eventId)}.${unasked}`;
}

/**
 * RestsOn — the observations a report or package cites (decision D-MX: MX3,
 * MX19, MX23): what was seen, how, when, where and who says so, each as read
 * here, or why it could not be.
 */
export const RestsOn: React.FC<{ cites: readonly ReportCitation[] }> = ({ cites }) => {
  const answers = useCitedObservations(cites);
  // The operator whose card is open (D-MX: MX8, MX25).
  const [card, setCard] = useState<{ row: FieldObservation; anchor: HTMLElement } | null>(null);
  return (
    <>
    <ul className={styles.list} data-testid="rests-on">
      {cites.map((cite) => {
        const answer = answers.get(cite.eventId);
        return (
          <li key={cite.eventId} className={styles.item} data-testid="cited-observation" title={cite.eventId}>
            {answer?.state === 'read' ? (
              <>
                <span className={styles.seen}>{seenWords(answer.row.seen)}</span>
                <span className={styles.detail}>
                  {howObserved(answer.row.method)} on {formatUtcDateTime(Date.parse(answer.row.observedAt), { year: true })}
                  {' · '}
                  {formatCoordinate(answer.row.lat, answer.row.lon, answer.row.precisionM, { showUncertainty: true })}
                  {' · '}
                  <button
                    type="button"
                    className={styles.operator}
                    title="Their standing, as NavCom derives it"
                    onClick={(e) => setCard({ row: answer.row, anchor: e.currentTarget })}
                    data-testid="cited-operator"
                  >
                    {answer.row.operatorLabel}
                  </button>
                </span>
              </>
            ) : (
              <span className={styles.detail}>{notShown(cite, answer)}</span>
            )}
          </li>
        );
      })}
    </ul>
    {card && <OperatorCard operator={card.row.operator} label={card.row.operatorLabel} anchorEl={card.anchor} onClose={() => setCard(null)} />}
    </>
  );
};
