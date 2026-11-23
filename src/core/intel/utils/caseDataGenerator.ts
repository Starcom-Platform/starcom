/**
 * Case Data Generator for IntelDataCore
 * 
 * Operation Blackout — Investigation case records tracking the
 * multi-phase response to Shadow Collective's attack on Example Energy.
 */

import { v4 as uuidv4 } from 'uuid';
import { recordNumber } from '../../../services/intel/recordNumbers';
import { 
  CaseRecord, 
  CaseStatus,
  CasePriority,
  
} from '../types/intelDataModels';
import { caseManagerAdapter } from '../adapters/caseManagerAdapter';

/**
 * Generate a case record with overrides.
 */
export function generateSampleCase(
  index: number, 
  baseDate = new Date(),
  customOptions: Partial<CaseRecord> = {}
): CaseRecord {
  const dayOffset = Math.floor(Math.random() * 60) - 30;
  const startDate = new Date(baseDate);
  startDate.setDate(baseDate.getDate() + dayOffset);

  const hasDueDate = Math.random() > 0.3;
  let dueDate: Date | undefined;
  if (hasDueDate) {
    dueDate = new Date(startDate);
    dueDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) + 7);
  }

  const isClosed = Math.random() > 0.7;
  let closedDate: Date | undefined;
  let status = CaseStatus.OPEN;
  if (isClosed) {
    status = CaseStatus.CLOSED;
    closedDate = new Date(startDate);
    closedDate.setDate(startDate.getDate() + Math.floor(Math.random() * 20) + 1);
  } else {
    const activeStatuses = [CaseStatus.NEW, CaseStatus.OPEN, CaseStatus.IN_PROGRESS, CaseStatus.PENDING, CaseStatus.RESOLVED];
    status = activeStatuses[Math.floor(Math.random() * activeStatuses.length)];
  }

  let priority: CasePriority;
  const r = Math.random();
  if (r > 0.9) priority = CasePriority.CRITICAL;
  else if (r > 0.7) priority = CasePriority.HIGH;
  else if (r > 0.3) priority = CasePriority.MEDIUM;
  else priority = CasePriority.LOW;

  const id = customOptions.id || uuidv4();
  const caseNumber = recordNumber('CASE', id, startDate);

  /*
   * ─── PRIORITY WAS BEING MAPPED TO SECRECY ─────────────────────────────────
   *
   * This stood here:
   *
   *   CRITICAL -> SECRET
   *   HIGH     -> CONFIDENTIAL
   *   MEDIUM   -> SENSITIVE
   *   else     -> UNCLASSIFIED
   *
   * How urgent a case is and who may read it are different questions. This
   * asserted that they are the same one, and did it in DEMO DATA — so every
   * seeded workspace taught the model that raising a case's priority restricts
   * who can see it.
   *
   * It is the same conflation as IntelligenceWorkflowEngine's
   * assessIntelSignificance (deleted in 7b/2), which ran it in the other
   * direction and scored secrecy as significance. Found in three places now:
   * priority here, importance in timelineDataGenerator, threat level in
   * SecureChatIntegrationService.
   *
   * Generated demo records now carry no handling marking at all. They are
   * OSINT scenario data, and the predicates read absence as the open case,
   * which is the right reading.
   */

  return {
    id,
    type: 'case_record',
    // Demo material, marked where it is made so it can never be published
    // (plan item 0.9). Unmarked, these twenty cases read as real.
    sample: true,
    caseNumber: customOptions.caseNumber || caseNumber,
    title: customOptions.title || `Case ${index}`,
    description: customOptions.description || `Investigation case ${index}.`,
    status: customOptions.status || status,
    priority: customOptions.priority || priority,
    assignedTo: customOptions.assignedTo || ['sarah.okafor@energy.example'],
    startDate: customOptions.startDate || startDate.toISOString(),
    dueDate: customOptions.dueDate || (dueDate ? dueDate.toISOString() : undefined),
    closedDate: customOptions.closedDate || (closedDate ? closedDate.toISOString() : undefined),
    relatedEntities: customOptions.relatedEntities || [],
    relatedCases: customOptions.relatedCases || [],
    createdAt: customOptions.createdAt || new Date().toISOString(),
    updatedAt: customOptions.updatedAt || new Date().toISOString(),
    createdBy: customOptions.createdBy || 'intel-analyst',
    metadata: customOptions.metadata || { source: 'operation-blackout', department: 'Security' },
    tags: customOptions.tags || ['operation-blackout', `priority_${priority.toLowerCase()}`, status.toLowerCase().replace('_', '-')],
    collaborators: customOptions.collaborators || [],
    comments: customOptions.comments || [],
    activityLog: customOptions.activityLog || [],
    permissions: customOptions.permissions || { isPublic: false }
  };
}

// ──────────────────────────────────────────────────────
// Operation Blackout — Themed Case Records
// ──────────────────────────────────────────────────────

interface PresetCase {
  title: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  assignedTo: string[];
  tags: string[];
  department: string;
}

const INVESTIGATION_CASES: PresetCase[] = [
  {
    title: 'OP-BLACKOUT: Initial Phishing Campaign Analysis',
    description: 'Forensic analysis of 14 spear-phishing emails targeting Example Energy IT staff. Recover credential harvester artifacts from energy-vpn-update.example.',
    status: CaseStatus.CLOSED,
    priority: CasePriority.HIGH,
    assignedTo: ['sarah.okafor@energy.example', 'marcus.chen@ir-partner.example'],
    tags: ['phishing', 'forensics', 'operation-blackout'],
    department: 'Incident Response',
  },
  {
    title: 'OP-BLACKOUT: VPN Session Hijack & Initial Access',
    description: 'Investigate stolen VPN session tokens. Trace James Whitfield credential compromise. Determine scope of initial access.',
    status: CaseStatus.CLOSED,
    priority: CasePriority.CRITICAL,
    assignedTo: ['sarah.okafor@energy.example', 'diana.ross@ir-partner.example'],
    tags: ['vpn', 'credential-theft', 'initial-access', 'operation-blackout'],
    department: 'Incident Response',
  },
  {
    title: 'OP-BLACKOUT: BlackoutLoader Malware Analysis',
    description: 'Reverse engineering of BlackoutLoader dropper. Extract IoCs, document DLL sideloading technique, create detection signatures.',
    status: CaseStatus.CLOSED,
    priority: CasePriority.HIGH,
    assignedTo: ['alex.tanaka@ir-partner.example'],
    tags: ['malware-analysis', 'reverse-engineering', 'operation-blackout'],
    department: 'Threat Intelligence',
  },
  {
    title: 'OP-BLACKOUT: GridPhantom RAT Capability Assessment',
    description: 'Full capability analysis of GridPhantom RAT including SCADA-aware modules. Document Modbus/DNP3 manipulation capabilities.',
    status: CaseStatus.IN_PROGRESS,
    priority: CasePriority.CRITICAL,
    assignedTo: ['alex.tanaka@ir-partner.example', 'priya.sharma@cert.example'],
    tags: ['malware-analysis', 'scada', 'ics-security', 'operation-blackout'],
    department: 'Threat Intelligence',
  },
  {
    title: 'OP-BLACKOUT: C2 Infrastructure Mapping',
    description: 'Map complete Shadow Collective C2 infrastructure: shadowgate.cc domain rotation, proxy chains, bulletproof hosting in Bucharest.',
    status: CaseStatus.RESOLVED,
    priority: CasePriority.HIGH,
    assignedTo: ['jordan.blake@agency.example', 'sarah.okafor@energy.example'],
    tags: ['c2', 'infrastructure', 'attribution', 'operation-blackout'],
    department: 'Cyber Intelligence',
  },
  {
    title: 'OP-BLACKOUT: Lateral Movement Reconstruction',
    description: 'Full timeline of attacker lateral movement from VPN gateway through Exchange to OT network. Identify all compromised accounts.',
    status: CaseStatus.CLOSED,
    priority: CasePriority.HIGH,
    assignedTo: ['marcus.chen@ir-partner.example', 'diana.ross@ir-partner.example'],
    tags: ['lateral-movement', 'forensics', 'operation-blackout'],
    department: 'Incident Response',
  },
  {
    title: 'OP-BLACKOUT: OT/SCADA Impact Assessment',
    description: 'Determine full extent of SCADA compromise at Eagle Pass plant. Verify no physical process manipulation occurred. Assess safety implications.',
    status: CaseStatus.IN_PROGRESS,
    priority: CasePriority.CRITICAL,
    assignedTo: ['sarah.okafor@energy.example', 'priya.sharma@cert.example', 'thomas.wright@energy.example'],
    tags: ['scada', 'ot-security', 'safety', 'critical-infrastructure', 'operation-blackout'],
    department: 'ICS Security',
  },
  {
    title: 'OP-BLACKOUT: Data Exfiltration Quantification',
    description: 'Determine exact scope of exfiltrated data (est. 2.3 TB). Catalog stolen files: SCADA configs, engineering schematics, operational data.',
    status: CaseStatus.IN_PROGRESS,
    priority: CasePriority.CRITICAL,
    assignedTo: ['diana.ross@ir-partner.example', 'jordan.blake@agency.example'],
    tags: ['exfiltration', 'data-loss', 'damage-assessment', 'operation-blackout'],
    department: 'Incident Response',
  },
  {
    title: 'OP-BLACKOUT: Shadow Collective Attribution',
    description: 'Compile attribution evidence: malware code overlap, infrastructure reuse, TTP alignment with known APT-SC7 campaigns.',
    status: CaseStatus.RESOLVED,
    priority: CasePriority.HIGH,
    assignedTo: ['jordan.blake@agency.example', 'alex.tanaka@ir-partner.example'],
    tags: ['attribution', 'threat-intel', 'operation-blackout'],
    department: 'Cyber Intelligence',
  },
  {
    title: 'OP-BLACKOUT: "DarkSpectre" Operator Profiling',
    description: 'Develop profile for Viktor Petrov / "DarkSpectre". Correlate operational patterns across multiple campaigns.',
    status: CaseStatus.OPEN,
    priority: CasePriority.MEDIUM,
    assignedTo: ['jordan.blake@agency.example'],
    tags: ['profiling', 'attribution', 'humint', 'operation-blackout'],
    department: 'Cyber Intelligence',
  },
  {
    title: 'OP-BLACKOUT: Watering Hole Investigation',
    description: 'Investigate energy-sector-news.net compromise. Determine victim scope beyond Example Energy. Coordinate with other energy utilities.',
    status: CaseStatus.PENDING,
    priority: CasePriority.MEDIUM,
    assignedTo: ['priya.sharma@cert.example', 'marcus.chen@ir-partner.example'],
    tags: ['watering-hole', 'supply-chain', 'sector-coordination', 'operation-blackout'],
    department: 'Threat Intelligence',
  },
  {
    title: 'OP-BLACKOUT: Dark Web "GridKill" Toolkit Auction',
    description: 'Monitor and collect intelligence on dark web auction of SCADA exploit toolkit linked to Shadow Collective tooling.',
    status: CaseStatus.OPEN,
    priority: CasePriority.MEDIUM,
    assignedTo: ['jordan.blake@agency.example'],
    tags: ['dark-web', 'osint', 'exploit-market', 'operation-blackout'],
    department: 'Cyber Intelligence',
  },
  {
    title: 'OP-BLACKOUT: Network Segmentation Remediation',
    description: 'Design and implement new IT/OT network segmentation architecture for Example Energy. Eliminate VPN bridge vulnerability.',
    status: CaseStatus.IN_PROGRESS,
    priority: CasePriority.HIGH,
    assignedTo: ['thomas.wright@energy.example', 'sarah.okafor@energy.example'],
    tags: ['remediation', 'network-security', 'architecture', 'operation-blackout'],
    department: 'Security Engineering',
  },
  {
    title: 'OP-BLACKOUT: Employee Security Awareness Response',
    description: 'Develop and deploy targeted security awareness training for Example Energy staff. Focus on phishing recognition and credential hygiene.',
    status: CaseStatus.NEW,
    priority: CasePriority.LOW,
    assignedTo: ['sarah.okafor@energy.example'],
    tags: ['training', 'awareness', 'remediation', 'operation-blackout'],
    department: 'Security Operations',
  },
  {
    title: 'OP-BLACKOUT: Sector-Wide Threat Advisory',
    description: 'Prepare sanitized threat advisory for energy sector partners. Share IoCs, TTPs, and detection guidance through ISAC channels.',
    status: CaseStatus.PENDING,
    priority: CasePriority.MEDIUM,
    assignedTo: ['priya.sharma@cert.example', 'sarah.okafor@energy.example'],
    tags: ['advisory', 'information-sharing', 'isac', 'operation-blackout'],
    department: 'Threat Intelligence',
  },
];

/**
 * Generate investigation case records.
 */
export async function generateSampleCaseData(count = 15): Promise<string[]> {
  const caseIds: string[] = [];
  const now = new Date();
  const casesToGenerate = Math.min(count, INVESTIGATION_CASES.length);

  for (let i = 0; i < casesToGenerate; i++) {
    const preset = INVESTIGATION_CASES[i];
    const caseDate = new Date(now);
    caseDate.setDate(now.getDate() - 45 + (i * 3)); // Stagger start dates

    const caseRecord = generateSampleCase(i + 1, caseDate, {
      title: preset.title,
      description: preset.description,
      status: preset.status,
      priority: preset.priority,
      assignedTo: preset.assignedTo,
      tags: preset.tags,
      startDate: caseDate.toISOString(),
      metadata: { source: 'operation-blackout', department: preset.department },
      relatedCases: [...caseIds], // Link to all previous cases in the operation
    });

    const caseId = await caseManagerAdapter.addCase(caseRecord);
    if (caseId) caseIds.push(caseId);
  }

  return caseIds;
}

/**
 * Generate a related case series for a multi-phase investigation.
 */
export async function generateRelatedCaseSeries(
  count = 5,
  baseTitle = "OP-BLACKOUT: Investigation Phase",
  startDate = new Date(Date.now() - 50 * 86400000)
): Promise<string[]> {
  const caseIds: string[] = [];
  
  const phases = [
    { suffix: 'Detection & Triage', desc: 'Initial detection of anomalous activity and incident triage. CIRT activation and scope assessment.', priority: CasePriority.CRITICAL },
    { suffix: 'Containment', desc: 'Isolate compromised systems, sever IT/OT bridge, sinkhole C2 domain. Prevent further data exfiltration.', priority: CasePriority.CRITICAL },
    { suffix: 'Forensic Analysis', desc: 'Deep forensic analysis of compromised systems. Malware reverse engineering. Full attack chain reconstruction.', priority: CasePriority.HIGH },
    { suffix: 'Attribution & Intelligence', desc: 'Attribute attack to Shadow Collective. Map infrastructure. Develop threat actor profiles and share intel.', priority: CasePriority.HIGH },
    { suffix: 'Remediation & Hardening', desc: 'System reimaging, network redesign, enhanced monitoring deployment. Lessons learned and policy updates.', priority: CasePriority.MEDIUM },
  ];

  const phaseCount = Math.min(count, phases.length);

  for (let i = 0; i < phaseCount; i++) {
    const phaseDate = new Date(startDate);
    phaseDate.setDate(startDate.getDate() + i * 10);
    
    let status = CaseStatus.CLOSED;
    if (i === phaseCount - 1) status = CaseStatus.IN_PROGRESS;
    else if (i === phaseCount - 2) status = CaseStatus.PENDING;

    const caseRecord = generateSampleCase(i + 1, phaseDate, {
      title: `${baseTitle} ${i + 1}: ${phases[i].suffix}`,
      description: phases[i].desc,
      status,
      priority: phases[i].priority,
      startDate: phaseDate.toISOString(),
      relatedCases: [...caseIds],
      tags: ['investigation-phase', `phase-${i + 1}`, 'operation-blackout'],
      assignedTo: ['sarah.okafor@energy.example', 'jordan.blake@agency.example'],
      metadata: { source: 'operation-blackout', department: 'CIRT' },
    });
    
    const caseId = await caseManagerAdapter.addCase(caseRecord);
    if (caseId) {
      caseIds.push(caseId);
      
      if (i > 0) {
        for (let j = 0; j < i; j++) {
          await caseManagerAdapter.linkCases(caseIds[j], [caseId]);
        }
      }
    }
  }
  
  return caseIds;
}

export default {
  generateSampleCase,
  generateSampleCaseData,
  generateRelatedCaseSeries
};
