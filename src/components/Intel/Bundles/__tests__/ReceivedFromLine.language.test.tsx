/**
 * Whose a received record is, in the language shown (decision D-ML, L3): the sender's name and the time
 * placed where the language puts them, and the Private records it cites counted by its own plural forms.
 */
import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReceivedFromLine from '../ReceivedFromLine';
import { setLanguage } from '../../../../i18n/app/i18n';

const FROM = { pubkey: 'c'.repeat(64), sentAt: '2026-10-03T09:00:00.000Z' };

afterEach(async () => { await setLanguage('en', false); });

describe('ReceivedFromLine, in another language', () => {
  it('says who sent it and when, and counts what they kept back, in Ukrainian', async () => {
    await setLanguage('uk', false);
    render(<ReceivedFromLine receivedFrom={{ ...FROM, withheld: ['a', 'b', 'c'] } as never} />);
    const line = screen.getByTestId('received-from');
    expect(line.textContent).toMatch(/^Від .+, 3 жовт\. 2026 р\. 09:00Z\. Посилається на 3 записи, які вони тримають приватними; їх не надіслано\.$/);
    expect(line.querySelector('time')).not.toBeNull();
  });

  it('reads as it always has in English', () => {
    render(<ReceivedFromLine receivedFrom={{ ...FROM, withheld: ['a'] } as never} />);
    expect(screen.getByTestId('received-from').textContent).toMatch(/^From .+, 3 Oct 2026 09:00Z\. It cites 1 record they keep Private, which was not sent\.$/);
  });
});
