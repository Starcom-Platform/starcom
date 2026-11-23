/**
 * While the globe is fetching, it says so — and says only what it knows.
 *
 * A first visit measured 14.7 s from load to the first report, during which the
 * globe drew nothing and said nothing (decision D-F, step 4). This is the sentence
 * that fills that silence.
 *
 * It says CONNECTED, not answered. `relay.connected` is set when a probe socket
 * opens or a subscription reaches end-of-stored-events — both mean a connection was
 * genuinely established, so the word never overstates, and it is the same field the
 * marquee renders as UP. Neither is an answer, though, and nothing counts relays
 * that returned data: "3 of 5 answered" would be a claim the app cannot support, in
 * the one place a first visitor is looking.
 */
import { describe, it, expect } from 'vitest';
import { connectingToRelays, listeningForReports } from '../epistemicLanguage';

describe('listeningForReports', () => {
  it('says how many relays are connected, not how many answered', () => {
    expect(listeningForReports(3, 5).text).toBe('Listening for reports — 3 of 5 relays connected');
  });

  it('says nothing is connected yet without calling it a failure', () => {
    const { text } = listeningForReports(0, 5);

    expect(text).toBe('Listening for reports — 0 of 5 relays connected');
    expect(text).not.toMatch(/fail|error|unreachable|down/i);
  });

  it('reads correctly with a single relay', () => {
    expect(listeningForReports(1, 1).text).toBe('Listening for reports — 1 of 1 relay connected');
  });

  it('is an ordinary note, not a warning', () => {
    expect(listeningForReports(0, 5).tone).toBe('info');
  });
});

/**
 * Before the ingest exists at all.
 *
 * `relay.connected` is set when a probe socket opens or a subscription reaches
 * end-of-stored-events, so it reads 0 while sockets are still opening. Showing
 * "0 of 5 relays connected" at second one would present a floor as a measurement,
 * and a visitor would reasonably read it as five relays refusing.
 */
describe('connectingToRelays', () => {
  it('says it is connecting, without claiming a count', () => {
    const { text } = connectingToRelays();

    expect(text).toBe('Listening for reports — connecting to relays');
    expect(text).not.toMatch(/\d/);
  });

  it('is an ordinary note, not a warning', () => {
    expect(connectingToRelays().tone).toBe('info');
  });
});
