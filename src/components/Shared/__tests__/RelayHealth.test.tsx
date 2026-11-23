/**
 * Relay health and the capacity gauge, drawn (BD11, BD12). Colour is never the
 * only signal: each light has its shape and its words, the gauge its word.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelayLights, RelayHealthList, CapacityGauge } from '../RelayHealth';

const now = Date.UTC(2026, 9, 5, 12);
const relays = [
  { url: 'wss://relay.damus.io', connected: true, lastAnsweredAt: now - 40_000 },
  { url: 'wss://nos.lol', connected: true },
  { url: 'wss://relay-c.example', connected: false },
  { url: 'wss://the-record.example', connected: true, lastAnsweredAt: now - 300_000 },
];

describe('RelayLights', () => {
  it('draws one light a relay, each saying its relay and its state', () => {
    render(<RelayLights relays={relays} now={now} />);
    const lights = screen.getAllByRole('img');
    expect(lights.map((l) => l.getAttribute('data-light'))).toEqual(['ok', 'degraded', 'down', 'stale']);
    expect(lights[0].getAttribute('aria-label')).toBe('relay.damus.io: answered 40 s ago');
    expect(lights[3].getAttribute('aria-label')).toBe('the-record.example: last answered 5 min ago');
  });
});

describe('RelayHealthList', () => {
  it('lists each relay with its light, its name and its words', () => {
    render(<RelayHealthList relays={relays} now={now} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[1].textContent).toContain('nos.lol');
    expect(rows[1].textContent).toContain('connected, not answered yet');
  });
});

describe('CapacityGauge', () => {
  it('says how many relays answer against the two a publish needs, by level', () => {
    render(<CapacityGauge relays={relays} now={now} />);
    const gauge = screen.getByRole('meter');
    expect(gauge.getAttribute('data-level')).toBe('danger');
    expect(gauge.getAttribute('aria-valuenow')).toBe('1');
    expect(gauge.getAttribute('aria-label')).toBe('Publish capacity: 1 answering, 2 needed, below what a publish needs');
  });

  it('is amber at exactly enough, green with room to spare', () => {
    const ok = { url: 'wss://a', connected: true, lastAnsweredAt: now - 1_000 };
    const { rerender } = render(<CapacityGauge relays={[ok, { ...ok, url: 'wss://b' }]} now={now} />);
    expect(screen.getByRole('meter').getAttribute('data-level')).toBe('caution');
    rerender(<CapacityGauge relays={[ok, { ...ok, url: 'wss://b' }, { ...ok, url: 'wss://c' }]} now={now} />);
    expect(screen.getByRole('meter').getAttribute('data-level')).toBe('ok');
  });
});
