/**
 * The diff is where a lookup stops describing a state and starts describing a
 * movement — and where a careless comparison manufactures events.
 */
import { describe, it, expect } from 'vitest';
import { diffSnapshots, describeChange, type ReconSnapshot } from '../reconDiff';

const snap = (over: Partial<ReconSnapshot> = {}): ReconSnapshot => ({
  target: 'example.com',
  observedAt: '2026-09-01T00:00:00.000Z',
  certificateNames: ['a.example.com'],
  mx: ['10 mail.example.com'],
  nameservers: ['ns1.example.net'],
  addresses: ['1.2.3.4'],
  registrationExpires: '2027-01-01',
  ...over,
});

describe('diffSnapshots', () => {
  it('returns null when nothing moved, so nothing is rendered', () => {
    expect(diffSnapshots(snap(), snap({ observedAt: '2026-09-02T00:00:00.000Z' }))).toBeNull();
  });

  it('reports a new certificate name as new infrastructure', () => {
    const change = diffSnapshots(snap(), snap({ certificateNames: ['a.example.com', 'staging.example.com'] }));
    expect(change?.certificateNamesAdded).toEqual(['staging.example.com']);
  });

  it('NEVER calls a missing certificate name a removal, because the log is append-only', () => {
    // crt.sh paginates, rate-limits and times out. A name that came back last
    // time and not this time was not decommissioned — the read differed.
    const change = diffSnapshots(snap({ certificateNames: ['a.example.com', 'b.example.com'] }), snap());
    expect(change).toBeNull(); // not movement at all
  });

  it('records the not-returned names separately when something else did move', () => {
    const change = diffSnapshots(
      snap({ certificateNames: ['a.example.com', 'b.example.com'] }),
      snap({ nameservers: ['ns9.other.net'] }),
    );
    expect(change?.certificateNamesNotReturned).toEqual(['b.example.com']);
    // Present as context, and not as an event of its own.
    expect(change?.nameserversAdded).toEqual(['ns9.other.net']);
  });

  it('DOES report a removed DNS record, because DNS is a live answer', () => {
    const change = diffSnapshots(snap(), snap({ mx: [] }));
    expect(change?.mxRemoved).toEqual(['10 mail.example.com']);
  });

  it('is case-insensitive, since resolvers vary the case they return', () => {
    expect(diffSnapshots(snap(), snap({ nameservers: ['NS1.EXAMPLE.NET'] }))).toBeNull();
  });

  it('notices a registration expiry moving', () => {
    const change = diffSnapshots(snap(), snap({ registrationExpires: '2028-01-01' }));
    expect(change?.registrationExpiryChanged).toEqual({ from: '2027-01-01', to: '2028-01-01' });
  });
});

describe('describeChange', () => {
  it('leads with a nameserver change, which is a change of control', () => {
    const change = diffSnapshots(snap(), snap({
      nameservers: ['ns9.other.net'],
      certificateNames: ['a.example.com', 'new.example.com'],
      addresses: ['9.9.9.9'],
    }))!;
    const lines = describeChange(change);
    expect(lines[0]).toMatch(/change of control/i);
    // A CDN shuffle is real and least urgent, so it goes last.
    expect(lines[lines.length - 1]).toMatch(/CDN/i);
  });
});
