/**
 * Intel Domain - Core Enumerations
 * 
 * Essential enums extracted from bloated type definitions for clean, 
 * reusable intelligence classification and categorization.
 */

/*
 * An `IntelClassification` ladder stood here — UNCLASSIFIED / CONFIDENTIAL /
 * SECRET / TOP_SECRET / COMPARTMENTED — commented "Security classification
 * levels for intelligence reports".
 *
 * COMPARTMENTED is the tell. A compartment system means named compartments,
 * a registry of who is read into each, and a mechanism to enforce it. This
 * application has never had any of the three. The tier existed so the union
 * would look complete.
 *
 * Six legacy record types carried an optional field of this type and two
 * builders had a setClassification() method. Nothing read any of it to make a
 * decision. All of it is gone; where a record genuinely needs to say where it
 * may travel, the vocabulary is InformationVisibility in Classification.ts.
 */

/**
 * Intelligence report priority levels
 */
export type IntelPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

/**
 * Threat level assessment for intelligence
 */
export type IntelThreatLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'critical';

/**
 * Intelligence category classification
 */
export type IntelCategory = 
  | 'cyber_threat'
  | 'physical_security'
  | 'financial_crime'
  | 'geopolitical'
  | 'infrastructure'
  | 'personnel'
  | 'operational'
  | 'strategic'
  | 'tactical';

/**
 * 3D marker types for visualization
 */
export type IntelMarkerType = 
  | 'standard'      // Default intel marker
  | 'priority'      // High-priority intel
  | 'alert'         // Alert/warning intel
  | 'restricted'    // Marker for intel with restricted distribution
  | 'verified'      // Verified intel marker
  | 'unverified'    // Unverified intel marker
  | 'archived';     // Archived intel marker

/**
 * Relationship types between intelligence reports
 */
export type IntelRelationshipType = 
  | 'related_to'
  | 'follows_from'
  | 'contradicts'
  | 'confirms'
  | 'updates'
  | 'supersedes'
  | 'part_of'
  | 'references';
