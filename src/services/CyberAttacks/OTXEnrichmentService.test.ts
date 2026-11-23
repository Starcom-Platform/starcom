import { describe, it, expect } from 'vitest';
import { parseOTXResponse, enrichWithOTX } from './OTXEnrichmentService';

describe('parseOTXResponse (bug-injection verified)', () => {
  it('extracts real pulse fields from a real-shaped OTX response', () => {
    const data = {
      pulse_info: {
        count: 2,
        pulses: [
          {
            id: 'pulse-1',
            name: 'Webscanners',
            malware_families: ['Mirai'],
            attack_ids: ['T1595'],
            targeted_countries: ['United States of America'],
            industries: ['Finance'],
            TLP: 'white'
          }
        ]
      }
    };

    const result = parseOTXResponse(data, '1.2.3.4');
    expect(result).toEqual({
      ip: '1.2.3.4',
      pulseCount: 2,
      pulses: [
        {
          id: 'pulse-1',
          name: 'Webscanners',
          malwareFamilies: ['Mirai'],
          attackIds: ['T1595'],
          targetedCountries: ['United States of America'],
          industries: ['Finance'],
          tlp: 'white'
        }
      ],
      malwareFamilies: ['Mirai']
    });
  });

  it('returns null when pulse_info is missing entirely', () => {
    expect(parseOTXResponse({}, '1.2.3.4')).toBeNull();
  });

  it('returns null for non-object input rather than throwing', () => {
    expect(parseOTXResponse(null, '1.2.3.4')).toBeNull();
    expect(parseOTXResponse(undefined, '1.2.3.4')).toBeNull();
    expect(parseOTXResponse('not an object', '1.2.3.4')).toBeNull();
  });

  it('handles a real IP with zero pulses (reputation 0, no community reports)', () => {
    const data = { pulse_info: { count: 0, pulses: [] } };
    const result = parseOTXResponse(data, '1.2.3.4');
    expect(result).toEqual({ ip: '1.2.3.4', pulseCount: 0, pulses: [], malwareFamilies: [] });
  });

  it('caps pulses at maxPulses rather than processing every real pulse on a heavily-tagged IP', () => {
    const pulses = Array.from({ length: 50 }, (_, i) => ({
      id: `pulse-${i}`,
      name: `Pulse ${i}`,
      malware_families: [],
      attack_ids: [],
      targeted_countries: [],
      industries: [],
      TLP: 'white'
    }));
    const data = { pulse_info: { count: 50, pulses } };
    const result = parseOTXResponse(data, '1.2.3.4', 10);
    expect(result?.pulses).toHaveLength(10);
    expect(result?.pulseCount).toBe(50); // real total count preserved even though pulses is capped
  });

  it('dedupes and sorts malware families collected across multiple real pulses', () => {
    const data = {
      pulse_info: {
        count: 2,
        pulses: [
          { id: 'a', name: 'A', malware_families: ['Zeus', 'Mirai'], attack_ids: [], targeted_countries: [], industries: [], TLP: 'white' },
          { id: 'b', name: 'B', malware_families: ['Mirai', 'Emotet'], attack_ids: [], targeted_countries: [], industries: [], TLP: 'white' }
        ]
      }
    };
    const result = parseOTXResponse(data, '1.2.3.4');
    expect(result?.malwareFamilies).toEqual(['Emotet', 'Mirai', 'Zeus']);
  });

  it('skips malformed pulse entries gracefully instead of crashing', () => {
    const data = {
      pulse_info: {
        count: 1,
        pulses: [
          { id: 123, name: null, malware_families: 'not-an-array', attack_ids: undefined }
        ]
      }
    };
    const result = parseOTXResponse(data, '1.2.3.4');
    expect(result?.pulses).toEqual([
      { id: '', name: '', malwareFamilies: [], attackIds: [], targetedCountries: [], industries: [], tlp: '' }
    ]);
  });
});

describe('enrichWithOTX — real live data (not mocked)', () => {
  it('fetches real per-IP OTX enrichment for a real IP known to have community pulses', async () => {
    // Real IP (a real SSH-scanning source out of firehol's blocklist_de_ssh, verified live
    // during this session's research) confirmed to carry 13 real community pulses with a
    // fast (~1s) response — a typical case, unlike heavily-tagged outlier IPs that can
    // carry 50+ pulses and take much longer for OTX to serialize.
    const result = await enrichWithOTX(['1.0.164.165'], 1);

    const enrichment = result.get('1.0.164.165');
    expect(enrichment).toBeDefined();
    expect(enrichment!.pulseCount).toBeGreaterThan(0);
    expect(Array.isArray(enrichment!.pulses)).toBe(true);
  }, 30000);

  it('respects the real maxIPs cap rather than enriching an unbounded list', async () => {
    const result = await enrichWithOTX(['1.1.1.1', '8.8.8.8', '9.9.9.9'], 1);
    expect(result.size).toBeLessThanOrEqual(1);
  }, 30000);
});
