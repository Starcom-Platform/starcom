/**
 * Timeline Data Generator for IntelDataCore
 * 
 * Operation Blackout — Coherent attack timeline from initial reconnaissance
 * through breach, exfiltration, detection, and containment.
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  TimelineEvent, 
  EventType,
  
} from '../types/intelDataModels';
import { timelineAdapter } from '../adapters/timelineAdapter';

/**
 * Generate a single timeline event with provided overrides.
 */
export function generateSampleTimelineEvent(
  index: number, 
  baseDate = new Date(),
  customOptions: Partial<TimelineEvent> = {}
): TimelineEvent {
  const dayOffset = Math.floor(Math.random() * 60) - 30;
  const startDate = new Date(baseDate);
  startDate.setDate(baseDate.getDate() + dayOffset);
  // The start the event records: the one it is given, else the random one.
  const recordedStart = customOptions.startDate ? new Date(customOptions.startDate) : startDate;

  // An end 1 to 72 hours after that start. It was worked out from the random start
  // even when a start was given, up to 30 days away, so a sample event meant to last
  // hours was drawn as a bar of weeks, or had an end before it began.
  const hasEndDate = Math.random() > 0.7;
  let endDate: Date | undefined;
  if (hasEndDate) {
    endDate = new Date(recordedStart.getTime() + (Math.floor(Math.random() * 72) + 1) * 60 * 60 * 1000);
  }

  const eventTypes = Object.values(EventType);
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  let baseImportance = 30;
  if ([EventType.ATTACK, EventType.INCIDENT, EventType.EXFILTRATION].includes(eventType as EventType)) baseImportance = 70;
  else if ([EventType.RECONNAISSANCE, EventType.ACCESS].includes(eventType as EventType)) baseImportance = 50;
  const importance = Math.min(100, Math.max(1, baseImportance + Math.floor(Math.random() * 30) - 15));

  return {
    id: customOptions.id || uuidv4(),
    type: 'timeline_event',
    title: customOptions.title || `${eventType} Event ${index}`,
    description: customOptions.description || `Sample ${eventType.toLowerCase()} event.`,
    eventType: (customOptions.eventType || eventType) as EventType,
    startDate: customOptions.startDate || startDate.toISOString(),
    endDate: customOptions.endDate || (endDate ? endDate.toISOString() : undefined),
    isEstimated: customOptions.isEstimated ?? Math.random() > 0.8,
    location: customOptions.location || undefined,
    relatedEntities: customOptions.relatedEntities || [],
    importance: customOptions.importance ?? importance,
    createdAt: customOptions.createdAt || new Date().toISOString(),
    updatedAt: customOptions.updatedAt || new Date().toISOString(),
    createdBy: customOptions.createdBy || 'intel-analyst',
    source: customOptions.source || 'Operation Blackout',
    verified: customOptions.verified ?? false,
    confidence: customOptions.confidence ?? Math.floor(Math.random() * 100),
    attachments: customOptions.attachments || [],
    /*
     * `importance` was mapped straight onto a clearance tier here — >80 SECRET,
     * >60 CONFIDENTIAL, >40 SENSITIVE. How significant an event is says nothing
     * about who may read about it, and in an open-source intelligence network
     * the most significant event is routinely the most public. Same conflation
     * as caseDataGenerator's priority mapping; see the note there.
     */
    metadata: customOptions.metadata || { source: 'operation-blackout' },
    tags: customOptions.tags || [eventType.toLowerCase(), 'operation-blackout']
  };
}

/**
 * Generate contextual background events (not random noise — themed to energy-sector investigation)
 */
export async function generateSampleTimelineData(count = 20): Promise<string[]> {
  const eventIds: string[] = [];
  const now = new Date();

  // Pre-defined contextual events that flesh out the investigation
  const contextualEvents: Partial<TimelineEvent>[] = [
    {
      title: 'CERT Advisory ICS-ALERT-2024-031 Published',
      description: 'A national CERT publishes advisory warning energy sector of APT activity targeting SCADA systems. Shadow Collective indicators included.',
      eventType: EventType.DETECTION,
      importance: 55,
      verified: true,
      confidence: 100,
      location: { description: 'Washington, DC', latitude: 38.9072, longitude: -77.0369 },
      tags: ['advisory', 'early-warning', 'operation-blackout'],
    },
    {
      title: 'Anomalous DNS Queries from Example Energy Network',
      description: 'SOC observes unusual DNS resolution pattern — corporate hosts querying shadowgate.cc. Flagged but not escalated.',
      eventType: EventType.DETECTION,
      importance: 40,
      verified: true,
      confidence: 85,
      location: { description: 'Example Energy SOC, Houston, TX', latitude: 29.7604, longitude: -95.3698 },
      tags: ['dns', 'missed-detection', 'operation-blackout'],
    },
    {
      title: 'Shadow Collective Forum Activity Spike',
      description: 'Dark web OSINT collection identifies increased chatter in SC-affiliated forums about "energy grid research."',
      eventType: EventType.RECONNAISSANCE,
      importance: 45,
      verified: false,
      confidence: 55,
      tags: ['dark-web', 'osint', 'operation-blackout'],
    },
    {
      title: 'Watering Hole Compromise — energy-sector-news.net',
      description: 'Legitimate energy industry news site compromised with browser exploit kit. Targets visitors from .energy and .gov TLDs.',
      eventType: EventType.ATTACK,
      importance: 65,
      verified: true,
      confidence: 78,
      tags: ['watering-hole', 'supply-chain', 'operation-blackout'],
    },
    {
      title: 'Phishing Infrastructure Registered',
      description: 'Domain energy-vpn-update.example registered via an example registrar with cryptocurrency payment. Hosting credential harvester mimicking Example Energy VPN portal.',
      eventType: EventType.RECONNAISSANCE,
      importance: 60,
      verified: true,
      confidence: 96,
      tags: ['phishing', 'infrastructure', 'operation-blackout'],
    },
    {
      title: 'Spear-Phishing Emails Sent to Example Energy Staff',
      description: '14 targeted emails sent to Example Energy IT staff referencing "mandatory VPN client update." 3 recipients clicked.',
      eventType: EventType.ATTACK,
      importance: 75,
      verified: true,
      confidence: 95,
      location: { description: 'Example Energy, Houston, TX', latitude: 29.7604, longitude: -95.3698 },
      tags: ['phishing', 'social-engineering', 'initial-access', 'operation-blackout'],
    },
    {
      title: 'James Whitfield Credential Compromise',
      description: 'Senior sysadmin James Whitfield enters VPN credentials on phishing site. Session token captured and replayed.',
      eventType: EventType.ACCESS,
      importance: 85,
      verified: true,
      confidence: 95,
      location: { description: 'Example Energy, Houston, TX', latitude: 29.7604, longitude: -95.3698 },
      tags: ['credential-theft', 'initial-access', 'operation-blackout'],
    },
    {
      title: 'BlackoutLoader Deployed via VPN',
      description: 'Attacker uses stolen VPN session to deploy BlackoutLoader on Whitfield workstation. DLL sideloading via legitimate updater binary.',
      eventType: EventType.ATTACK,
      importance: 80,
      verified: true,
      confidence: 88,
      tags: ['malware', 'persistence', 'operation-blackout'],
    },
    {
      title: 'GridPhantom RAT Installation',
      description: 'BlackoutLoader downloads and installs GridPhantom RAT. C2 beacon established to shadowgate.cc via encrypted HTTPS tunnel.',
      eventType: EventType.ATTACK,
      importance: 82,
      verified: true,
      confidence: 90,
      tags: ['rat', 'c2-established', 'operation-blackout'],
    },
    {
      title: 'Lateral Movement to Exchange Server',
      description: 'GridPhantom uses Whitfield admin credentials to access MER-EX-01. Downloads Global Address List for further targeting.',
      eventType: EventType.ACCESS,
      importance: 78,
      verified: true,
      confidence: 82,
      location: { description: 'Example Energy Corporate Network', latitude: 29.7604, longitude: -95.3698 },
      tags: ['lateral-movement', 'credential-harvest', 'operation-blackout'],
    },
    {
      title: 'OT Network Pivot via VPN Bridge',
      description: 'Attacker discovers IT/OT VPN bridge. Uses secondary credentials harvested from Exchange to access OT historian (EP-HIST-01).',
      eventType: EventType.ACCESS,
      importance: 90,
      verified: true,
      confidence: 85,
      location: { description: 'Eagle Pass Generating Station', latitude: 28.7091, longitude: -100.4995 },
      tags: ['ot-pivot', 'critical', 'operation-blackout'],
    },
    {
      title: 'SCADA Topology Mapped via Historian',
      description: 'Attacker queries OT historian database to map SCADA control topology. Identifies EP-SCADA-01 as turbine control HMI.',
      eventType: EventType.RECONNAISSANCE,
      importance: 88,
      verified: true,
      confidence: 80,
      tags: ['scada', 'reconnaissance', 'operation-blackout'],
    },
    {
      title: 'GridPhantom RAT Deployed to SCADA Server',
      description: 'SCADA-aware GridPhantom module installed on EP-SCADA-01. Begins Modbus protocol reconnaissance.',
      eventType: EventType.ATTACK,
      importance: 95,
      verified: true,
      confidence: 88,
      location: { description: 'Eagle Pass SCADA Network', latitude: 28.7091, longitude: -100.4995 },
      tags: ['scada', 'ics-compromise', 'critical', 'operation-blackout'],
    },
    {
      title: 'Data Exfiltration Begins',
      description: 'Bulk transfer of SCADA configuration, operational data, and engineering schematics to exfil server 93.184.216.34. 2.3 TB over 72 hours.',
      eventType: EventType.EXFILTRATION,
      importance: 95,
      verified: true,
      confidence: 92,
      tags: ['exfiltration', 'data-theft', 'critical', 'operation-blackout'],
    },
    {
      title: 'SOC Alert — Unusual Outbound Traffic Volume',
      description: 'Dr. Sarah Okafor escalates SOC alert about sustained 50Mbps outbound flow from OT network segment. Investigation initiated.',
      eventType: EventType.DETECTION,
      importance: 88,
      verified: true,
      confidence: 98,
      location: { description: 'Example Energy SOC, Houston, TX', latitude: 29.7604, longitude: -95.3698 },
      tags: ['detection', 'soc-alert', 'operation-blackout'],
    },
    {
      title: 'Incident Response Team Activated',
      description: 'Example Energy CIRT activated under Dr. Okafor. External IR firm the incident-response partner engaged. Forensic imaging begins.',
      eventType: EventType.MITIGATION,
      importance: 85,
      verified: true,
      confidence: 100,
      tags: ['incident-response', 'containment', 'operation-blackout'],
    },
    {
      title: 'C2 Domain Sinkholed',
      description: 'Law enforcement coordination results in shadowgate.cc being sinkholed. C2 communication severed.',
      eventType: EventType.MITIGATION,
      importance: 80,
      verified: true,
      confidence: 95,
      tags: ['mitigation', 'sinkhole', 'operation-blackout'],
    },
    {
      title: 'OT Network Isolated',
      description: 'IT/OT VPN bridge severed. Eagle Pass SCADA network placed in manual-only mode pending full forensic review.',
      eventType: EventType.MITIGATION,
      importance: 82,
      verified: true,
      confidence: 100,
      location: { description: 'Eagle Pass Generating Station', latitude: 28.7091, longitude: -100.4995 },
      tags: ['containment', 'network-isolation', 'operation-blackout'],
    },
    {
      title: 'Attribution Report — Shadow Collective Confirmed',
      description: 'Forensic analysis of malware samples, C2 infrastructure, and TTPs confirms Shadow Collective (APT-SC7) attribution with high confidence.',
      eventType: EventType.DETECTION,
      importance: 75,
      verified: true,
      confidence: 82,
      tags: ['attribution', 'threat-intel', 'operation-blackout'],
    },
    {
      title: 'Remediation Complete — Systems Restored',
      description: 'All compromised systems reimaged. New network segmentation deployed. Enhanced monitoring activated. Example Energy returns to normal operations.',
      eventType: EventType.MITIGATION,
      importance: 70,
      verified: true,
      confidence: 100,
      tags: ['remediation', 'recovery', 'operation-blackout'],
    },
  ];

  // Space events across the 60-day window
  const totalDays = 60;
  const eventsToGenerate = Math.min(count, contextualEvents.length);
  const dayInterval = totalDays / eventsToGenerate;

  for (let i = 0; i < eventsToGenerate; i++) {
    const eventDate = new Date(now);
    eventDate.setDate(now.getDate() - totalDays + (i * dayInterval));
    // Small random offset within the interval
    eventDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

    const event = generateSampleTimelineEvent(i + 1, eventDate, {
      ...contextualEvents[i],
      startDate: eventDate.toISOString(),
      relatedEntities: [...eventIds], // each event relates to all predecessors
    });

    const eventId = await timelineAdapter.addEvent(event);
    if (eventId) eventIds.push(eventId);
  }

  return eventIds;
}

/**
 * Generate the Operation Blackout attack scenario (coherent attack chain).
 * This is the flagship timeline — called separately from background events.
 */
export async function generateAttackScenario(
  targetName = "Example Energy Corp", 
  attackerName = "Shadow Collective",
  startDate = new Date(Date.now() - 45 * 86400000), // 45 days ago
  durationDays = 30
): Promise<string[]> {
  const eventIds: string[] = [];
  
  const scenarioEvents: Partial<TimelineEvent>[] = [
    {
      title: `${attackerName} Begins Reconnaissance of ${targetName}`,
      description: `OSINT collection, network perimeter scanning, and social media reconnaissance of key ${targetName} personnel.`,
      eventType: EventType.RECONNAISSANCE,
      importance: 45,
      isEstimated: true,
      location: { description: 'Remote — Multiple VPN Exit Nodes', latitude: 44.4268, longitude: 26.1025 },
      tags: ['phase-1', 'recon', 'operation-blackout'],
    },
    {
      title: `Spear-Phishing Campaign Targets ${targetName} IT Staff`,
      description: `Targeted email campaign using typosquatting domain (energy-vpn-update.example). 14 emails sent, 3 clicked.`,
      eventType: EventType.ATTACK,
      importance: 75,
      isEstimated: false,
      location: { description: `${targetName} Corporate, Houston, TX`, latitude: 29.7604, longitude: -95.3698 },
      tags: ['phase-2', 'initial-access', 'operation-blackout'],
    },
    {
      title: `Initial Compromise — ${targetName} Admin Account`,
      description: `Sysadmin James Whitfield credentials compromised. BlackoutLoader deployed via VPN session hijack.`,
      eventType: EventType.ACCESS,
      importance: 85,
      isEstimated: false,
      tags: ['phase-3', 'foothold', 'operation-blackout'],
    },
    {
      title: 'Lateral Movement Through Corporate Network',
      description: `GridPhantom RAT spreads to Exchange server, harvests credentials, discovers IT/OT VPN bridge.`,
      eventType: EventType.ACCESS,
      importance: 85,
      isEstimated: false,
      tags: ['phase-4', 'lateral-movement', 'operation-blackout'],
    },
    {
      title: 'OT Network Penetration',
      description: `Attacker pivots into Operational Technology network via VPN bridge. OT Historian compromised.`,
      eventType: EventType.ACCESS,
      importance: 92,
      isEstimated: false,
      location: { description: 'Eagle Pass Generating Station', latitude: 28.7091, longitude: -100.4995 },
      tags: ['phase-5', 'ot-pivot', 'critical', 'operation-blackout'],
    },
    {
      title: 'SCADA System Compromise',
      description: `GridPhantom SCADA module installed on EP-SCADA-01. Modbus protocol manipulation capability achieved.`,
      eventType: EventType.ATTACK,
      importance: 98,
      isEstimated: false,
      location: { description: 'Eagle Pass SCADA Network', latitude: 28.7091, longitude: -100.4995 },
      tags: ['phase-6', 'scada', 'ics-compromise', 'critical', 'operation-blackout'],
    },
    {
      title: 'Mass Data Exfiltration — 2.3 TB',
      description: 'SCADA configs, engineering schematics, operational data exfiltrated to staging server in Frankfurt over 72 hours.',
      eventType: EventType.EXFILTRATION,
      importance: 95,
      isEstimated: false,
      tags: ['phase-7', 'data-theft', 'critical', 'operation-blackout'],
    },
    {
      title: 'Breach Detected by Dr. Okafor',
      description: `${targetName} CISO Dr. Sarah Okafor identifies anomalous outbound traffic during routine review. CIRT activated.`,
      eventType: EventType.DETECTION,
      importance: 88,
      isEstimated: false,
      location: { description: 'Example Energy SOC, Houston, TX', latitude: 29.7604, longitude: -95.3698 },
      tags: ['phase-8', 'detection', 'operation-blackout'],
    },
    {
      title: 'Incident Containment — Network Segmentation',
      description: `IT/OT bridge severed. Compromised systems isolated. C2 domain sinkholed via law enforcement coordination.`,
      eventType: EventType.MITIGATION,
      importance: 82,
      isEstimated: false,
      tags: ['phase-9', 'containment', 'operation-blackout'],
    },
    {
      title: 'Attribution Confirmed — Shadow Collective (APT-SC7)',
      description: `Forensic analysis confirms ${attackerName} based on malware signatures, infrastructure overlap, and TTP analysis.`,
      eventType: EventType.DETECTION,
      importance: 75,
      isEstimated: false,
      tags: ['phase-10', 'attribution', 'operation-blackout'],
    },
    {
      title: 'Full Remediation and Recovery',
      description: `All systems reimaged, new segmentation deployed, enhanced monitoring activated. ${targetName} returns to normal operations.`,
      eventType: EventType.MITIGATION,
      importance: 70,
      isEstimated: false,
      tags: ['phase-11', 'recovery', 'operation-blackout'],
    }
  ];
  
  const timeIntervals = durationDays / scenarioEvents.length;
  const currentDate = new Date(startDate);
  
  for (let i = 0; i < scenarioEvents.length; i++) {
    currentDate.setDate(currentDate.getDate() + timeIntervals);
    currentDate.setHours(Math.floor(Math.random() * 24));
    
    const event = {
      ...scenarioEvents[i],
      startDate: new Date(currentDate).toISOString(),
      relatedEntities: [...eventIds],
    };
    
    const eventId = await timelineAdapter.addEvent(event);
    if (eventId) eventIds.push(eventId);
  }
  
  return eventIds;
}

export default {
  generateSampleTimelineEvent,
  generateSampleTimelineData,
  generateAttackScenario
};
