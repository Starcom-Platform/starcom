// Open Source Intelligence Quality Indicators
// For civilian use in transparent intelligence analysis

/**
 * Source Quality Rating
 * Indicates reliability and trustworthiness of information sources
 */
export type SourceQuality = 
  | 'verified'      // Independently verified by multiple sources
  | 'reliable'      // Known reliable source with good track record
  | 'unverified'    // Single source, not yet corroborated  
  | 'questionable'  // Source has accuracy issues
  | 'unreliable';   // Known unreliable or biased source

/*
 * `InformationVisibility` and `ContentSensitivity` were DECLARED here and also
 * used as the handling axes on the UI records, in two places, drifting apart.
 * The canonical definition now lives beside the records it marks, in
 * src/types/intel/IntelItemUI.ts, together with the three predicates that read
 * them. This file re-exports so existing importers keep working and there is
 * exactly one definition.
 */
import type { InformationVisibility, ContentSensitivity } from '../../types/intel/IntelItemUI';
export type { InformationVisibility, ContentSensitivity };
export {
  requiresProtection,
  requiresRestrictedDistribution,
  requiresCare,
} from '../../types/intel/IntelItemUI';

/**
 * Quality Assessment
 * Comprehensive quality and handling assessment for intelligence
 */
export interface QualityAssessment {
  sourceQuality: SourceQuality;
  visibility: InformationVisibility;
  sensitivity: ContentSensitivity;
  verificationNotes?: string[];
  sharingGuidelines?: string;
  lastVerified?: number;
}

/*
 * ─── ClassificationLevel IS GONE — THE LAST LADDER IN THE CODEBASE ─────────
 *
 * It was a seven-rung const object plus a matching type, introduced under the
 * comment "Classification deprecated: keep as loose string for legacy
 * callers" — a deprecation announced and then depended upon by two whole
 * domains for years.
 *
 * Its rungs were UNRESTRICTED, UNCLASSIFIED, RESTRICTED, SENSITIVE,
 * CONFIDENTIAL, SECRET, TOP_SECRET. Three of those seven existed nowhere else
 * in the codebase, which is what made it the widest of the FIVE spellings this
 * migration found:
 *
 *   IntelItemClassification      4 rungs   UNCLASSIFIED..TOP_SECRET
 *   ClassificationLevel          7 rungs   + UNRESTRICTED/RESTRICTED/SENSITIVE
 *   IPFSService                  5 rungs   + a compartment marking
 *   IntelDataProvider            4 rungs   spelled 'UNCLASS' at the bottom
 *   SettingsInitializer          spelled the bottom rung 'PUBLIC'
 *
 * Two adapters existed largely to cast between the 4-rung and 7-rung
 * versions, each carrying a comment calling the mismatch "a documented gap".
 * The gap was not a gap; it was two inventions of the same nonexistent thing.
 *
 * `visibility` and `sensitivity` — defined in src/types/intel/IntelItemUI.ts
 * and re-exported below — replace it. Neither is a ladder, so neither can
 * acquire a sixth spelling.
 */

/*
 * ─── ClassificationUtils IS GONE, AND ITS BODY IS THE ARGUMENT WHY ─────────
 *
 * It sat under the comment "Legacy stub to keep callers compiling while
 * classification is removed from the product" — a removal announced and never
 * finished, so the stub outlived the thing it was bridging away from. What the
 * three methods did:
 *
 *   validate(level)                 -> { isValid: true, errors: [] }, always
 *   compareClassificationLevel(a,b) -> 0, for EVERY pair of levels
 *   generateBanner(level)           -> String(level ?? 'UNRESTRICTED')
 *
 * A comparator that reports every level equal is not a weak control. It is the
 * absence of one wearing a control's name, and no caller could tell the
 * difference from the outside. Nothing imported it — verified before deleting.
 *
 * `ClassificationLevel` above it survives one more stage: src/core/intel/ still
 * imports it across 21 files. It goes when they do.
 */

/**
 * Quality Utilities
 */
export class QualityUtils {
  /**
   * Generate quality summary banner
   */
  static generateSummary(assessment: QualityAssessment): string {
    return `${assessment.sourceQuality.toUpperCase()} | ${assessment.visibility.toUpperCase()} | ${assessment.sensitivity.toUpperCase()}`;
  }

  /**
   * Compare source quality levels
   * Returns: -1 if a < b, 0 if equal, 1 if a > b
   */
  static compareSourceQuality(a: SourceQuality, b: SourceQuality): number {
    const levels = ['unreliable', 'questionable', 'unverified', 'reliable', 'verified'];
    const aIndex = levels.indexOf(a);
    const bIndex = levels.indexOf(b);
    return aIndex - bIndex;
  }

  /**
   * Determine if information can be shared openly
   */
  static canShareOpenly(assessment: QualityAssessment): boolean {
    return assessment.visibility === 'public' && assessment.sensitivity === 'open';
  }

  /**
   * Validate quality assessment
   */
  static validate(assessment: QualityAssessment): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check for questionable sources being marked as public
    if (assessment.sourceQuality === 'questionable' && assessment.visibility === 'public') {
      warnings.push('Consider limiting distribution of questionable source material');
    }

    // Check for unverified sensitive information
    if (assessment.sourceQuality === 'unverified' && assessment.sensitivity === 'protected') {
      warnings.push('Protected information should ideally be from verified sources');
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }
}
