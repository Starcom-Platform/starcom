/**
 * Which report the globe is featuring, if any (decision D-F, section 18, item 2).
 *
 * Set by the share handle's `focusReport`, read by the glyph layer (which draws
 * the chosen place larger and the rest dimmed) and by the card (which names it
 * and points at it). One value in one place, so the image and its caption cannot
 * disagree about which report the post is about.
 */
import { useSyncExternalStore } from 'react';

let featuredId: string | null = null;
const listeners = new Set<() => void>();

export function getFeaturedReportId(): string | null {
  return featuredId;
}

export function setFeaturedReportId(id: string | null): void {
  if (id === featuredId) return;
  featuredId = id;
  for (const listener of [...listeners]) listener();
}

export function subscribeFeaturedReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The featured report's id, re-rendering when it changes. */
export function useFeaturedReportId(): string | null {
  return useSyncExternalStore(subscribeFeaturedReport, getFeaturedReportId, getFeaturedReportId);
}
