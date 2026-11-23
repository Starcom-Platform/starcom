/**
 * IntelDataCore - Sample Data Generator
 * 
 * Operation Blackout — A coherent cyber investigation scenario
 * tracking APT group "Shadow Collective" targeting critical energy infrastructure.
 * 
 * This replaces generic random data with a realistic narrative that connects
 * NodeGraphView, TimelineView, and CasesDashboard into a unified story.
 */

import {
  NodeEntity,
  EdgeRelationship,
  NodeType,
  
} from '../types/intelDataModels';
import { nodeWebAdapter } from '../adapters/nodeWebAdapter';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'SampleDataGenerator' });

// ──────────────────────────────────────────────────────
// Operation Blackout Entity Definitions
// ──────────────────────────────────────────────────────

interface ScenarioNode {
  key: string;           // lookup key for edge wiring
  nodeType: NodeType;
  title: string;
  description: string;
  confidence: number;
  verified: boolean;
  tags: string[];
  properties: Record<string, any>;
  displayOptions: { size: number; color: string; icon: string; shape: string };
}

const THREAT_COLOR = '#EA4335';
const TARGET_COLOR = '#4285F4';
const INFRA_COLOR = '#FD7E14';
const MALWARE_COLOR = '#7952B3';
const LOCATION_COLOR = '#34A853';
const SYSTEM_COLOR = '#1DA1F2';
const PERSON_ALLIED = '#20C997';

const SCENARIO_NODES: ScenarioNode[] = [
  // ── Threat Actor Group ──
  {
    key: 'shadow-collective',
    nodeType: NodeType.THREAT_ACTOR,
    title: 'Shadow Collective',
    description: 'State-sponsored APT group specializing in critical infrastructure attacks. Active since 2019. Known for multi-stage supply chain compromises.',
    confidence: 82,
    verified: true,
    tags: ['apt', 'critical-infrastructure', 'state-sponsored', 'operation-blackout'],
    properties: { aliases: ['APT-SC7', 'DarkGrid'], firstSeen: '2019-03-14', motivation: 'Espionage / Disruption', sophistication: 'Advanced' },
    displayOptions: { size: 45, color: THREAT_COLOR, icon: 'mask', shape: 'diamond' }
  },
  {
    key: 'darkspectre',
    nodeType: NodeType.PERSON,
    title: 'Viktor Petrov "DarkSpectre"',
    description: 'Lead operator for Shadow Collective. Responsible for command & control infrastructure and operational planning.',
    confidence: 68,
    verified: false,
    tags: ['operator', 'c2-management', 'operation-blackout'],
    properties: { firstName: 'Viktor', lastName: 'Petrov', alias: 'DarkSpectre', nationality: 'Unknown', occupation: 'APT Operator', age: 34 },
    displayOptions: { size: 35, color: THREAT_COLOR, icon: 'user-secret', shape: 'diamond' }
  },
  {
    key: 'ghostwire',
    nodeType: NodeType.PERSON,
    title: 'Mei Lin Chen "GhostWire"',
    description: 'Malware developer for Shadow Collective. Author of BlackoutLoader and GridPhantom RAT toolchain.',
    confidence: 55,
    verified: false,
    tags: ['developer', 'malware-author', 'operation-blackout'],
    properties: { firstName: 'Mei Lin', lastName: 'Chen', alias: 'GhostWire', nationality: 'Unknown', occupation: 'Malware Developer', age: 29 },
    displayOptions: { size: 30, color: THREAT_COLOR, icon: 'user-ninja', shape: 'diamond' }
  },
  // ── Target Organization ──
  {
    key: 'example-energy',
    nodeType: NodeType.ORGANIZATION,
    title: 'Example Energy Corp',
    description: 'Major North American energy utility operating 12 power plants and critical grid infrastructure across 6 states. Primary target of Operation Blackout.',
    confidence: 95,
    verified: true,
    tags: ['target', 'energy-sector', 'critical-infrastructure', 'operation-blackout'],
    properties: { name: 'Example Energy Corp', industry: 'Energy / Utilities', employeeCount: 8400, founded: 1987, country: 'USA', headquarters: 'Houston, TX' },
    displayOptions: { size: 40, color: TARGET_COLOR, icon: 'industry', shape: 'square' }
  },
  {
    key: 'sarah-okafor',
    nodeType: NodeType.PERSON,
    title: 'Dr. Sarah Okafor',
    description: 'CISO of Example Energy Corp. Led the incident response that detected and contained the Shadow Collective intrusion.',
    confidence: 98,
    verified: true,
    tags: ['defender', 'incident-response', 'operation-blackout'],
    properties: { firstName: 'Sarah', lastName: 'Okafor', nationality: 'USA', occupation: 'Chief Information Security Officer', age: 42 },
    displayOptions: { size: 30, color: PERSON_ALLIED, icon: 'user-shield', shape: 'circle' }
  },
  {
    key: 'james-whitfield',
    nodeType: NodeType.PERSON,
    title: 'James Whitfield',
    description: 'Senior Systems Administrator at Example Energy. Account compromised via spear-phishing. Initial access vector for the attack.',
    confidence: 90,
    verified: true,
    tags: ['compromised', 'initial-access', 'phishing-victim', 'operation-blackout'],
    properties: { firstName: 'James', lastName: 'Whitfield', nationality: 'USA', occupation: 'Senior Sysadmin', age: 38 },
    displayOptions: { size: 28, color: '#FBBC05', icon: 'user-injured', shape: 'circle' }
  },
  // ── C2 Infrastructure ──
  {
    key: 'c2-server',
    nodeType: NodeType.IP_ADDRESS,
    title: '185.220.101.42',
    description: 'Primary Command & Control server hosting Shadow Collective operations. Hosted at bulletproof provider in Bucharest, Romania.',
    confidence: 91,
    verified: true,
    tags: ['c2', 'infrastructure', 'malicious', 'operation-blackout'],
    properties: { address: '185.220.101.42', provider: 'BulletShield Hosting', country: 'Romania', active: true, port: 443 },
    displayOptions: { size: 32, color: INFRA_COLOR, icon: 'server', shape: 'hexagon' }
  },
  {
    key: 'exfil-server',
    nodeType: NodeType.IP_ADDRESS,
    title: '93.184.216.34',
    description: 'Data exfiltration staging server. Received 2.3 TB of stolen data from Example Energy before detection.',
    confidence: 87,
    verified: true,
    tags: ['exfiltration', 'infrastructure', 'malicious', 'operation-blackout'],
    properties: { address: '93.184.216.34', provider: 'DarkNet Transit AG', country: 'Germany', active: false, port: 8443 },
    displayOptions: { size: 30, color: INFRA_COLOR, icon: 'network-wired', shape: 'hexagon' }
  },
  {
    key: 'proxy-relay',
    nodeType: NodeType.IP_ADDRESS,
    title: '45.33.32.156',
    description: 'Anonymizing relay node used to obscure C2 traffic origin. Part of Shadow Collective proxy chain.',
    confidence: 72,
    verified: true,
    tags: ['proxy', 'infrastructure', 'operation-blackout'],
    properties: { address: '45.33.32.156', provider: 'AnonVPS Ltd', country: 'Netherlands', active: true },
    displayOptions: { size: 24, color: INFRA_COLOR, icon: 'network-wired', shape: 'hexagon' }
  },
  {
    key: 'shadowgate-domain',
    nodeType: NodeType.DOMAIN,
    title: 'shadowgate.cc',
    description: 'Primary C2 domain resolving to rotating infrastructure. Registered through anonymous registrar with cryptocurrency.',
    confidence: 94,
    verified: true,
    tags: ['c2-domain', 'infrastructure', 'malicious', 'operation-blackout'],
    properties: { name: 'shadowgate.cc', registrar: 'NjallaDomains', registered: '2023-06-12T00:00:00Z', country: 'Iceland', privacy: true },
    displayOptions: { size: 30, color: INFRA_COLOR, icon: 'globe', shape: 'hexagon' }
  },
  {
    key: 'phishing-domain',
    nodeType: NodeType.DOMAIN,
    title: 'energy-vpn-update.example',
    description: 'Typosquatting domain used in spear-phishing campaign against Example Energy employees. Hosted credential harvester.',
    confidence: 96,
    verified: true,
    tags: ['phishing', 'social-engineering', 'operation-blackout'],
    properties: { name: 'energy-vpn-update.example', registrar: 'an example registrar', registered: '2024-01-08T00:00:00Z', country: 'Panama' },
    displayOptions: { size: 28, color: INFRA_COLOR, icon: 'sitemap', shape: 'hexagon' }
  },
  {
    key: 'watering-hole',
    nodeType: NodeType.DOMAIN,
    title: 'energy-sector-news.net',
    description: 'Compromised news aggregator used as watering hole. Injected with browser exploit kit targeting energy sector visitors.',
    confidence: 78,
    verified: true,
    tags: ['watering-hole', 'supply-chain', 'operation-blackout'],
    properties: { name: 'energy-sector-news.net', registrar: 'GoDaddy', registered: '2021-09-01T00:00:00Z', compromisedSince: '2024-01-15T00:00:00Z' },
    displayOptions: { size: 26, color: '#FBBC05', icon: 'browser', shape: 'hexagon' }
  },
  // ── Malware ──
  {
    key: 'blackout-loader',
    nodeType: NodeType.MALWARE,
    title: 'BlackoutLoader',
    description: 'Custom first-stage dropper delivered via phishing. Establishes persistence and downloads GridPhantom RAT. Uses DLL sideloading.',
    confidence: 88,
    verified: true,
    tags: ['dropper', 'first-stage', 'operation-blackout'],
    properties: { family: 'BlackoutLoader', sha256: 'a1b2c3d4e5f6...', detectionRate: '12/67', technique: 'DLL Sideloading', size: '284 KB' },
    displayOptions: { size: 32, color: MALWARE_COLOR, icon: 'bug', shape: 'star' }
  },
  {
    key: 'gridphantom-rat',
    nodeType: NodeType.MALWARE,
    title: 'GridPhantom RAT',
    description: 'Custom remote access trojan with SCADA-aware modules. Capable of ICS protocol manipulation (Modbus, DNP3). Signature tool of Shadow Collective.',
    confidence: 85,
    verified: true,
    tags: ['rat', 'ics-aware', 'scada', 'operation-blackout'],
    properties: { family: 'GridPhantom', sha256: 'f7e8d9c0b1a2...', protocols: ['Modbus', 'DNP3', 'IEC 61850'], capabilities: ['Keylogging', 'Screen capture', 'File exfil', 'SCADA manipulation'] },
    displayOptions: { size: 35, color: MALWARE_COLOR, icon: 'virus', shape: 'star' }
  },
  // ── Locations ──
  {
    key: 'bucharest-dc',
    nodeType: NodeType.LOCATION,
    title: 'Bucharest Data Center',
    description: 'Bulletproof hosting facility in Bucharest, Romania. Houses primary C2 infrastructure for Shadow Collective.',
    confidence: 83,
    verified: true,
    tags: ['hosting', 'infrastructure', 'operation-blackout'],
    properties: { name: 'Bucharest Data Center', country: 'Romania', latitude: 44.4268, longitude: 26.1025, facility: 'Bulletproof hosting' },
    displayOptions: { size: 26, color: LOCATION_COLOR, icon: 'map-marker', shape: 'triangle' }
  },
  {
    key: 'frankfurt-relay',
    nodeType: NodeType.LOCATION,
    title: 'Frankfurt Relay Hub',
    description: 'Proxy relay location in Frankfurt, Germany. Used for anonymizing exfiltration traffic.',
    confidence: 75,
    verified: true,
    tags: ['proxy', 'relay', 'operation-blackout'],
    properties: { name: 'Frankfurt Relay Hub', country: 'Germany', latitude: 50.1109, longitude: 8.6821 },
    displayOptions: { size: 24, color: LOCATION_COLOR, icon: 'map-pin', shape: 'triangle' }
  },
  {
    key: 'houston-hq',
    nodeType: NodeType.LOCATION,
    title: 'Example Energy HQ — Houston, TX',
    description: 'Corporate headquarters of Example Energy Corp. Houses IT operations center and primary SOC.',
    confidence: 100,
    verified: true,
    tags: ['target-location', 'headquarters', 'operation-blackout'],
    properties: { name: 'Example Energy HQ', country: 'USA', latitude: 29.7604, longitude: -95.3698, state: 'Texas' },
    displayOptions: { size: 30, color: LOCATION_COLOR, icon: 'city', shape: 'square' }
  },
  {
    key: 'plant-eagle-pass',
    nodeType: NodeType.LOCATION,
    title: 'Example Energy Plant — Eagle Pass',
    description: 'Gas-fired power plant in Eagle Pass, TX. SCADA systems were primary target of GridPhantom RAT.',
    confidence: 95,
    verified: true,
    tags: ['target-location', 'scada', 'critical-infrastructure', 'operation-blackout'],
    properties: { name: 'Eagle Pass Generating Station', country: 'USA', latitude: 28.7091, longitude: -100.4995, capacity: '1.2 GW', state: 'Texas' },
    displayOptions: { size: 28, color: '#EA4335', icon: 'map-marker', shape: 'square' }
  },
  // ── Systems ──
  {
    key: 'scada-server',
    nodeType: NodeType.SYSTEM,
    title: 'SCADA Control Server (EP-SCADA-01)',
    description: 'Primary SCADA control system at Eagle Pass plant. Target of GridPhantom RAT. Controls turbine operations via Modbus.',
    confidence: 92,
    verified: true,
    tags: ['scada', 'ics', 'critical-target', 'operation-blackout'],
    properties: { hostname: 'EP-SCADA-01', os: 'Windows Server 2016', role: 'SCADA HMI', protocols: ['Modbus TCP', 'OPC UA'], network: 'OT Zone' },
    displayOptions: { size: 34, color: SYSTEM_COLOR, icon: 'microchip', shape: 'square' }
  },
  {
    key: 'vpn-gateway',
    nodeType: NodeType.SYSTEM,
    title: 'Corporate VPN Gateway (MER-VPN-01)',
    description: 'Example Energy corporate VPN appliance. Compromised credentials from phishing provided initial network access.',
    confidence: 95,
    verified: true,
    tags: ['initial-access', 'entry-point', 'operation-blackout'],
    properties: { hostname: 'MER-VPN-01', os: 'FortiOS 7.2', role: 'VPN Gateway', network: 'DMZ' },
    displayOptions: { size: 28, color: SYSTEM_COLOR, icon: 'server', shape: 'square' }
  },
  {
    key: 'exchange-server',
    nodeType: NodeType.SYSTEM,
    title: 'Exchange Server (MER-EX-01)',
    description: 'Microsoft Exchange server used for lateral movement. Attacker harvested credentials from Global Address List.',
    confidence: 90,
    verified: true,
    tags: ['lateral-movement', 'credential-harvest', 'operation-blackout'],
    properties: { hostname: 'MER-EX-01', os: 'Windows Server 2019', role: 'Email Server', network: 'Corporate' },
    displayOptions: { size: 26, color: SYSTEM_COLOR, icon: 'server', shape: 'square' }
  },
  {
    key: 'historian-server',
    nodeType: NodeType.SYSTEM,
    title: 'OT Historian (EP-HIST-01)',
    description: 'Operational Technology data historian at Eagle Pass. Stores SCADA telemetry. Attackers used it to map control network topology.',
    confidence: 88,
    verified: true,
    tags: ['ot-network', 'reconnaissance-target', 'operation-blackout'],
    properties: { hostname: 'EP-HIST-01', os: 'Windows Server 2016', role: 'OT Historian', network: 'OT Zone' },
    displayOptions: { size: 26, color: SYSTEM_COLOR, icon: 'database', shape: 'square' }
  },
  // ── Additional Intel Entities ──
  {
    key: 'cert-advisory',
    nodeType: NodeType.FILE,
    title: 'CERT Advisory ICS-ALERT-2024-031',
    description: 'Government CERT advisory warning energy sector of Shadow Collective targeting. Published 3 weeks before Example Energy breach.',
    confidence: 100,
    verified: true,
    tags: ['advisory', 'intelligence', 'early-warning', 'operation-blackout'],
    properties: { name: 'ICS-ALERT-2024-031', format: 'STIX 2.1', source: 'a national CERT (example)', published: '2024-01-20T00:00:00Z' },
    displayOptions: { size: 22, color: '#FBBC05', icon: 'file-pdf', shape: 'circle' }
  },
  {
    key: 'darkweb-posting',
    nodeType: NodeType.FILE,
    title: 'Dark Web Posting — "GridKill" Auction',
    description: 'Forum posting on dark web marketplace offering SCADA exploit toolkit. Linked to Shadow Collective tooling.',
    confidence: 62,
    verified: false,
    tags: ['dark-web', 'osint', 'exploit-market', 'operation-blackout'],
    properties: { name: 'GridKill Auction Listing', format: 'Forum Post', source: 'DarkNet OSINT', discovered: '2024-02-01T00:00:00Z' },
    displayOptions: { size: 20, color: THREAT_COLOR, icon: 'file-code', shape: 'circle' }
  },
];

// ──────────────────────────────────────────────────────
// Edge Definitions - Wiring the investigation graph
// ──────────────────────────────────────────────────────

interface ScenarioEdge {
  sourceKey: string;
  targetKey: string;
  type: string;
  strength: number;
  direction: 'unidirectional' | 'bidirectional';
  confidence: number;
  tags: string[];
  displayOptions: { width: number; color: string; style: 'dashed' | 'dotted' | 'solid' };
}

const SCENARIO_EDGES: ScenarioEdge[] = [
  // Threat Actor → Infrastructure
  { sourceKey: 'shadow-collective', targetKey: 'darkspectre', type: 'CONTROLS', strength: 90, direction: 'unidirectional', confidence: 70, tags: ['attribution'], displayOptions: { width: 3, color: THREAT_COLOR, style: 'solid' } },
  { sourceKey: 'shadow-collective', targetKey: 'ghostwire', type: 'CONTROLS', strength: 85, direction: 'unidirectional', confidence: 55, tags: ['attribution'], displayOptions: { width: 3, color: THREAT_COLOR, style: 'solid' } },
  { sourceKey: 'darkspectre', targetKey: 'c2-server', type: 'CONTROLS', strength: 88, direction: 'unidirectional', confidence: 75, tags: ['c2-ops'], displayOptions: { width: 3, color: INFRA_COLOR, style: 'solid' } },
  { sourceKey: 'darkspectre', targetKey: 'exfil-server', type: 'CONTROLS', strength: 80, direction: 'unidirectional', confidence: 70, tags: ['exfil-ops'], displayOptions: { width: 2, color: INFRA_COLOR, style: 'solid' } },
  { sourceKey: 'ghostwire', targetKey: 'blackout-loader', type: 'OWNS', strength: 90, direction: 'unidirectional', confidence: 60, tags: ['authorship'], displayOptions: { width: 3, color: MALWARE_COLOR, style: 'solid' } },
  { sourceKey: 'ghostwire', targetKey: 'gridphantom-rat', type: 'OWNS', strength: 92, direction: 'unidirectional', confidence: 58, tags: ['authorship'], displayOptions: { width: 3, color: MALWARE_COLOR, style: 'solid' } },

  // Infrastructure connections
  { sourceKey: 'c2-server', targetKey: 'shadowgate-domain', type: 'COMMUNICATES_WITH', strength: 95, direction: 'bidirectional', confidence: 94, tags: ['dns-resolution'], displayOptions: { width: 2, color: INFRA_COLOR, style: 'solid' } },
  { sourceKey: 'c2-server', targetKey: 'proxy-relay', type: 'COMMUNICATES_WITH', strength: 85, direction: 'unidirectional', confidence: 80, tags: ['proxy-chain'], displayOptions: { width: 2, color: INFRA_COLOR, style: 'dashed' } },
  { sourceKey: 'c2-server', targetKey: 'bucharest-dc', type: 'LOCATED_AT', strength: 95, direction: 'unidirectional', confidence: 90, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },
  { sourceKey: 'exfil-server', targetKey: 'frankfurt-relay', type: 'LOCATED_AT', strength: 88, direction: 'unidirectional', confidence: 85, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },

  // Attack chain
  { sourceKey: 'phishing-domain', targetKey: 'james-whitfield', type: 'ACCESSED', strength: 96, direction: 'unidirectional', confidence: 95, tags: ['initial-access', 'phishing'], displayOptions: { width: 4, color: THREAT_COLOR, style: 'solid' } },
  { sourceKey: 'blackout-loader', targetKey: 'vpn-gateway', type: 'ACCESSED', strength: 90, direction: 'unidirectional', confidence: 88, tags: ['persistence', 'payload-delivery'], displayOptions: { width: 3, color: MALWARE_COLOR, style: 'solid' } },
  { sourceKey: 'gridphantom-rat', targetKey: 'exchange-server', type: 'ACCESSED', strength: 85, direction: 'unidirectional', confidence: 82, tags: ['lateral-movement'], displayOptions: { width: 3, color: MALWARE_COLOR, style: 'solid' } },
  { sourceKey: 'gridphantom-rat', targetKey: 'historian-server', type: 'ACCESSED', strength: 80, direction: 'unidirectional', confidence: 78, tags: ['reconnaissance'], displayOptions: { width: 3, color: MALWARE_COLOR, style: 'dashed' } },
  { sourceKey: 'gridphantom-rat', targetKey: 'scada-server', type: 'ACCESSED', strength: 70, direction: 'unidirectional', confidence: 72, tags: ['target-access', 'ics-threat'], displayOptions: { width: 4, color: '#EA4335', style: 'solid' } },
  { sourceKey: 'gridphantom-rat', targetKey: 'c2-server', type: 'COMMUNICATES_WITH', strength: 92, direction: 'bidirectional', confidence: 90, tags: ['c2-beacon'], displayOptions: { width: 3, color: INFRA_COLOR, style: 'solid' } },
  { sourceKey: 'scada-server', targetKey: 'exfil-server', type: 'COMMUNICATES_WITH', strength: 75, direction: 'unidirectional', confidence: 85, tags: ['exfiltration'], displayOptions: { width: 4, color: '#EA4335', style: 'solid' } },

  // Target org relationships
  { sourceKey: 'james-whitfield', targetKey: 'example-energy', type: 'PART_OF', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['employment'], displayOptions: { width: 1, color: TARGET_COLOR, style: 'solid' } },
  { sourceKey: 'sarah-okafor', targetKey: 'example-energy', type: 'PART_OF', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['employment'], displayOptions: { width: 1, color: TARGET_COLOR, style: 'solid' } },
  { sourceKey: 'example-energy', targetKey: 'houston-hq', type: 'LOCATED_AT', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },
  { sourceKey: 'example-energy', targetKey: 'plant-eagle-pass', type: 'OWNS', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['asset'], displayOptions: { width: 2, color: TARGET_COLOR, style: 'solid' } },
  { sourceKey: 'scada-server', targetKey: 'plant-eagle-pass', type: 'LOCATED_AT', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },
  { sourceKey: 'historian-server', targetKey: 'plant-eagle-pass', type: 'LOCATED_AT', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },
  { sourceKey: 'vpn-gateway', targetKey: 'houston-hq', type: 'LOCATED_AT', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },
  { sourceKey: 'exchange-server', targetKey: 'houston-hq', type: 'LOCATED_AT', strength: 100, direction: 'unidirectional', confidence: 100, tags: ['geolocation'], displayOptions: { width: 1, color: LOCATION_COLOR, style: 'solid' } },

  // Watering hole chain
  { sourceKey: 'shadow-collective', targetKey: 'watering-hole', type: 'CONTROLS', strength: 75, direction: 'unidirectional', confidence: 62, tags: ['compromise'], displayOptions: { width: 2, color: THREAT_COLOR, style: 'dashed' } },

  // Intel connections
  { sourceKey: 'cert-advisory', targetKey: 'shadow-collective', type: 'AFFILIATED_WITH', strength: 80, direction: 'unidirectional', confidence: 90, tags: ['intelligence'], displayOptions: { width: 1, color: '#FBBC05', style: 'dashed' } },
  { sourceKey: 'darkweb-posting', targetKey: 'gridphantom-rat', type: 'AFFILIATED_WITH', strength: 60, direction: 'unidirectional', confidence: 55, tags: ['osint'], displayOptions: { width: 1, color: '#FBBC05', style: 'dashed' } },
  { sourceKey: 'shadow-collective', targetKey: 'example-energy', type: 'ACCESSED', strength: 85, direction: 'unidirectional', confidence: 80, tags: ['targeting', 'operation-blackout'], displayOptions: { width: 4, color: THREAT_COLOR, style: 'solid' } },
];

// ──────────────────────────────────────────────────────
// Public API — same signatures as before
// ──────────────────────────────────────────────────────

/**
 * Generate Operation Blackout scenario data.
 * Parameters are accepted for API compatibility but the scenario is deterministic.
 *
 * Writes through nodeWebAdapter onto the unified Intel substrate
 * (services/intel/IntelWorkspaceManager) — NodeGraphView no longer reads
 * from core/intel's storageOrchestrator/intelDataStore, so seeding that
 * store here would silently produce a graph nobody ever sees. Matches
 * timelineDataGenerator.ts/caseDataGenerator.ts, neither of which clears
 * existing data before seeding either: IntelWorkspaceManager has no
 * generic "remove item" capability to clear against (see nodeWebAdapter's
 * deleteNode()), so repeated dev-mode loads accumulate rather than reset —
 * an accepted characteristic of this whole demo-seeding path, not unique
 * to NodeWeb.
 */
export async function generateSampleData(_nodeCount?: number, _edgeCount?: number): Promise<void> {
  log.debug('Generating Operation Blackout scenario data...');

  // Create nodes, building a key→id map for edge wiring
  const keyToId: Record<string, string> = {};

  for (const def of SCENARIO_NODES) {
    const node: Partial<NodeEntity> = {
      type: 'node',
      nodeType: def.nodeType,
      title: def.title,
      description: def.description,
      source: 'Operation Blackout',
      verified: def.verified,
      confidence: def.confidence,
      createdBy: 'intel-analyst',
      properties: def.properties,
      tags: def.tags,
      displayOptions: def.displayOptions
    };

    const nodeId = await nodeWebAdapter.addNode(node);
    if (nodeId) {
      keyToId[def.key] = nodeId;
    }
  }

  // Create edges using the key→id mapping
  for (const edge of SCENARIO_EDGES) {
    const sourceId = keyToId[edge.sourceKey];
    const targetId = keyToId[edge.targetKey];
    if (!sourceId || !targetId) {
      log.warn(`Skipping edge ${edge.sourceKey} → ${edge.targetKey}: missing node`);
      continue;
    }

    const relationship: Partial<EdgeRelationship> = {
      type: edge.type,
      sourceId,
      targetId,
      strength: edge.strength,
      direction: edge.direction,
      createdBy: 'intel-analyst',
      confidence: edge.confidence,
      tags: [...edge.tags, 'operation-blackout'],
      timeframe: {
        startDate: new Date(Date.now() - 30 * 86400000).toISOString(),
        isEstimated: false
      },
      displayOptions: edge.displayOptions
    };

    await nodeWebAdapter.addEdge(relationship);
  }

  log.debug(`Operation Blackout: ${SCENARIO_NODES.length} nodes, ${SCENARIO_EDGES.length} edges created`);
}

// Export a function to initialize sample data
export async function initializeSampleData(): Promise<void> {
  await generateSampleData();
}
