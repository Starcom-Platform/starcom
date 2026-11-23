/**
 * A time as Starcom shows it: in UTC, marked Z, with the viewer's local time on
 * hover (decision D-E, docs/missions/01-architecture-decisions/time-model.md). A
 * moment shows its date and time, and `year` adds the year where a record may be
 * old. A value that is a day rather than a moment (`day`: a case's start) shows its
 * UTC date alone, with nothing on hover, since a day has no local time to give. A
 * stored value that cannot be read is shown as it was stored, rather than as a date
 * it cannot know.
 */
import React from 'react';
import { useMessages } from '../../i18n/app/i18n';
import { localTitleIn, utcDateIn, utcDateTimeIn } from '../../i18n/app/dates';

interface UtcTimeProps {
  at: Date | string | number | null | undefined;
  year?: boolean;
  day?: boolean;
}

const toMs = (at: Date | string | number): number =>
  at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);

const UtcTime: React.FC<UtcTimeProps> = ({ at, year = false, day = false }) => {
  const { lang, m } = useMessages();
  if (at === null || at === undefined) return null;
  const ms = toMs(at);
  if (!Number.isFinite(ms)) {
    // A Date object that holds no time has nothing stored to show.
    return at instanceof Date ? null : <span>{String(at)}</span>;
  }
  const iso = new Date(ms).toISOString();
  // The date as the language shown writes it, still in UTC (D-ML, L3); the time "19:33Z" in every language.
  if (day) return <time dateTime={iso.slice(0, 10)}>{utcDateIn(lang, ms, year)}</time>;
  return (
    <time dateTime={iso} title={localTitleIn(lang, ms, m.time.local)}>
      {utcDateTimeIn(lang, ms, year)}
    </time>
  );
};

export default UtcTime;
