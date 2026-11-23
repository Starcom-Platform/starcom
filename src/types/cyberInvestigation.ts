import type { InformationVisibility } from '../models/Intel/Classification';
import type { TeamMemberKeys } from '../services/team/teamMemberKeys';
// Intel Package Types and Interfaces for Cyber Investigation MVP
// Focused on practical team collaboration for cyber ops

export interface IntelPackage {
  id: string;
  name: string;
  description: string;
  /**
   * Where the package may travel.
   *
   * Was `classification`, typed to a four-tier clearance ladder. The reasoning
   * recorded below is preserved verbatim because it is still correct — it was
   * always an argument about ABSENCE, not about tiers, and it transfers intact
   * to `visibility`.
   *
   * The type omitted a field the runtime has always carried. The manager builds
   * a package with `...formData`, and the form has always had a selector for
   * it, so the value was there at runtime while the type said it was not.
   * `@ts-nocheck` on that component hid eleven errors saying exactly this.
   *
   * The cost was to every consumer reading a package THROUGH the type: a
   * validator, a serialiser, or any construction path not spreading the form
   * had no reason to know the field existed. Investigations have declared it
   * all along; packages were the inconsistency.
   *
   * Optional, because packages built by a path that does not set it genuinely
   * have no recorded distribution decision — and "not recorded" is a different
   * statement from "public", the same distinction `integrity: null` makes on
   * the globe layer. A reader must not read an absent value as a positive
   * assurance, and the badge renders it grey rather than green for that reason.
   */
  visibility?: InformationVisibility;
  type: 'CYBER_INCIDENT' | 'THREAT_ANALYSIS' | 'ASSET_INVENTORY' | 'INVESTIGATION';
  createdBy: string; // wallet address
  createdAt: Date;
  updatedAt: Date;
  reportIds: string[]; // Array of Intel Report IDs
  tags: string[];
  status: 'ACTIVE' | 'ANALYZING' | 'COMPLETED' | 'ARCHIVED';
  
  // Cyber-specific metadata
  incidentId?: string;
  affectedSystems: string[];
  threatActors: string[];
  ioCs: IoC[]; // Indicators of Compromise
  timeline: InvestigationEvent[];
  
  // Collaboration
  assignedTeam?: string;
  collaborators: string[];
  sharedWith: string[];
  
  // Storage
  ipfsHash?: string;
  onChainRef?: string;
}

export interface IoC {
  type: 'IP' | 'DOMAIN' | 'HASH' | 'EMAIL' | 'URL' | 'FILE_PATH';
  value: string;
  description: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  tags: string[];
}

export interface InvestigationEvent {
  id: string;
  timestamp: Date;
  type: 'INCIDENT_DETECTED' | 'EVIDENCE_COLLECTED' | 'ANALYSIS_COMPLETED' | 'IOC_IDENTIFIED' | 'CONTAINMENT_ACTION' | 'RECOVERY_ACTION';
  description: string;
  author: string;
  relatedReports: string[];
  evidence: Evidence[];
}

export interface Evidence {
  id: string;
  type: 'LOG_FILE' | 'NETWORK_CAPTURE' | 'SCREENSHOT' | 'MEMORY_DUMP' | 'DISK_IMAGE' | 'DOCUMENT';
  name: string;
  description: string;
  filePath?: string;
  ipfsHash?: string;
  checksum: string;
  collectedBy: string;
  collectedAt: Date;
  chain_of_custody: ChainOfCustodyEntry[];
}

export interface ChainOfCustodyEntry {
  timestamp: Date;
  handler: string;
  action: 'COLLECTED' | 'TRANSFERRED' | 'ANALYZED' | 'STORED' | 'ACCESSED';
  notes: string;
  signature: string;
}

export interface CyberTeam {
  id: string;
  name: string;
  type: 'INCIDENT_RESPONSE' | 'THREAT_HUNTING' | 'FORENSICS' | 'SOC' | 'RED_TEAM' | 'BLUE_TEAM';
  /*
   * An `agency` field naming one of six real US government and military
   * institutions stood here. Nothing compared it, and Starcom is not
   * governmental — see the note in types/features/collaboration.ts.
   */
  description?: string;
  
  // Team members
  lead: string; // wallet address
  members: TeamMember[];
  
  // Capabilities
  specializations: string[];
  
  // Status
  status: 'ACTIVE' | 'STANDBY' | 'DEPLOYED' | 'OFFLINE';
  currentInvestigations: string[];
  
  // Collaboration settings
  autoShareFindings: boolean;
  allowExternalCollaboration: boolean;
  preferredCommunicationChannels: string[];
  /** This team's real, bound chat channel id — set via RealTimeTeamService.setTeamChannelId once TeamWorkspaceApplication's Chat tab first resolves/creates it. Undefined until then. */
  channelId?: string;
  /**
   * The team's relay, where its members sign in and its Limited work lives
   * (plan item 2.3). Absent on teams made before teams had one.
   */
  relayUrl?: string;
  /** The relay's own key (its NIP-11 `self`), which signs its NIP-43 member list. */
  relayPubkey?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  // Primary cross-app identity (Nostr pubkey — see NostrIdentityService.ts). Optional
  // during the migration window: existing wallet-only members predate this field.
  pubkey?: string;
  walletAddress: string;
  name: string;
  role: 'LEAD_ANALYST' | 'CYBER_ANALYST' | 'FORENSICS_SPECIALIST' | 'THREAT_HUNTER' | 'SOC_ANALYST' | 'INCIDENT_COMMANDER';
  // Human by default. An 'ai' member is a pubkey with a role like any other — not a
  // separate membership mechanism.
  actorType: 'human' | 'ai';
  specializations: string[];
  status: 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';
  joinedAt: Date;
  lastActivity: Date;
  /**
   * Post-quantum public keys, generated when the member joins.
   *
   * Optional because members who joined before this existed do not have them,
   * and inventing keys for them would be worse than the gap: a key nobody holds
   * the private half of is not a key, it is a claim about one.
   *
   * Carries public halves and a timestamp only. There is deliberately no
   * `verified` or `clearanceVerified` field beside it — see
   * services/team/teamMemberKeys.ts for what was left behind and why.
   */
  keys?: TeamMemberKeys;
}

export interface CyberInvestigation {
  id: string;
  title: string;
  description: string;
  type: 'INCIDENT_RESPONSE' | 'THREAT_HUNTING' | 'FORENSIC_ANALYSIS' | 'VULNERABILITY_ASSESSMENT';
  
  // Distribution and priority. `classification` was a four-tier clearance
  // ladder here; nothing compared two of its values.
  visibility: InformationVisibility;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Investigation details
  incidentDate: Date;
  detectedDate: Date;
  reportedBy: string;
  assignedTeam: string;
  
  // Status and progress
  status: 'INITIATED' | 'INVESTIGATING' | 'ANALYZING' | 'CONTAINING' | 'RECOVERING' | 'CLOSED';
  progress: number; // 0-100
  
  // Assets and scope
  affectedSystems: string[];
  affectedUsers: string[];
  estimatedImpact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Investigation data
  intelPackages: string[];
  timeline: InvestigationEvent[];
  ioCs: IoC[];
  evidence: Evidence[];
  
  // Collaboration
  collaboratingTeams: string[];
  sharedWith: string[];
  
  // Tracking
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  resolvedDate?: Date;
  
  // Documentation
  executiveSummary?: string;
  technicalSummary?: string;
  lessonsLearned?: string;
  recommendedActions: string[];
}

// API Response types for MVP
export interface CreatePackageRequest {
  name: string;
  description: string;
  type: IntelPackage['type'];
  /** Required on creation: the form always supplies it, defaulting to 'public'. */
  visibility: InformationVisibility;
  tags: string[];
  incidentId?: string;
  affectedSystems: string[];
}

export interface CreateTeamRequest {
  name: string;
  type: CyberTeam['type'];
  specializations: string[];
}

export interface CreateInvestigationRequest {
  title: string;
  description: string;
  type: CyberInvestigation['type'];
  visibility: InformationVisibility;
  priority: CyberInvestigation['priority'];
  affectedSystems: string[];
  incidentDate: Date;
}

// State management for MVP
export interface CyberInvestigationState {
  // Core entities
  packages: IntelPackage[];
  teams: CyberTeam[];
  investigations: CyberInvestigation[];
  
  // Current context
  activeInvestigation?: string;
  activeTeam?: string;
  activePackage?: string;
  
  // UI state
  loading: boolean;
  error?: string;
  
  // Collaboration
  liveCollaborators: string[];
  realtimeUpdates: boolean;
}
