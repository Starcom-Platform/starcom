/**
 * When the Cyber Threats layer cannot get data, it must say so — not draw some.
 *
 * getData() used to answer any failure, and merely hitting its own rate limit,
 * with generateMockAttackData(): fifty random attacks from China, Russia, North
 * Korea, Iran, the US and Brazil onto the US, UK, Germany, Japan, Australia and
 * Canada. The globe drew them and the share card captioned them as freshly
 * loaded. These tests run with the service's real default — mock data OFF —
 * which the neighbouring RealTimeAttackService.test.ts forces on for its
 * streaming tests, and which is why none of them could see this.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const real = vi.hoisted(() => ({ attacks: vi.fn() }));
vi.mock('../RealBlocklistService', () => ({ getRealCyberAttacks: (...args: unknown[]) => real.attacks(...args) }));

import { RealTimeAttackService } from '../RealTimeAttackService';

const attack = (ip: string) => ({
  id: `real-blocklist-${ip}-0`, type: 'CyberAttacks', location: { latitude: 38, longitude: -97 },
  timestamp: new Date('2026-09-11T06:00:00Z'),
  metadata: { source: 'Blocklist.de (SSH)', confidence: 0.85, analyst: 'RealBlocklistService', realIp: ip, isNew: false },
  priority: 'critical', status: 'active', attack_type: 'NetworkIntrusion', attack_vector: 'Network',
  attack_phase: 'Initial_Access', severity: 4, attack_status: 'detected',
  trajectory: {
    source: { latitude: 38, longitude: -97, countryCode: 'USA', organization: 'x', confidence: 0.85 },
    target: { latitude: 38, longitude: -97, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 },
    duration: 0,
  },
  timeline: { firstDetected: new Date('2026-09-11T06:00:00Z'), lastSeen: new Date('2026-09-11T06:00:00Z') },
  technical_data: { mitre_tactic: [], protocols: [], ports: [], systems_affected: 0 },
});

const limited = (svc: RealTimeAttackService) =>
  ((svc as unknown as { streamRateLimiter: { canMakeRequest: () => boolean } }).streamRateLimiter = { canMakeRequest: () => false });

describe('RealTimeAttackService does not invent attacks', () => {
  beforeEach(() => { real.attacks.mockReset(); });

  it('rejects when the real path fails, with the real reason', async () => {
    real.attacks.mockRejectedValue(new Error('this build carries no threat snapshot'));
    await expect(new RealTimeAttackService().getData({ limit: 50 })).rejects.toThrow(/no threat snapshot/);
  });

  it('refuses when rate-limited with nothing fetched yet — no stand-in data', async () => {
    const svc = new RealTimeAttackService();
    limited(svc);
    await expect(svc.getData({ limit: 50 })).rejects.toThrow(/requested too often/);
    expect(real.attacks).not.toHaveBeenCalled();
  });

  it('serves what it last fetched when rate-limited after a real fetch', async () => {
    real.attacks.mockResolvedValue([attack('9.9.9.9')]);
    const svc = new RealTimeAttackService();
    const first = await svc.getData({ limit: 50 });
    limited(svc);
    const second = await svc.getData({ limit: 50 });
    expect(second).toEqual(first);
    expect(second.map((a) => a.metadata.realIp)).toEqual(['9.9.9.9']);
  });
});
