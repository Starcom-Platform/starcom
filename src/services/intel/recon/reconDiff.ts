/**
 * What changed since the last time we looked.
 *
 * ─── WHY THIS IS THE BEST THING THE ARCHITECTURE ALREADY OFFERS ────────────
 *
 * A single recon lookup describes a state. Two describe a MOVEMENT, and
 * movement is what an investigation is usually after: a name appearing in a
 * certificate log is somebody standing up new infrastructure, and a change of
 * nameservers is a change in who controls a domain. Neither is visible in any
 * one lookup, however good.
 *
 * ─── AND WHY "REMOVED" MEANS TWO DIFFERENT THINGS ──────────────────────────
 *
 * The asymmetry matters more than the diff itself.
 *
 * DNS is a live answer: a record that was there and is not has actually gone,
 * and that is a finding.
 *
 * Certificate Transparency is an APPEND-ONLY log. Nothing is ever removed from
 * it. So a name that appeared last time and not this time has not been
 * decommissioned — the query returned differently, because crt.sh paginates,
 * rate-limits and occasionally times out. Reporting that as "removed" would
 * manufacture an event out of a flaky read, and an analyst would chase it.
 *
 * So certificate names only ever gain. Their disappearance is recorded as
 * something the read did, not something the world did.
 */

export interface ReconSnapshot {
  target: string;
  observedAt: string;
  /** Names seen in certificate transparency logs. Append-only at the source. */
  certificateNames: string[];
  mx: string[];
  nameservers: string[];
  addresses: string[];
  registrationExpires?: string;
}

export interface ReconChange {
  previousObservedAt: string;
  /** New in the certificate log: somebody certified a name they had not before. */
  certificateNamesAdded: string[];
  /**
   * Present before and absent now — from an APPEND-ONLY source, so this is a
   * property of the read rather than of the estate. Surfaced separately and
   * never as a removal.
   */
  certificateNamesNotReturned: string[];
  mxAdded: string[];
  mxRemoved: string[];
  nameserversAdded: string[];
  nameserversRemoved: string[];
  addressesAdded: string[];
  addressesRemoved: string[];
  registrationExpiryChanged?: { from?: string; to?: string };
}

const added = (before: string[], after: string[]): string[] => {
  const seen = new Set(before.map((v) => v.toLowerCase()));
  return after.filter((v) => !seen.has(v.toLowerCase()));
};

/**
 * Compare two observations of the same target.
 *
 * Returns null when nothing moved, so a caller can say nothing rather than
 * render an empty panel — "no change" is worth knowing once and not worth a
 * box on every screen.
 */
export function diffSnapshots(before: ReconSnapshot, after: ReconSnapshot): ReconChange | null {
  const change: ReconChange = {
    previousObservedAt: before.observedAt,
    certificateNamesAdded: added(before.certificateNames, after.certificateNames),
    certificateNamesNotReturned: added(after.certificateNames, before.certificateNames),
    mxAdded: added(before.mx, after.mx),
    mxRemoved: added(after.mx, before.mx),
    nameserversAdded: added(before.nameservers, after.nameservers),
    nameserversRemoved: added(after.nameservers, before.nameservers),
    addressesAdded: added(before.addresses, after.addresses),
    addressesRemoved: added(after.addresses, before.addresses),
    registrationExpiryChanged:
      before.registrationExpires !== after.registrationExpires
        ? { from: before.registrationExpires, to: after.registrationExpires }
        : undefined,
  };

  const moved =
    change.certificateNamesAdded.length > 0
    || change.mxAdded.length > 0 || change.mxRemoved.length > 0
    || change.nameserversAdded.length > 0 || change.nameserversRemoved.length > 0
    || change.addressesAdded.length > 0 || change.addressesRemoved.length > 0
    || change.registrationExpiryChanged !== undefined;

  // Deliberately does NOT count certificateNamesNotReturned as movement: a
  // flaky read from an append-only log is not an event, and treating it as one
  // would put a finding in front of an analyst on almost every re-run.
  return moved ? change : null;
}

/**
 * The changes worth interrupting somebody for, in the order they matter.
 *
 * A nameserver change is a change of control. A new certificate name is new
 * infrastructure. An address change is often just a CDN and is listed last.
 */
export function describeChange(change: ReconChange): string[] {
  const lines: string[] = [];
  if (change.nameserversAdded.length || change.nameserversRemoved.length) {
    lines.push(`Nameservers changed — delegation moved, which is a change of control`);
  }
  if (change.certificateNamesAdded.length) {
    lines.push(`${change.certificateNamesAdded.length} new name(s) certified since last look`);
  }
  if (change.mxAdded.length || change.mxRemoved.length) {
    lines.push('Mail routing changed');
  }
  if (change.registrationExpiryChanged) {
    lines.push('Registration expiry moved — the domain was renewed or shortened');
  }
  if (change.addressesAdded.length || change.addressesRemoved.length) {
    lines.push('Addresses changed — often a CDN, occasionally a migration');
  }
  return lines;
}
