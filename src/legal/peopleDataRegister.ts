/**
 * The people's data register (decision D-CS, CS5; docs/missions/01-architecture-decisions/commercial-split.md, part 3):
 * what Starcom keeps, sends and publishes about the person using it and about other people. It is the evidence a
 * grant's data-handling questions are answered from, beside the source register (sourceRegister.ts), which says where
 * the data comes from and on what terms.
 *
 * Each entry says whose data it is, what it is, where it is held, who can read it there, how long it stays and how it
 * is removed, and the code that keeps or sends it. Its test fails when a file that uses the browser's storage is named
 * by no entry, so a new store cannot arrive unrecorded. Every claim was read from the code on 2026-11-11.
 *
 * `holder` reads:
 * - `device`: this browser only (localStorage, sessionStorage or IndexedDB); nothing leaves it from here;
 * - `relays`: Nostr relays, through a signed note; public unless sealed or sent to a team's own relay;
 * - `provider`: a service the browser contacts directly for a layer, a lookup or a translation;
 * - `hosting`: the host that serves Starcom itself.
 */

export type Subject = 'person' | 'others' | 'both' | 'none';
export type Holder = 'device' | 'relays' | 'provider' | 'hosting';

export interface PeopleDataEntry {
  id: string;
  name: string;
  /** Whose data it is: the person using Starcom, other people, both, or no one (preferences, copies of public data). */
  subject: Subject;
  /** What is held or sent. */
  what: string;
  holder: Holder;
  /** Who can read it there. */
  seenBy: string;
  /** How long it stays, and how it is removed. */
  kept: string;
  /** The code that keeps or sends it. */
  files: string[];
  /** A risk or a gap the grant dossier must name. */
  finding?: string;
}

const CLEAR = 'until the person clears this device in Settings, or this site\'s data in their browser';

export const PEOPLE_DATA_REGISTER: readonly PeopleDataEntry[] = [
  // ── Keys and credentials, on this device ──────────────────────────────────────────────────────────────────────────
  {
    id: 'signingKey', name: 'The person\'s signing key (Nostr)', subject: 'person', holder: 'device',
    what: 'The secret key that signs as the person, made the first time they sign (never by an automatic path), and the notice that one was made. Locked with a passphrase when the person chooses (D-KL), it is kept sealed (NIP-49) beside its public key instead, and opened in memory for one visit. When Starcom Uplink holds the key instead, only its public key is kept here.',
    seenBy: 'any script running on starcom.app (the content security policy is enforced) while the key is unlocked; the person, who can back it up',
    kept: CLEAR,
    files: ['src/services/nostrService.ts', 'src/services/identity/identityNotice.ts', 'src/services/identity/keyLock.ts'],
    finding: 'Unless the person locks it, the secret key sits in localStorage as text, and the app says so when it makes one ("stored unencrypted in this browser only"). The notice offers the passphrase lock, selected, and "Your key" offers it at any time (D-KL): locked, a copied profile or someone else at the computer cannot sign as the person. It protects the key only at rest: the page must open it to sign, so a script running on the page while it is open can use it. Starcom signs through a NIP-07 signing extension or Starcom Uplink when one is installed, which keeps the key out of the page.',
  },
  {
    id: 'cryptoKeys', name: 'Post-quantum and signing key material', subject: 'person', holder: 'device',
    what: 'ML-KEM-768 key pairs, X3DH prekey secrets, the ML-DSA-65 manifest-signing key pair, its secret sealed to the person\'s own Nostr key once they have one (D-KL, KL7), and the keys that open encrypted case material (IndexedDB); a transitional Ed25519 pair (localStorage); a per-tab secret for encrypting stored values (sessionStorage); every ML-DSA key this browser has published under.',
    seenBy: 'any script running on starcom.app',
    kept: `${CLEAR}; the per-tab secret ends with the tab`,
    files: [
      'src/services/crypto/PQCKeyStore.ts', 'src/services/crypto/PrekeyBundleStore.ts', 'src/services/crypto/ManifestSigningKeyStore.ts',
      'src/services/crypto/ClassifiedDataKeyStore.ts', 'src/services/crypto/CryptoService.ts', 'src/security/storage/SecureStorageManager.ts',
      'src/services/intel/findings/ownPublishingKeys.ts',
    ],
    finding: 'The Ed25519 private key is kept in localStorage as text.',
  },
  {
    id: 'rlshContactKey', name: 'An RLSH card\'s contact key and the person\'s card', subject: 'person', holder: 'device',
    what: 'The key a person\'s RLSH card is signed by, made for the card alone and never their own key; their draft card and what became of it (published, to how many relays, or withdrawn).',
    seenBy: 'any script running on starcom.app',
    kept: `${CLEAR}; the key stays when a card is withdrawn, unless the person throws it away`,
    files: ['src/services/rlsh/contactKey.ts', 'src/services/rlsh/myCard.ts'],
  },
  {
    id: 'providerKeys', name: 'The person\'s own keys for providers', subject: 'person', holder: 'device',
    what: 'API credentials the person enters for keyed providers, and their cloud translation key (Microsoft Azure or Google Cloud).',
    seenBy: 'any script running on starcom.app; each key is sent only to the provider it is for',
    kept: CLEAR,
    files: ['src/shared/config/userCredentialStore.ts', 'src/services/translation/cloudTranslator.ts'],
  },

  // ── Who the person is, on this device ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ageAnswer', name: 'The age answer', subject: 'person', holder: 'device',
    what: 'One of four age brackets and how it was given, locked once given.',
    seenBy: 'this browser only: never posted, never put on a relay',
    kept: CLEAR,
    files: ['src/services/identity/ageAnswer.ts'],
  },
  {
    id: 'namesAndLabels', name: 'Callsign, names for keys, AI-agent marks', subject: 'both', holder: 'device',
    what: 'The callsign the person publishes under, and when they were asked what to call them; the names this person gave other keys, or learned from rosters and cases; which keys say of themselves that they are AI agents.',
    seenBy: 'this browser only; the callsign is published with what the person publishes',
    kept: CLEAR,
    files: ['src/services/identity/callsign.ts', 'src/services/identity/names.ts', 'src/services/identity/agentKeys.ts', 'src/components/Identity/OwnNameRoot.tsx'],
  },

  // ── The person's work, on this device ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'casework', name: 'Cases, reports and the analyst\'s boards', subject: 'both', holder: 'device',
    what: 'Cases and reports, their entities and aliases (people\'s names among them), attention decisions, the Intel Analyzer\'s boards, saved views and layouts, IntelWeb\'s choices, export drafts, legacy team and investigation stores. Confidential and higher material is encrypted at rest.',
    seenBy: 'this browser only, until the person publishes or shares something',
    kept: CLEAR,
    files: [
      'src/services/intel/IntelWorkspaceManager.ts', 'src/core/intel/storage/indexedDBAdapter.ts', 'src/services/intel/migration/investigationsToCases.ts',
      'src/services/RealTimeTeamService.ts', 'src/services/intel/attention/AttentionStateStore.ts', 'src/services/intel/attention/useAttentionQueue.ts',
      'src/services/intel/entity/EntityAliasRegistry.ts', 'src/applications/intelanalyzer/state/BoardsContext.tsx',
      'src/applications/intelanalyzer/state/CorrelationContext.tsx', 'src/applications/intelanalyzer/views/GraphView/positionsStorage.ts',
      'src/applications/intelanalyzer/views/GraphView/viewStorage.ts', 'src/applications/intelanalyzer/panels/components/ExportDraftDialog.tsx',
      'src/applications/intelweb/IntelWebApplication.tsx', 'src/applications/intelweb/components/Graph/GraphControls.tsx',
      'src/applications/intelweb/components/Graph/IntelGraph.tsx', 'src/applications/marketexchange/components/ComposerWizard.tsx',
    ],
    finding: 'Cases can name third parties. The register of what a case may hold, and for how long, belongs to the dossier.',
  },
  {
    id: 'publishing', name: 'What waits to be published, and what was', subject: 'person', holder: 'device',
    what: 'The outbox of findings not yet sent; the reports and their withdrawals, the settlements and challenges of reports on their missions, their inbox list, and their Mission Packages, that no relay took yet, kept as signed with the relays they go to (W1, W1b, W1c); the ledger of findings this browser asserted in public; the reports it published, with where and when (D-RP); the moment the person was told they are the publisher.',
    seenBy: 'this browser only',
    kept: CLEAR,
    files: ['src/services/intel/outbox/OutboxStore.ts', 'src/services/intel/outbox/EventOutbox.ts', 'src/services/intel/findings/PublishedFindingsLedger.ts', 'src/services/intel/publishedReports.ts', 'src/services/intel/findings/publisherConsent.ts'],
  },
  {
    id: 'received', name: 'What others sent the person, and what they took on', subject: 'both', holder: 'device',
    what: 'Reports sealed to the person on missions they published; bundles sent to them; everything sealed to them; the asks and missions they took on, and the capability chains that let them.',
    seenBy: 'this browser only (the sealed notes themselves rest on relays, readable only by the person)',
    kept: CLEAR,
    files: [
      'src/services/intel/received/receivedReports.ts', 'src/services/intel/bundles/bundleInbox.ts', 'src/services/nostr/sealedInbox.ts',
      'src/services/intel/received/takenAsks.ts', 'src/services/intel/received/takenMissions.ts', 'src/services/intel/capability/missionCapabilityStore.ts',
    ],
  },
  {
    id: 'chat', name: 'Chat', subject: 'both', holder: 'device',
    what: 'Known channels, the chat activity log, unsent messages, the history of chats sealed to people, what is unread, and which keys here have used chat.',
    seenBy: 'this browser only (messages travel sealed or on the team\'s relays: see the relay entries)',
    kept: CLEAR,
    files: [
      'src/services/ChatChannelStore.ts', 'src/services/ChatActivityLogStore.ts', 'src/lib/chat/OfflineQueue.ts', 'src/lib/chat/types/ChatAdapterTypes.ts',
      'src/services/chat/sealedChat.ts', 'src/services/chat/chatUnread.ts', 'src/services/chat/chatUse.ts',
    ],
  },
  {
    id: 'reconAndEvidence', name: 'NetRunner looks and Uplink captures', subject: 'others', holder: 'device',
    what: 'The last look at each target (domain, address, certificate and archive records), kept to compare the next look; the web pages and selections captured with Starcom Uplink, the case open in its side panel and how many captures wait. NetRunner\'s scripts are barred from clearing storage.',
    seenBy: 'this browser only, until the person files or publishes them',
    kept: CLEAR,
    files: [
      'src/services/intel/recon/reconSnapshotStore.ts', 'src/applications/netrunner/scripts/engine/ScriptExecutionEngine.ts',
      'src/extension/evidenceStore.ts', 'src/extension/openCase.ts', 'src/extension/takeCaptures.ts', 'src/extension/useUplinkInboxCount.ts',
    ],
    finding: 'Targets and captures are about other people and organisations. A retention limit, and a rule on what may be captured, are not set.',
  },
  {
    id: 'psiCalls', name: 'Psi calls and the person\'s Psi Watch choices', subject: 'person', holder: 'device',
    what: 'A sealed call\'s exact text and salt until it is revealed, or for good when it is kept private; the Timestream\'s lanes, marks, looks and event set; the ψ field\'s looks; the kit switch.',
    seenBy: 'this browser only (the call\'s fingerprint, and its reveal if chosen, go to the relay the person picks)',
    kept: CLEAR,
    files: [
      'src/services/psiWatch/calls.ts', 'src/services/psiWatch/timestream/echoes.ts', 'src/services/psiWatch/timestream/eventSetChoice.ts',
      'src/services/psiWatch/psiField/psiFieldLooks.ts', 'src/services/psiWatch/psiKitSwitch.ts',
      'src/components/PsiWatch/Timestream/LaneManager.tsx', 'src/components/PsiWatch/Timestream/TimestreamDrawer.tsx',
    ],
  },
  {
    id: 'roster', name: 'The roster on the device', subject: 'both', holder: 'device',
    what: 'Roster items the person is making, before they publish them; whom they follow; their quest progress; their adventures.',
    seenBy: 'this browser only, until published',
    kept: CLEAR,
    files: ['src/services/roster/rosterDrafts.ts', 'src/services/roster/follows.ts', 'src/services/roster/questProgress.ts', 'src/services/roster/adventure.ts'],
  },
  {
    id: 'placesAndViews', name: 'Places watched, bookmarks and stories', subject: 'person', holder: 'device',
    what: 'Watchlists (places and circles round them), saved globe bookmarks, stories (views with captions; a story\'s link carries it whole, so nothing is published), the command palette\'s recent results (their ids, never what was typed).',
    seenBy: 'this browser only',
    kept: CLEAR,
    files: ['src/features/watch/watchlist.ts', 'src/services/globe/GlobeBookmarkService.ts', 'src/features/story/story.ts', 'src/features/palette/palette.ts'],
    finding: 'Watched places can say where a person lives or works. They never leave the device.',
  },
  {
    id: 'relaysJoined', name: 'The relays the person joined', subject: 'person', holder: 'device',
    what: 'Team and private relays the person joined, and their addresses.',
    seenBy: 'this browser only',
    kept: CLEAR,
    files: ['src/services/nostr/joinedRelays.ts'],
  },

  // ── Diagnostics and use, on this device ───────────────────────────────────────────────────────────────────────────
  {
    id: 'diagnostics', name: 'Error logs, log level and feature flags', subject: 'person', holder: 'device',
    what: 'The last errors with the browser\'s user agent; the log level; feature flags and the debug panel\'s settings; storage helpers that read and write them; generated WebAssembly glue that can reach localStorage.',
    seenBy: 'this browser only: no logger sends anything, and nothing in the app uses sendBeacon',
    kept: CLEAR,
    files: [
      'src/utils/errorLogger.ts', 'src/utils/logger.ts', 'src/utils/featureFlags.ts', 'src/components/Debug/DebugControlPanel.tsx',
      'src/utils/consoleErrorResolver.ts', 'src/utils/safeErrorHandling.ts', 'src/wasm/wasm_mini_server.js',
    ],
  },
  {
    id: 'useProfile', name: 'The support prompt and the adaptive interface', subject: 'person', holder: 'device',
    what: 'A random id for the support prompt\'s experiments, made on the first visit, and when the prompt was shown, snoozed or dismissed; the adaptive interface\'s state (role, experience level, hours).',
    seenBy: 'this browser only: the support prompt\'s events go to the browser\'s debug log and nowhere else',
    kept: CLEAR,
    files: ['src/services/supportFunnelExperiments.ts', 'src/hooks/useSupportFunnelState.ts', 'src/services/adaptiveInterfaceService.ts'],
    finding: 'No analytics, advertising or tracking. The random id is kept though nothing reads it off the device; it could be dropped.',
  },

  // ── Preferences and copies of public data, on this device ─────────────────────────────────────────────────────────
  {
    id: 'preferences', name: 'Screen and globe preferences', subject: 'none', holder: 'device',
    what: 'Language, sound, the time cursor and range, layers and their choices, overlays, zones, spheres, organisations, the solar system\'s scale, the top bar, the coach and the first-visit hint, quake pings, what in War & Conflict is new to this browser, the kit\'s sample switch.',
    seenBy: 'this browser only',
    kept: CLEAR,
    files: [
      'src/i18n/app/i18n.ts', 'src/services/audio/soundSettings.ts', 'src/context/TemporalContext.tsx', 'src/features/globe/timebar/timebarRange.ts',
      'src/features/globe/timebar/playClock.ts', 'src/features/globe/rail/layerChoices.ts', 'src/context/VisualizationOverlayContext.tsx',
      'src/features/globe/zones/zonesStore.ts', 'src/features/globe/spheres/spheresStore.ts', 'src/features/globe/organisations/organisationsStore.ts',
      'src/solar-system/solarScale.ts', 'src/components/HUD/Bars/CyberCommandTopBar/useTopBarPreferences.ts', 'src/components/Coach/coachOpen.ts',
      'src/components/HUD/NewUserHint/NewUserHint.tsx', 'src/services/quakes/quakePings.ts', 'src/services/warConflict/warConflictSeen.ts',
      'src/services/globe/warConflictOverlay.ts', 'src/services/rlsh/recurrence/rlshKit.ts', 'src/utils/settingsStorage.ts',
    ],
  },
  {
    id: 'publicCaches', name: 'Copies of public data', subject: 'none', holder: 'device',
    what: 'The last downloads of CelesTrak, GFS, MITRE ATT&CK, the submarine cables and ecological history, and query caches, kept to spare the sources and load faster. An in-browser IPFS node\'s store, when one is started.',
    seenBy: 'this browser only',
    kept: `${CLEAR}; each cache also expires on its own`,
    files: [
      'src/services/data-management/providers/CelesTrakCacheStore.ts', 'src/services/weather/gfs/gfsCacheStore.ts',
      'src/services/threat-intel/MitreAttackCacheStore.ts', 'src/services/comm-hubs/SubmarineCableCacheStore.ts',
      'src/services/history/EcoHistoryStore.ts', 'src/core/intel/hooks/useQueryCache.ts', 'src/core/intel/storage/cacheManager.ts',
      'src/core/intel/storage/performanceOptimizationManager.ts', 'src/services/IPFSService.ts',
    ],
  },

  {
    id: 'clearDevice', name: 'Clearing this device', subject: 'person', holder: 'device',
    what: 'Settings > This device removes everything above from this browser after one confirmation: both storages, every IndexedDB database, the service worker\'s caches and the worker. A browser that cannot list its databases is told to finish with its own clearing.',
    seenBy: 'the person, who asks for it',
    kept: 'nothing is kept; what was published stays on the relays, and a key Starcom Uplink holds stays in Uplink',
    files: ['src/services/device/clearThisDevice.ts', 'src/components/Settings/DeviceSettings.tsx'],
  },

  // ── What leaves the device ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'hosting', name: 'Serving Starcom', subject: 'person', holder: 'hosting',
    what: 'Each request for the app\'s files: the visitor\'s address, user agent and the path asked for.',
    seenBy: 'Vercel, which serves starcom.app, under its own terms; no analytics or tracking package is in the app',
    kept: 'Vercel\'s request logs, for as long as its plan keeps them',
    files: [],
    finding: 'No privacy policy names this yet (the legal review of 17 Oct).',
  },
  {
    id: 'layerProviders', name: 'The providers each layer contacts', subject: 'person', holder: 'provider',
    what: 'The visitor\'s address and user agent, sent to each host a layer or app fetches from: 25 hosts in the census of 11 Nov; on every page, NOAA\'s space weather service and six relays. The referrer policy sends them only starcom.app\'s origin, never the page\'s path.',
    seenBy: 'each provider, under its own terms; every host is named in the source register',
    kept: 'each provider\'s own logs',
    files: ['src/legal/sourceRegister.ts'],
    finding: 'The content security policy lets the browser contact any https: or wss: host; narrowing it to the register\'s hosts would make this enforceable.',
  },
  {
    id: 'relayReads', name: 'Reading relays', subject: 'person', holder: 'relays',
    what: 'The visitor\'s address and what they ask each relay for. On a relay that asks for it, the person\'s public key (NIP-42).',
    seenBy: 'each relay\'s operator: The Record and five public relays on every page',
    kept: 'each relay\'s own logs',
    files: ['src/services/nostr/publishTargets.ts'],
  },
  {
    id: 'published', name: 'What the person publishes', subject: 'both', holder: 'relays',
    what: 'Notes signed by the person\'s key, sent only when they choose to publish. The kinds are listed in kindRegistry.ts and beside the code that signs them; among them long-form reports (30023: a report published from its panel carries its title, summary, text, topics, sources and citations, and its place no finer than the precision it was given), Mission Packages (30079), findings and refutations (30082, 30083), capabilities (30081), roster items (30084), team state and announcements (30090, 30091), comments (1111), labels (1985), post-quantum prekeys (30078), the inbox relay list (10050), a psi call\'s fingerprint and its reveal. Each says where it goes before it is sent.',
    seenBy: 'anyone, on public relays; the team, on a team\'s own relay',
    kept: 'as long as each relay keeps it. An RLSH card (a NIP-09 deletion) and a published report (a NIP-09 deletion, and a notice in its place) can be withdrawn from the app, and a relay need not honour either. A report published again replaces its earlier version on relays that keep the newest.',
    files: ['src/services/nostr/publishTargets.ts', 'src/services/nostr/kindRegistry.ts', 'src/services/intel/reportNote.ts', 'src/services/roster/rosterItem.ts', 'src/services/psiWatch/calls.ts'],
    finding: 'Before a public note is sent, the app says it "cannot be recalled". Only an RLSH card and a published report can be withdrawn from the app. Published notes can name third parties.',
  },
  {
    id: 'sealed', name: 'What the person seals to others', subject: 'both', holder: 'relays',
    what: 'Chats, bundles and mission reports sealed to their recipients (NIP-59 gift wraps, 1059; reports 1912 inside them).',
    seenBy: 'the recipients alone can read them; the relays see the wrap, its recipient and its time',
    kept: 'as long as each relay keeps it',
    files: ['src/services/chat/sealedChat.ts', 'src/services/nostr/sealedInbox.ts', 'src/services/intel/received/receivedReports.ts'],
  },
  {
    id: 'rlshCard', name: 'An RLSH card', subject: 'person', holder: 'relays',
    what: 'The card a person publishes to join the RLSH list, signed by its own contact key, after the age step; never a place finer than a city.',
    seenBy: 'anyone',
    kept: 'until the person withdraws it (a NIP-09 deletion) and the relays honour that',
    files: ['src/services/rlsh/myCard.ts', 'src/services/rlsh/contactKey.ts'],
  },
  {
    id: 'forms', name: 'The survey and registration forms', subject: 'person', holder: 'provider',
    what: 'What a person types into the two forms the support prompt links to, a survey and a registration, which open on Formbricks in a new tab. Starcom sends nothing to them itself.',
    seenBy: 'Formbricks (app.formbricks.com), which runs the forms, and the owner, for whom it keeps the answers',
    kept: 'in the owner\'s Formbricks account until the owner deletes them; a person may ask for theirs to be deleted',
    files: ['src/components/SupportDrive/SupportFunnelRoot.tsx'],
  },
  {
    id: 'onRequest', name: 'Lookups and translations the person asks for', subject: 'both', holder: 'provider',
    what: 'NetRunner\'s keyless lookups send the target asked about to RDAP, DNS-over-HTTPS, crt.sh or the Wayback Machine; cloud translation sends the Public text asked for to Microsoft or Google, on the person\'s key; a keyed provider gets the person\'s key and query; publishing through the Exchange starts an in-browser IPFS node, whose peers see the visitor\'s address, and what it stores is public to anyone with its address.',
    seenBy: 'each provider, under its own terms',
    kept: 'each provider\'s own logs',
    files: ['src/services/translation/cloudTranslator.ts', 'src/services/IPFSService.ts'],
  },
];
