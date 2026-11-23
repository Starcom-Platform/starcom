// IntelRelationshipUI — the one genuinely new concept the canonical Intel
// substrate needed. Ported from core/intel's Relationship/EdgeRelationship
// (core/intel/types/intelDataModels.ts) — that's the only place a real,
// generic multi-type relationship model already existed; IntelReportUI/
// IntelItemUI previously had no graph concept at all, only a flat
// sourceIntelIds: string[] on reports.

export interface IntelRelationshipTimeframe {
  startDate?: string; // ISO
  endDate?: string; // ISO
  isEstimated?: boolean;
}

export interface IntelRelationshipUI {
  id: string;
  type: string; // relationship label, e.g. "communicates_with", "owns", "located_at"
  sourceId: string; // ID of the source item/report/case
  targetId: string; // ID of the target item/report/case
  // NOTE scale mismatch, inherited from the two source systems and kept
  // deliberate rather than silently "fixed" here: confidence/strength use
  // the 0-100 scale System A's Relationship/EdgeRelationship always used,
  // while IntelItemUI/IntelReportUI's own `confidence` field is 0..1.
  confidence: number; // 0-100
  strength?: number; // 0-100 — graph-edge specific, how strong the connection is
  direction?: 'unidirectional' | 'bidirectional';
  timeframe?: IntelRelationshipTimeframe;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  createdBy: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface CreateIntelRelationshipInput {
  type: string;
  sourceId: string;
  targetId: string;
  confidence?: number; // defaults to 50
  strength?: number;
  direction?: 'unidirectional' | 'bidirectional';
  timeframe?: IntelRelationshipTimeframe;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /**
   * Who made it, when the caller knows: an import or a seeded scenario. Left out, the
   * relationship is the current person's own work and ensures their signing identity.
   */
  createdBy?: string;
}
