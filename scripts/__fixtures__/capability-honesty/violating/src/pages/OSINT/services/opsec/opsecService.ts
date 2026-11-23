// Fixture: the shape of the bug this guard exists to catch. Must FAIL the guard.
export function getConnectionStatus() {
  try {
    throw new Error('backend unreachable');
  } catch {
    return getMockConnectionStatus();
  }
}
function getMockConnectionStatus() {
  return {
    isSecure: true,
    routingMethod: 'vpn',
    nodeLocation: 'London, UK',
    fingerprintProtection: true,
    dnsSecure: true,
  };
}
