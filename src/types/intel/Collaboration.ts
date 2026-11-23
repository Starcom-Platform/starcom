// Collaboration.ts — collaboration primitives shared by IntelCaseUI and MissionUI.
// Originally defined once inside IntelCaseUI.ts (ported from core/intel's
// CaseRecord); extracted here so Missions (Cycle 3) can reuse the exact same
// Collaborator/Comment/ActivityLogEntry/permissions shapes instead of a sixth
// incompatible copy. IntelCaseUI.ts re-exports everything from here under its
// original names, so no existing import site needed to change.

/**
 * Someone working on a record: who they are, and who added them. Being listed
 * grants nothing. The role that stood here, VIEWER to OWNER, went with the
 * permission lists below, for the same reason.
 */
export interface Collaborator {
  userId: string;
  name: string;
  addedAt: string;
  addedBy: string;
  lastActive?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  thumbnailUrl?: string;
  createdAt: string;
  uploadedBy: string;
  metadata: Record<string, unknown>;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  parentId?: string; // for threaded comments
  mentions: string[]; // user IDs mentioned
  attachments: Attachment[];
}

// The set of actions a domain can log is domain-specific (a Case logs
// ENTITY_LINKED, a Mission will log things like OBJECTIVE_ADDED or
// DISPATCHED) — parameterized rather than fixed to Case's enum so Mission
// isn't forced to either reuse case-shaped actions or duplicate this type.
export interface ActivityLogEntry<TAction = string> {
  id: string;
  action: TAction;
  timestamp: string;
  userId: string;
  details: Record<string, unknown>;
  entityId?: string;
}

/**
 * Whether a record is everyone's business. That is all that remains here.
 *
 * This held lists of who might comment, edit, delete, share and assign, and
 * each collaborator carried a role from VIEWER to OWNER. Nothing checked any of
 * it, and nothing could: Starcom is local-first, so whoever holds this
 * browser's storage can change any list. Showing them implied an access control
 * that does not exist, so they were removed. The authority that is real is
 * signed and checkable: see missionCapability.ts. Records saved before still
 * carry the old keys, and nothing reads them.
 *
 * isPublic stays because the attention queue reads it (caseVisibility.ts): a
 * public case is everyone's business, which is relevance, not access.
 */
export interface CollaborationPermissions {
  isPublic: boolean;
}
