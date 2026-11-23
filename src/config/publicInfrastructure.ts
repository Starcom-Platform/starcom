/**
 * Public Infrastructure Configuration for Starcom
 * 
 * This configuration lets the app work without a local RelayNode
 * by connecting to public Nostr relays and IPFS gateways.
 * 
 * DEPLOYMENT MODELS:
 * 1. Pure Web: Use only public infrastructure (zero cost)
 * 2. Hybrid: Auto-detect local RelayNode, fallback to public
 * 3. Enterprise: Private infrastructure only (maximum security)
 */

import PUBLISHERS_DATA from './publishers.json';

/**
 * PUBLIC NOSTR RELAYS — measured, not assumed.
 *
 * This list previously asserted "high-availability, reliable" and half of it
 * was unreachable. Probed 2026-08-23: seven of fourteen configured endpoints
 * across this file failed, including one sitting in the tier this file called
 * "Primary relays (high reliability)".
 *
 * That is the failure that has already cost this network real time elsewhere —
 * a peer's default sync peers became 404s after a host retired its free tier,
 * and the library degraded to a local store so every write appeared to
 * succeed. Free community infrastructure disappears; a config file that claims
 * reliability it has not measured is a claim contradicted by its own network.
 *
 * Retired entries are recorded below with the reason rather than deleted, so
 * nobody re-adds one from an old tutorial.
 */
export const PUBLIC_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  // CHANGED 2026-10-13 (relay survey, 72 relays probed read-only): these two replace getalby and orangepill
  // (retired below). Both are free, open to writes, answered a REQ in well under a second, and hold events
  // Mecha Jono sent them.
  'wss://nostr.oxtr.dev',
  'wss://nostr.bitcoiner.social',
  'wss://nostr.mom',
  'wss://relay.wellorder.net',
  'wss://relay.primal.net'
];

/*
 * ─── THE NAMED SETS — every relay address in the app lives in this file ─────
 *
 * The relays were written out in fourteen files beside this one, seven in the
 * app and seven in scripts, in seven different sets: the globe's intake,
 * nostrService and the publish targets read five; federation six; secure chat's
 * "emergency" three were already in its primary pool; geoint's config listed a
 * relay nothing read; the chat factory named two relays no registry knew; the
 * node descriptor and the claim CLI kept their own copies of federation's six;
 * two check scripts wrote out The Record alone; and two dead scripts named three
 * retired relays (decision D-F; the user chose
 * named sets on 2026-09-19). Membership did not
 * change in this consolidation — publishTargets.ts states why: which relays
 * accept these kinds is a measurable question, and answering it under cover of
 * a refactor would change behaviour silently. The real differences stay, named.
 * guard-hardcoded-relays keeps any address from being written anywhere else.
 */

/**
 * Navcom's default and search relays — where Starcom's intel, Mission Packages
 * and Findings meet Navcom's. The globe's intel intake reads exactly these; so
 * do nostrService's default pool and the publish paths.
 *
 * Spot check 2026-10-12 (the owner asked whether Starcom is being blocked): it
 * is not. Each answered the intake's own REQ, the same with Origin starcom.app
 * as without, with no NOTICE, CLOSED or sign-in demand. Two loose ends, left to
 * the work on relay connections (77a1e33d's): the intake and nostrService open
 * a pool each, so two or three sockets reach each relay at boot, and damus
 * answered one of them HTTP 503; and nostrService's reportRelayFailure logs "no
 * relays are connected" when its other relays are still connecting.
 */
export const NAVCOM_SURFACE_RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.wellorder.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
] as const;

/**
 * The Record — the first of the registered Starcom relay nodes. It is not
 * Starcom's internal relay: it is the first of many relays that will make up a
 * list of registered Starcom relay nodes (the owner, 20 November 2026). Today it
 * is the only one, so it is named alone here; when the list grows, the read set
 * below reads the list.
 *
 * A peer-operated, kind-scoped archive, where Mecha Jono publishes
 * attested claims, open threads, and a companion intel note for each thread.
 *
 * This said "Read for Findings ONLY: the globe's intel intake does not read it,
 * so a report with a location published only here never reaches the globe."
 * That stopped being true at 74808b6b, "The Record joins the globe's intel read
 * set (D-F 4.5)", and stayed on the page for long enough that the peer it
 * describes read our source and told us. A comment nobody has re-read is a
 * claim, and this one was load-bearing: reasoning built next to it concluded
 * the wrong thing about what this node can see.
 */
export const THE_RECORD_RELAY = 'wss://record.cosmiccodex.app';

/**
 * blackpi: a read-only mirror of The Record, on a Raspberry Pi (its RelayNode
 * report of 6 October 2026). It streams The Record live and syncs it in full
 * every 10 minutes, refuses every write, and keeps no reader's address.
 * Starcom reads it only when The Record does not answer, and never writes to it
 * (decision D-MX, MX27).
 */
export const THE_RECORD_MIRROR = 'wss://blackpi.cosmiccodex.app';

/** Read-only mirrors, by the relay they mirror: each read in its place only when it does not answer. */
export const RELAY_MIRRORS: Readonly<Record<string, readonly string[]>> = {
  [THE_RECORD_RELAY]: [THE_RECORD_MIRROR],
};

/**
 * NavCom's site, where it publishes its raw-intel contract
 * (`/.well-known/navcom-intel.json`): the vocabulary an observation is checked
 * against, fetched and never pinned (decision D-MX, MX3). Served with
 * Access-Control-Allow-Origin: *, read 2026-10-06.
 */
export const NAVCOM_ORIGIN = 'https://navcom.app';

/*
 * ─── WHOSE NOTES THE LAYERS READ: DATA, NOT CODE ───────────────────────────
 *
 * Every publisher key, its start, its exposure, and which layers read it, are in
 * publishers.json beside this file, published as /.well-known/starcom-publishers.json
 * (the EIN transition audit, 21 Nov 2026, finding 4). They were constants here,
 * a second copy of Mecha Jono's next key sat in psiWatch/psiEvents.ts, and the
 * comments around them gave five dates for one key change. A key change is now
 * an edit to that file, and nothing in the code names a publisher's key. The
 * names below are kept, derived from it, so their readers did not change.
 */

type LayerReads = 'every key' | 'newest key';

export interface PublisherKey {
  pubkey: string;
  /** When it begins to speak for its publisher, by the publisher's own word; absent: not begun. */
  starts?: string;
  /** The day its secret got out. */
  exposed?: string;
  sent?: string;
  note?: string;
}

export interface Publisher {
  id: string;
  name: string;
  /** Marked as an AI agent's by its operator. */
  agent?: boolean;
  /** Newest first. */
  keys: PublisherKey[];
  layers: Record<string, LayerReads>;
}

/** The layers that read publishers' notes by key, as publishers.json names them. */
export type PublisherLayer = 'raver_watch' | 'hero_watch' | 'ai_watch' | 'civil_unrest' | 'war_conflict' | 'psi_watch' | 'rlsh_recurrence';

export const PUBLISHERS: readonly Publisher[] = (PUBLISHERS_DATA as { publishers: Publisher[] }).publishers;

function publisher(id: string): Publisher {
  const found = PUBLISHERS.find((p) => p.id === id);
  if (!found) throw new Error(`publishers.json names no publisher "${id}".`);
  return found;
}

/** The keys a layer reads: every key of each publisher it reads, or only that publisher's newest. */
export function layerKeys(layer: PublisherLayer): readonly string[] {
  return PUBLISHERS.flatMap((p) => {
    const reads = p.layers[layer];
    if (!reads) return [];
    return reads === 'newest key' ? p.keys.slice(0, 1).map((k) => k.pubkey) : p.keys.map((k) => k.pubkey);
  });
}

/**
 * Mecha Jono's keys, newest first. Every desk of theirs reads all of these, and a note signed under two of them is
 * one note (services/nostr/publisherKeys.ts).
 */
export const MECHA_JONO_KEYS: readonly string[] = publisher('mecha-jono').keys.map((k) => k.pubkey);

/**
 * Keys whose secret is out, each with the day it went: nothing is sealed to one (NavCom's mission interchange
 * §5.0 and §5.3, rev 7). Whoever holds the secret can open a wrap addressed to the key, and the seal inside is
 * signed by whoever sent it, so a report, a return or a message sealed to it would say who sent it.
 */
export const EXPOSED_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  PUBLISHERS.flatMap((p) => p.keys).filter((k) => k.exposed).map((k) => [k.pubkey, k.exposed as string]),
);

/**
 * When each key of a publisher whose keys rotate starts to speak for it, by the publisher's own word (NavCom's
 * registry `notBefore`, §3). A rotating publisher's key without a start has not begun: nothing is sealed to it, and
 * none of its labels on a report is read.
 */
export const KEY_STARTS: Readonly<Record<string, string>> = Object.fromEntries(
  PUBLISHERS.flatMap((p) => p.keys).filter((k) => k.starts).map((k) => [k.pubkey, k.starts as string]),
);

/** Keys their operators mark as an AI agent's. */
export const OPERATOR_STATED_AGENT_KEYS: readonly string[] = PUBLISHERS.filter((p) => p.agent).flatMap((p) => p.keys.map((k) => k.pubkey));

/**
 * Who publishes Raver Watch, the safety notes for people at dance events that
 * Mecha Jono posts to The Record (globe record, section 19). Only these keys
 * are read (decision RW2): a health alert from an unknown key could be a fake
 * red alert or a fake all-clear.
 */
export const RAVER_WATCH_PUBLISHERS: readonly string[] = layerKeys('raver_watch');

/**
 * Who publishes Hero Watch: Mecha Jono's notes of who is responding, and where,
 * and its field missions, on The Record (decision D-HW). Only these keys are
 * read, as for Raver Watch: a mission's safety limits from an unknown key could
 * be anything.
 */
export const HERO_WATCH_PUBLISHERS: readonly string[] = layerKeys('hero_watch');
/**
 * Who publishes AI Watch: Mecha Jono's Terminator Watch desk, on The Record (decision D-AW). Only these
 * keys are read, as for Hero Watch: a headline about AI harm from an unknown key could be anything.
 */
export const AI_WATCH_PUBLISHERS: readonly string[] = layerKeys('ai_watch');

/** Whose protest desk Civil Unrest reads: Mecha Jono's (decision D-CU). */
export const CIVIL_UNREST_PUBLISHERS: readonly string[] = layerKeys('civil_unrest');

/**
 * Who publishes War & Conflict: Mecha Jono's parsed conflict items and its
 * map of the world's wars, on The Record (decisions WC1-WC3). Only these keys
 * are read, as for Raver Watch: casualty claims and a war's tier from an
 * unknown key could be made up.
 */
export const WAR_CONFLICT_PUBLISHERS: readonly string[] = layerKeys('war_conflict');

/**
 * Where this node LISTENS: The Record, then the public surface.
 *
 * Read from by the globe's intel intake (kinds 1 and 30023), by federation
 * Findings and Refutations (30082/30083), and — since packages stopped
 * subscribing to a list of publish destinations — by the Mission Package and
 * reply ingests. Publishing is a separate set; see nostr/publishTargets.ts.
 */
export const FEDERATION_READ_RELAYS = [THE_RECORD_RELAY, ...NAVCOM_SURFACE_RELAYS] as const;

/**
 * The measured pool's relays BEYOND the surface — secure chat's emergency
 * redundancy. Derived, not listed. The emergency set it replaces named three
 * relays already in the primary pool, so switching to it added nothing.
 * (Spot check 2026-09-19: getalby and orangepill, then in this set, failed to answer a REQ. The survey of
 * 2026-10-13 found the same again, so both are retired, and nostr.oxtr.dev and nostr.bitcoiner.social, free and
 * open, take their place. Re-probe with `npm run probe:relays`.)
 */
export const EXTRA_PUBLIC_RELAYS: readonly string[] = PUBLIC_NOSTR_RELAYS.filter(
  (url) => !(NAVCOM_SURFACE_RELAYS as readonly string[]).includes(url),
);

/**
 * The Nostr chat provider's default endpoints, kept as they were. Neither of
 * the last two is in the measured pool; both answered a REQ on 2026-09-19.
 * Named here so the probe and the guard can see them — they could not before.
 */
export const CHAT_PROVIDER_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.info',
  'wss://nostr-pub.wellorder.net',
] as const;

/** Removed from rotation, with the observed reason. Do not re-add without re-probing. */
export const RETIRED_NOSTR_RELAYS = [
  { url: 'wss://relay.snort.social', reason: 'connection timeout', observed: '2026-08-23' },
  { url: 'wss://relay.current.fyi', reason: 'DNS no longer resolves', observed: '2026-08-23' },
  { url: 'wss://brb.io', reason: 'HTTP 404 on upgrade', observed: '2026-08-23' },
  { url: 'wss://relay.nostr.band', reason: 'connection timeout', observed: '2026-08-23' },
  { url: 'wss://nostr.wine', reason: 'HTTP 403 — paid relay, requires auth', observed: '2026-08-23' },
  { url: 'wss://nostr.rocks', reason: 'TLS certificate expired', observed: '2026-08-23' },
  { url: 'wss://relay.nostrich.de', reason: 'self-signed TLS certificate', observed: '2026-08-23' },
  { url: 'wss://relay.getalby.com', reason: 'Nostr Wallet Connect only: rejects a plain REQ ("blocked: Request rejected")', observed: '2026-10-13' },
  { url: 'wss://relay.orangepill.dev', reason: 'paid relay (NIP-11 payment_required), closes the socket on a REQ', observed: '2026-10-13' }
];

/** Retired gateway, kept as a record. Cloudflare shut its public IPFS gateway down. */
export const RETIRED_IPFS_GATEWAYS = [
  { url: 'https://cloudflare-ipfs.com/ipfs/', reason: 'service discontinued — connection fails', observed: '2026-08-23' }
];

// PUBLIC IPFS GATEWAYS — probed 2026-08-23; eight of nine reachable.
export const PUBLIC_IPFS_GATEWAYS = [
  // Primary gateways (high performance)
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  
  // Secondary gateways (redundancy)
  'https://dweb.link/ipfs/',
  'https://ipfs.infura.io/ipfs/',
  'https://gateway.ipfs.io/ipfs/',
  
  // Specialized gateways
  'https://4everland.io/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://w3s.link/ipfs/'
];

// IPFS UPLOAD SERVICES - For storing content on IPFS
export const IPFS_UPLOAD_SERVICES = [
  {
    name: 'Pinata',
    endpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
    apiKeyRequired: true,
    free: true,
    limits: '1GB free'
  },
  {
    name: 'Web3.Storage',
    endpoint: 'https://api.web3.storage/upload',
    apiKeyRequired: true,
    free: true,
    limits: 'Unlimited free'
  },
  {
    name: 'NFT.Storage',
    endpoint: 'https://api.nft.storage/upload',
    apiKeyRequired: true,
    free: true,
    limits: '32GB per file, unlimited'
  },
  {
    name: 'Infura IPFS',
    endpoint: 'https://ipfs.infura.io:5001/api/v0/add',
    apiKeyRequired: true,
    free: false,
    limits: 'Pay per use'
  }
];

// INFRASTRUCTURE DETECTION CONFIGURATION
export const INFRASTRUCTURE_CONFIG = {
  // RelayNode detection
  LOCAL_RELAYNODE_ENDPOINTS: [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://192.168.1.100:8080', // Common LAN IP
    'http://10.0.0.100:8080'     // Common LAN IP
  ],
  
  // Detection timeouts
  DETECTION_TIMEOUT: 3000, // 3 seconds
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  
  // Fallback strategy
  FALLBACK_STRATEGY: 'hybrid', // 'local-only' | 'public-only' | 'hybrid'
  
  // Team collaboration settings
  TEAM_SYNC_INTERVAL: 60000, // 1 minute
  CONTENT_REPLICATION_TIMEOUT: 10000, // 10 seconds
  
  // Public infrastructure limits
  MAX_CONTENT_SIZE_PUBLIC: 5 * 1024 * 1024, // 5MB for public gateways
  MAX_DAILY_UPLOADS: 100, // Rate limiting for public services
  
  // Reliability thresholds
  MIN_RELAY_CONNECTIONS: 2,
  MIN_GATEWAY_AVAILABILITY: 1,
  
  // Security settings for public infrastructure
  ENCRYPT_FOR_PUBLIC: true,
  REQUIRE_TEAM_SIGNATURES: true,
  /*
   * `PUBLIC_CONTENT_CLASSIFICATION_LIMIT: 'CONFIDENTIAL'` stood here, commented
   * "Max classification for public infra". One reference in the whole tree —
   * this declaration. Nothing compared anything against it, so the limit
   * limited nothing.
   *
   * What it was reaching for is real and is enforced now, by
   * MissionService.publicRelayRefusal, which refuses the publish rather than
   * naming a ceiling nobody checks.
   */
};

// TEAM COLLABORATION CONFIGURATION
export const TEAM_CONFIG = {
  // Team discovery methods
  DISCOVERY_METHODS: [
    'invite-link',    // Team leader creates invite link
    'qr-code',        // QR code for easy mobile joining
    'team-id',        // Manual team ID entry
    'nostr-event'     // Discover via Nostr announcements
  ],
  
  // Communication channels
  COMMUNICATION_CHANNELS: [
    'nostr-dm',       // Direct messages via Nostr
    'team-channel',   // Dedicated team channel
    'investigation-thread' // Per-investigation discussions
  ],
  
  // Collaboration modes
  COLLABORATION_MODES: {
    'OPEN': {
      description: 'Anyone can join with invite link',
      security: 'basic',
      suitable_for: 'Public threat intelligence sharing'
    },
    'INVITE_ONLY': {
      description: 'Manual approval required',
      security: 'medium',
      suitable_for: 'Trusted team investigations'
    },
    'ENTERPRISE': {
      description: 'Requires RelayNode and DID verification',
      security: 'maximum',
      suitable_for: 'Classified investigations'
    }
  },
  
  // Default team settings
  DEFAULT_TEAM_SETTINGS: {
    autoShareFindings: true,
    allowExternalCollaboration: false,
    requireApprovalForMembers: true,
    contentRetentionDays: 90,
    maxTeamSize: 20
  }
};

// DEPLOYMENT SCENARIOS
export const DEPLOYMENT_SCENARIOS = {
  // Scenario 1: Pure serverless (no infrastructure costs)
  SERVERLESS: {
    name: 'Serverless Deployment',
    infrastructure: 'public-only',
    cost: '$0/month',
    setup_time: '5 minutes',
    suitable_for: 'Individual analysts, small teams, public threat intelligence',
    limitations: ['5MB content limit', 'Basic collaboration features', 'Public infrastructure dependency'],
    setup_guide: 'SERVERLESS_SETUP.md'
  },
  
  // Scenario 2: Hybrid (best of both worlds)
  HYBRID: {
    name: 'Hybrid Deployment',
    infrastructure: 'auto-detect',
    cost: '$0-50/month (optional RelayNode)',
    setup_time: '15 minutes',
    suitable_for: 'Growing teams, mixed public/private content',
    limitations: ['Setup complexity'],
    setup_guide: 'HYBRID_SETUP.md'
  },
  
  // Scenario 3: Enterprise (maximum security)
  ENTERPRISE: {
    name: 'Enterprise Deployment',
    infrastructure: 'private-only',
    cost: '$100-500/month (infrastructure)',
    setup_time: '1-2 hours',
    suitable_for: 'Government agencies, classified investigations',
    limitations: ['Higher cost', 'Technical expertise required'],
    setup_guide: 'ENTERPRISE_SETUP.md'
  }
};

// PUBLIC INFRASTRUCTURE SERVICE STATUS
export interface InfrastructureStatus {
  relayNode: {
    available: boolean;
    endpoint?: string;
    capabilities?: string[];
  };
  publicRelays: {
    connected: number;
    total: number;
    healthy: string[];
    failed: string[];
  };
  ipfsGateways: {
    available: number;
    total: number;
    healthy: string[];
    failed: string[];
  };
  recommendedMode: 'local' | 'hybrid' | 'public';
}

// UTILITY FUNCTIONS
export const createTeamInviteLink = (teamId: string, teamName: string): string => {
  const baseUrl = window.location.origin;
  const inviteData = btoa(JSON.stringify({ teamId, teamName, timestamp: Date.now() }));
  return `${baseUrl}/join-team?invite=${inviteData}`;
};

export const parseTeamInviteLink = (inviteLink: string): { teamId: string; teamName: string; timestamp: number } | null => {
  try {
    const url = new URL(inviteLink);
    const inviteParam = url.searchParams.get('invite');
    if (!inviteParam) return null;
    
    return JSON.parse(atob(inviteParam));
  } catch {
    return null;
  }
};

export const generateTeamQRCode = (teamId: string, teamName: string): string => {
  const inviteLink = createTeamInviteLink(teamId, teamName);
  // In production, use a QR code library like 'qrcode'
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`;
};

// REAL-WORLD DEPLOYMENT TEMPLATES
export const DEPLOYMENT_TEMPLATES = {
  'small-soc': {
    name: 'Small SOC Team (5-10 analysts)',
    recommended: 'HYBRID',
    monthly_cost: '$25',
    features: ['Team collaboration', 'Threat intelligence sharing', 'Investigation coordination'],
    setup_commands: [
      'git clone https://github.com/your-org/starcom-app',
      'cd dapp && npm install',
      'npm run build',
      'npm run deploy'
    ]
  },
  
  'government-agency': {
    name: 'Government Agency (20+ analysts)',
    recommended: 'ENTERPRISE',
    monthly_cost: '$200-500',
    features: ['Private infrastructure', 'Classified content support', 'Advanced security'],
    setup_commands: [
      'Deploy RelayNode on secure servers',
      'Configure VPN access',
      'Set up DID authentication',
      'Deploy dApp with private config'
    ]
  },
  
  'freelance-analyst': {
    name: 'Freelance Security Analyst',
    recommended: 'SERVERLESS',
    monthly_cost: '$0',
    features: ['Personal investigation tracking', 'Public threat intelligence', 'Portfolio building'],
    setup_commands: [
      'Visit https://starcom-app.vercel.app',
      'Connect wallet',
      'Start investigating'
    ]
  }
};
