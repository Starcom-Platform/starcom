/**
 * Replies to this node's Mission Packages, kept current.
 *
 * Watches the coordinates the missions themselves record in `publishedAs` —
 * written from the signed event at publish time — so the set follows what was
 * actually published rather than what the current identity would publish now.
 *
 * Deliberately a read-only observation surface, the same shape as
 * useReceivedPackages: nothing here writes to the workspace, and nothing
 * offers to. A reply is somebody else's statement about our package; turning
 * one into a record of ours is a separate decision with a separate design, not
 * a side effect of having read it.
 */
import { useEffect, useMemo, useState } from 'react';
import { missionService } from './MissionService';
import { MissionPackageReplyIngest, type PackageReply, type ReplyCounters } from './MissionPackageReplyIngest';
import { useAccessVersion } from '../nostr/accessChanges';
import type { MissionUI } from '../../types/intel/MissionUI';

/** A day. Long enough to catch an overnight answer, short enough to stay small. */
const SINCE_WINDOW_SEC = 24 * 60 * 60;
/** Bound on what is held, for the reason useReceivedPackages gives. */
const MAX_HELD = 100;

export interface PackageReplies {
  /** Newest first. */
  replies: PackageReply[];
  /** Coordinate → the mission it belongs to, for naming a reply's subject. */
  missionByCoordinate: Map<string, MissionUI>;
  counters: ReplyCounters;
  /** How many published packages are being watched. */
  watching: number;
  /**
   * Missions that were dispatched before coordinates were recorded, so no
   * reply to them can be found. Stated rather than hidden: a silent zero here
   * would read as "nobody answered".
   */
  unwatchable: number;
}

export function usePackageReplies(missions: readonly MissionUI[]): PackageReplies {
  const [replies, setReplies] = useState<PackageReply[]>([]);
  const [counters, setCounters] = useState<ReplyCounters>({ seen: 0, accepted: 0, refused: 0 });

  const { coordinates, missionByCoordinate, unwatchable } = useMemo(() => {
    const byCoordinate = new Map<string, MissionUI>();
    let missing = 0;
    for (const mission of missions) {
      if (mission.publishedAs) byCoordinate.set(mission.publishedAs, mission);
      else if (mission.status === 'DISPATCHED' || mission.status === 'CLOSED') missing += 1;
    }
    return {
      coordinates: [...byCoordinate.keys()].sort(),
      missionByCoordinate: byCoordinate,
      unwatchable: missing,
    };
  }, [missions]);

  // Joined, so the effect re-runs on a CHANGE of set rather than on every new
  // array identity — missions re-render often and a filter cannot be edited
  // once open, so each re-run would tear down and rebuild every subscription.
  const key = coordinates.join('|');
  // Read again when a key is made or a team relay joined: a relay that requires sign-in refused the read before (plan 0.3).
  const access = useAccessVersion();

  useEffect(() => {
    if (coordinates.length === 0) {
      setReplies([]);
      return;
    }

    const ingest = new MissionPackageReplyIngest();
    const off = ingest.subscribe((reply) => {
      setReplies((prev) => {
        if (prev.some((r) => r.id === reply.id && r.coordinate === reply.coordinate)) return prev;
        return [reply, ...prev]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, MAX_HELD);
      });
      setCounters(ingest.getCounters());
    });

    ingest.start(coordinates, Math.floor(Date.now() / 1000) - SINCE_WINDOW_SEC);

    return () => { off(); ingest.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` IS the set
  }, [key, access]);

  return { replies, missionByCoordinate, counters, watching: coordinates.length, unwatchable };
}
