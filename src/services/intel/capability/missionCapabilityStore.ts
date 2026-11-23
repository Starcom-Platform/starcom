/**
 * Where a mission's capability chain lives on this device.
 *
 * Deliberately dumb storage. The chain's authority comes from its signatures,
 * not from where it is kept, so an operator editing this store can only
 * destroy their own grants — never manufacture one. That is the property that
 * makes local-first storage acceptable here and an ACL array unacceptable.
 */
import type { Event as NostrEvent } from 'nostr-tools';

const KEY = 'starcom.mission.capabilities.v1';

type Stored = Record<string, NostrEvent[]>;

function read(): Stored {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    // Unreadable storage is the same as empty: the chain can be re-derived by
    // whoever the mission says created it, so losing it is recoverable.
    return {};
  }
}

function write(all: Stored): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota or private mode. Verification still works for this session.
  }
}

export const missionCapabilityStore = {
  get(missionId: string): NostrEvent[] {
    return read()[missionId] ?? [];
  },
  put(missionId: string, chain: NostrEvent[]): void {
    const all = read();
    all[missionId] = chain;
    write(all);
  },
  /**
   * A delegation the delegator issued, kept under the holder's key.
   *
   * Delegation branches: a creator may empower two colleagues, and those are
   * two chains, not one. Storing them under `missionId` alone would have the
   * second silently overwrite the first, and the delegator would see one
   * delegation where they made two.
   */
  putDelegation(missionId: string, holder: string, chain: NostrEvent[]): void {
    const all = read();
    all[`${missionId}::${holder}`] = chain;
    write(all);
  },

  /** Delegations this device issued for a mission, by holder. */
  delegations(missionId: string): Array<{ holder: string; chain: NostrEvent[] }> {
    const prefix = `${missionId}::`;
    return Object.entries(read())
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, chain]) => ({ holder: k.slice(prefix.length), chain }));
  },

  /** Forget one delegation, after it has been withdrawn on the relays. */
  removeDelegation(missionId: string, holder: string): void {
    const all = read();
    delete all[`${missionId}::${holder}`];
    write(all);
  },

  clear(missionId: string): void {
    const all = read();
    delete all[missionId];
    // Delegations are keyed by mission AND holder; leaving them would strand
    // records for a mission this device no longer tracks.
    for (const key of Object.keys(all)) {
      if (key.startsWith(`${missionId}::`)) delete all[key];
    }
    write(all);
  },
};
