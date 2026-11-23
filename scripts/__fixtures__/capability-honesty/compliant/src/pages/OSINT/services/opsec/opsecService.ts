// Fixture: the corrected shape. Must PASS the guard.
export function getConnectionStatus() {
  try {
    throw new Error('backend unreachable');
  } catch {
    return unverifiedConnectionStatus('backend unreachable');
  }
}
function unverifiedConnectionStatus(errorMessage: string) {
  return {
    verified: false,
    isSecure: false,
    routingMethod: 'direct',
    fingerprintProtection: false,
    dnsSecure: false,
    errorMessage,
  };
}
