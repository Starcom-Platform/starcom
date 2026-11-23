import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import EventTimeFields from '../EventTimeFields';
import { EMPTY_EVENT_TIME_FIELDS, type EventTimeFields as Fields } from '../../../utils/eventTime';

let latest: Fields = EMPTY_EVENT_TIME_FIELDS;
const Harness: React.FC<{ initial?: Partial<Fields> }> = ({ initial }) => {
  const [value, setValue] = useState<Fields>({ ...EMPTY_EVENT_TIME_FIELDS, ...initial });
  latest = value;
  return <EventTimeFields value={value} onChange={setValue} />;
};

describe('EventTimeFields', () => {
  it('takes a date and time in UTC, says what it will record, and shows the local time beside it', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2026-07-27' } });
    fireEvent.change(screen.getByLabelText('Start time (UTC)'), { target: { value: '21:24' } });

    expect(screen.getByText('Recorded as 27 Jul 2026 21:24Z')).toBeInTheDocument();
    expect(screen.getByText(/^Local: /)).toBeInTheDocument();
  });

  it('records a date with the time unknown as the whole day, and stops asking for a time', () => {
    render(<Harness initial={{ startDate: '2026-07-27', startTime: '21:24' }} />);
    fireEvent.click(screen.getByLabelText('Time unknown'));

    expect(screen.queryByLabelText('Start time (UTC)')).not.toBeInTheDocument();
    expect(latest.precision).toBe('day');
    expect(screen.getByText('Recorded as 27 Jul 2026')).toBeInTheDocument();
  });

  it('asks for a time again when a precision with one is chosen', () => {
    render(<Harness initial={{ startDate: '2026-07-27', precision: 'day' }} />);
    fireEvent.change(screen.getByLabelText('Known to within'), { target: { value: 'hour' } });

    expect(screen.getByLabelText('Start time (UTC)')).toBeInTheDocument();
    expect(screen.getByLabelText('Time unknown')).not.toBeChecked();
  });

  it('says what is wrong instead of what it will record', () => {
    render(<Harness initial={{ startDate: '2026-07-27', endDate: '2026-07-20', precision: 'day' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The end is before the start');
    expect(screen.queryByText(/^Recorded as/)).not.toBeInTheDocument();
  });

  it('says when nothing will be recorded', () => {
    render(<Harness />);
    expect(screen.getByText('No event time given.')).toBeInTheDocument();
  });
});
