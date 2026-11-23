/**
 * "When did it happen?" — a report's event time, as the composer asks for it
 * (decision D-E, docs/missions/01-architecture-decisions/time-model.md).
 *
 * Entered in UTC, like every time the app shows, with the local time beside it.
 * Under the fields it says exactly what will be recorded, so a time rounded to its
 * precision is not a surprise after saving. The rules live in utils/eventTime.ts.
 */
import React from 'react';
import styles from './EventTimeFields.module.css';
import {
  EVENT_TIME_PRECISIONS,
  eventTimeFromFields,
  formatEventTime,
  precisionHasTime,
  type EventTimeFields as EventTimeFieldValues,
  type EventTimePrecision,
} from '../../utils/eventTime';
import { fill, useMessages } from '../../i18n/app/i18n';
import { localTitleIn } from '../../i18n/app/dates';

interface Props {
  value: EventTimeFieldValues;
  onChange: (next: EventTimeFieldValues) => void;
}

const EventTimeFields: React.FC<Props> = ({ value, onChange }) => {
  const { lang, m: { eventTime: t, time } } = useMessages();
  const set = (patch: Partial<EventTimeFieldValues>) => onChange({ ...value, ...patch });
  const timeKnown = precisionHasTime(value.precision);
  const { value: recorded, error } = eventTimeFromFields(value, t.errors);
  const summary = formatEventTime(recorded, lang, t);

  return (
    <fieldset className={styles.eventTime}>
      <legend className={styles.legend}>
        {t.question} <span className={styles.zone}>UTC</span>
      </legend>

      <div className={styles.row}>
        <span className={styles.label}>{t.from}</span>
        <input
          type="date"
          aria-label={t.startDate}
          value={value.startDate}
          onChange={(e) => set({ startDate: e.target.value })}
        />
        {timeKnown && (
          <>
            <input
              type="time"
              aria-label={t.startTime}
              value={value.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
            />
            <span className={styles.zone}>Z</span>
          </>
        )}
        <label className={styles.unknown}>
          <input
            type="checkbox"
            checked={!timeKnown}
            onChange={(e) =>
              set(e.target.checked ? { precision: 'day', startTime: '', endTime: '' } : { precision: 'minute' })
            }
          />
          {t.timeUnknown}
        </label>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>{t.to}</span>
        <input
          type="date"
          aria-label={t.endDate}
          value={value.endDate}
          onChange={(e) => set({ endDate: e.target.value })}
        />
        {timeKnown && (
          <>
            <input
              type="time"
              aria-label={t.endTime}
              value={value.endTime}
              onChange={(e) => set({ endTime: e.target.value })}
            />
            <span className={styles.zone}>Z</span>
          </>
        )}
        <span className={styles.hint}>{t.optional}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>{t.knownTo}</span>
        <select
          aria-label={t.knownTo}
          value={value.precision}
          onChange={(e) => set({ precision: e.target.value as EventTimePrecision })}
        >
          {EVENT_TIME_PRECISIONS.map((precision) => (
            <option key={precision} value={precision}>
              {t.precisions[precision]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : (
        <p className={styles.recorded} aria-live="polite">
          {summary ? fill(t.recordedAs, { when: summary }) : t.noTime}
        </p>
      )}
      {!error && recorded.startDate && timeKnown && (
        <p className={styles.local}>{localTitleIn(lang, recorded.startDate.getTime(), time.local)}</p>
      )}
    </fieldset>
  );
};

export default EventTimeFields;
