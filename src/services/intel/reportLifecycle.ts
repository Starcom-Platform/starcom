// reportLifecycle.ts - lifecycle helper utilities for IntelReportService
// Pure functions: no storage or side-effects.
// NOTE: If IntelReportUI schema adds fields impacting versioning or diff logic,
//       update TRACKED_FIELDS below and related tests.

import { IntelReportUI, IntelReportHistoryEntry, IntelReportStatus } from '../../types/intel/IntelReportUI';

// Fields considered for change detection (content + analytical + metadata subset)
const TRACKED_FIELDS: (keyof IntelReportUI)[] = [
  'title',
  'summary',
  'content',
  'category',
  'tags',
  'conclusions',
  'recommendations',
  'methodology',
  'confidence',
  'priority',
  'targetAudience',
  'sourceIntelIds',
  'latitude',
  'longitude',
  'startDate',
  'endDate',
  'timePrecisionMs',
  'hashtags',
  'collaborators',
  // Where it may go and how it is kept at rest. Left out, a save that changed only
  // these returned "nothing to do" and stored nothing (plan item 9.6).
  'visibility',
  'sensitivity'
];

export function computeChangedFields(before: IntelReportUI, after: IntelReportUI): string[] {
  const changed: string[] = [];
  for (const f of TRACKED_FIELDS) {
    const a = before[f];
    const b = after[f];
    if (a instanceof Date || b instanceof Date) {
      const at = a instanceof Date ? a.getTime() : a;
      const bt = b instanceof Date ? b.getTime() : b;
      if (at !== bt) changed.push(String(f));
      continue;
    }
    // JSON comparison, not .join() -- collaborators (and any future array-of-object
    // field) would otherwise stringify every element to "[object Object]" and compare
    // equal regardless of content, silently dropping real changes.
    const eq = Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
    if (!eq) changed.push(String(f));
  }
  return changed;
}

export function nextVersion(prev: IntelReportUI, changes: string[], statusChanged: boolean, _toStatus?: IntelReportStatus): number {
  // Simple numeric increment for now (Phase 6 introduces semver logic)
  if (!changes.length && !statusChanged) return prev.version || 1;
  return (prev.version || 1) + 1;
}

interface HistoryParams {
  action: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'IMPORTED';
  changes?: string[];
  fromStatus?: IntelReportStatus;
  toStatus?: IntelReportStatus;
  user?: string;
  timestamp?: string; // allow injection for deterministic tests
}

export function makeHistoryEntry(p: HistoryParams): IntelReportHistoryEntry {
  return {
    timestamp: p.timestamp || new Date().toISOString(),
    action: p.action,
    user: p.user,
    changes: p.changes && p.changes.length ? p.changes : undefined,
    fromStatus: p.fromStatus,
    toStatus: p.toStatus
  };
}
