import { normalizeEntityName } from './normalizeEntityName';
import type { EntityMergeSuggestion } from './findMergeSuggestions';

export type AliasDecision = 'confirmed' | 'rejected';

export interface AliasRecord {
  nameA: string;
  nameB: string;
  decision: AliasDecision;
  decidedAt: string; // ISO
}

const STORAGE_KEY = 'intelWorkspace.entityAliasDecisions';

// Order-independent — "John Smith"~"Jon Smith" and "Jon Smith"~"John Smith"
// must resolve to the same record, not create two.
function pairKey(a: string, b: string): string {
  return [normalizeEntityName(a), normalizeEntityName(b)].sort().join('||');
}

/**
 * Entity resolution, option B: persists a human's confirm/reject decision
 * on a fuzzy-match suggestion so it never re-prompts. Deliberately does
 * NOT auto-apply confirmed merges anywhere on its own — same discipline
 * as the rest of this pipeline (suggest, never silently merge). A
 * confirmed pair is exposed via getConfirmedAliases() for whatever UI/
 * service actually wants to treat two names as the same entity from now
 * on; this class only tracks the decision itself.
 */
export class EntityAliasRegistry {
  private decisions: Map<string, AliasRecord>;

  constructor() {
    this.decisions = this.load();
  }

  private load(): Map<string, AliasRecord> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Map();
      return new Map(
        parsed
          .filter((r): r is AliasRecord => !!r && typeof r.nameA === 'string' && typeof r.nameB === 'string')
          .map(r => [pairKey(r.nameA, r.nameB), r])
      );
    } catch {
      return new Map();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.decisions.values())));
    } catch {
      // Best-effort — private browsing / quota exceeded shouldn't break review.
    }
  }

  getDecision(nameA: string, nameB: string): AliasDecision | undefined {
    return this.decisions.get(pairKey(nameA, nameB))?.decision;
  }

  confirm(nameA: string, nameB: string): void {
    this.decisions.set(pairKey(nameA, nameB), { nameA, nameB, decision: 'confirmed', decidedAt: new Date().toISOString() });
    this.save();
  }

  reject(nameA: string, nameB: string): void {
    this.decisions.set(pairKey(nameA, nameB), { nameA, nameB, decision: 'rejected', decidedAt: new Date().toISOString() });
    this.save();
  }

  /** Drops suggestions that already have a decision recorded — confirmed or rejected, either way it shouldn't re-prompt. */
  filterUndecided(suggestions: EntityMergeSuggestion[]): EntityMergeSuggestion[] {
    return suggestions.filter(s => !this.getDecision(s.nameA, s.nameB));
  }

  getConfirmedAliases(): AliasRecord[] {
    return Array.from(this.decisions.values()).filter(r => r.decision === 'confirmed');
  }
}

export const entityAliasRegistry = new EntityAliasRegistry();
