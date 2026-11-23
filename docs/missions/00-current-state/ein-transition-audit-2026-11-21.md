# EIN transition audit: Starcom, 21 November 2026

Starcom's side of the audit the agent platform (Mecha Jono, The Record, blackpi) is running before the EIN's
transition to many publishers and many relay nodes. The categories match theirs, so findings pair up. The plan
it serves is "EIN at global scale: the plan, with Starcom as the reference" (20 Nov); gap numbers below are that
plan's. Read from HEAD `f66cc73f`; the raw inventory (every key, kind and relay request, with file and line) was
taken the same day and is summarised here.

Each finding ends in a fix, and each fix in a check that runs on every build or a file Starcom publishes, so the
audit cannot quietly go stale.

## Findings

| # | Area | Finding | Fix | Status |
|---|---|---|---|---|
| 1 | Self-description | The node descriptor (`starcom-node.json`) lists 5 kinds Starcom publishes and 5 it reads. The code publishes about 25 (among them people's reports and their withdrawals, 30023 and 5; labels, 1985; comments, 1111; sealed reports and chat, 1059; the inbox list, 10050; RLSH cards, 10911; public channel messages, 40 to 44) and reads about 25 (among them the globe's notes, 1 and 30023; NavCom's observations, 1911; calendar windows, 31923). | Gap 1: build the descriptor's lists from the kind registry | Fixed in this audit |
| 2 | Self-description | The kind registry calls itself "every Nostr event kind this application uses". It lacks 0, 5, 40 to 44, 1911, 1912, 10050, 10911, 22242 and 31923, and holds three kinds nothing uses (30000, 30090, 30091). | Gap 2: complete it, say for each kind whether Starcom publishes it, reads it, or both, and check every kind number in the code against it | Fixed in this audit |
| 3 | Self-description | The descriptor's generator says operator-published claims go to The Record and the public relays alike. Claims minted on the command line (`scripts/claim.mjs`) go to all six; those published from the browser go to the 5 public relays only. The published list of six relays to listen to was right; the reason given for it was not. | Say which claims go where | Fixed in this audit |
| 4 | Keys and trust | 22 source files depend on Mecha Jono's key records written in code (`MECHA_JONO_KEYS`, `EXPOSED_KEYS`, `KEY_STARTS`, five `*_PUBLISHERS` lists); the relay pool applies them to every read. Psi Watch and RLSH recurrence hold a second copy of the new key (`PSI_SIGNER`). | Gap 3: trust lists and key records as data; then signed lists from curators | First step done 21 Nov: every publisher key, start, exposure and layer is in `src/config/publishers.json`, published as `/.well-known/starcom-publishers.json`; a test fails on a 64-hex key written in the code. Signed lists from other curators wait on the owner's decision 4 |
| 5 | Keys and trust | Comments give five dates for Mecha Jono's key change (7 Oct letter, 18 Oct, 2 Nov, 9 Nov, "early November"). Nothing on The Record is signed with the new key yet (read 20 Nov), so `KEY_STARTS` rightly has no entry for it, and Psi Watch and RLSH recurrence show only the bundled kit notes. | The key switch (handoff task 1); then one line in `KEY_STARTS`, and the comments made to agree | Waiting on the agent platform; the start date now goes into `publishers.json`, not the code |
| 6 | Keys and trust | The ML-DSA-65 key that signs Mission Packages and findings is kept unencrypted in the browser's IndexedDB (`ManifestSigningKeyStore.ts`, `secretKey: number[]`). The passphrase lock (D-KL) covers only the Nostr key. | Seal it to the person's Nostr key, so the same lock covers it | Fixed 21 Nov: sealed to the person's own Nostr key (D-KL, KL7) |
| 7 | Keys and trust | The Record's relay information names Mecha Jono's exposed first key as its `pubkey`, and The Record's 4,654 kind 30023 notes are all signed by it (the agent platform's answer, 21 Nov). | Handoff task 1 | Waiting on the agent platform |
| 8 | Keys and trust | The node descriptor says "there is no register of legitimate operators and there will not be one" (refusal R-1). The owner wants a list of registered Starcom relay nodes. | Word the node directory as a description of infrastructure that confers no standing on anyone's claims; propose it as an EIN standard | Open |
| 9 | Reading | The globe reads the newest 200 notes of the past year from 6 fixed relays (`NostrStarcomIntelIngest.ts`); twelve readers (Raver, Hero, AI and Psi Watch, Civil Unrest, War & Conflict, RLSH recurrence, and five Exchange and desk feeds) ask The Record for everything Mecha Jono's keys published under their topic, with no time window. | Gap 5: read by Zone and time; bounded storage | Open: plan Phase 2 |
| 10 | Reading | A sealed roster item (30084 inside 1059) is sent (`sendSealedRoster`) but the sealed inbox routes only bundle parts, chat and mission reports: nobody receives it. | Route it, or stop sending it | Open |
| 11 | Wire formats | Reports carry no event time, and the reader reads none from prose notes. | Gap 7 | Open |
| 12 | Wire formats | `publishPQCPublicKey` has no caller; a mission's root capability grant is minted but never published. | Remove, or publish and specify | Open |
| 13 | People's data | The plain-text path for public channel messages (kind 42, `NostrChatAdapter` to `nostrService.sendMessage`) is still in the code. No screen the intern walk checks reaches it (direct and team messages are sealed since plan item 2.7), but nothing proves it unreachable. | Remove it, or a guard that no screen reaches it; then answer legal question E1 | Fixed 22 Nov. It was reachable: the chat window sent any non-direct channel message, team replies included, in plain text, and chat fell back to the plain adapter when the sealed one did not connect. Team replies now go sealed, other channel messages are refused, chat chooses only a provider that seals, and E1 is answered |
| 14 | Security | npm audit: the 10 accepted risks of 20 Nov (`dependency-risks.md`), none new. | None | Holds |
| 15 | Security | Starcom Uplink signs any kind a page sends; only some kinds sign without asking (`signerRules.ts`). | Check the no-prompt list against finding 2's registry | Open |
| 16 | Desktop | 0.2.0 carried the web app of 1 Oct (729 commits back) on Electron 44.1.1, with seven Electron advisories, one high. | 0.2.1: the app of 20 Nov on Electron 44.11.5, smoke 51/51 | Built 21 Nov; waiting to be uploaded |
| 17 | Desktop | The desktop's operator-confirmation gate is designed, not built: a compromised app window can ask its signer to sign a well-formed object unseen (`desktop/docs/security/browsing-key-boundary.md`). | Build the gate before the desktop signs anything for the network | Open |
| 18 | Desktop | It runs no relay. | D-DR stage 1, a personal relay (decision record `desktop-relay.md`) | Proposed; scoped in `04-plan/relay-capability-work.md` |
| 19 | Keys and trust | Found by the browser check of finding 6's fix: the unlock prompt (D-KL) was a panel outside any dialog, so over the mission dialog that dialog's focus trap took every keystroke. A person with a locked key could not publish a Mission Package. | The prompt is an MUI Dialog of its own, stacked above whatever is open; walk story S34 publishes with a locked key | Fixed 21 Nov |
| 20 | Reading | Found by the live relay check of 22 Nov (below): relay.wellorder.net, one of the five public relays reports go to, answered 503 to everyone, on HTTPS and WebSocket alike. Reports still reached three of the other four. | Watch it for a week; replace it, by measurement, if it stays down | Open |
| 21 | Wire formats | Found by the live check: nostr.mom, after a deletion by address, says "took" to every later event at that address and keeps none. A report withdrawn there stays withdrawn, as meant, but its notice is not kept, and a version published again after a withdrawal never appears there, though the app is told it was taken. NIP-09 deletes only versions up to the deletion's own time; primal and nos.lol do so. | Decide RP7's deletion: by address (as now, so older copies go too) or by the published event's id only (so the address is never closed); and tell nostr.mom's operator | Open |
| 22 | Wire formats | Found by the live check: a person's inbox list was sent to The Record too, which takes only its allowlist and refuses that kind from anyone ("blocked: kind 10050 not accepted on this relay"), so the review named a destination no list could reach. | Inbox lists go where they are read, except The Record (`inboxListTargets`) | Fixed 22 Nov |
| 23 | Wire formats | Found by the live check: relay.damus.io turns away clients that do not present themselves as a browser (HTTP 503), so the command-line scripts that publish from Node (`scripts/claim.mjs`) do not reach it; people in the app do. | Say so where those scripts count the relays that took a claim | Open |

## The live relay check, 22 November

A brand-new key sent each relay what Starcom sends: a report note, the same note again, notes signed an hour, a day,
a week and a month earlier and sent only now (as the outbox sends what it kept, W1), a label, an inbox list, and a
withdrawal (a deletion by address, then a notice a second later). Each was read back, then deleted. A test tag
replaced `starcom_intel`, so no globe showed them.

| Relay | New key | Sent late (up to 30 days) | Replaced | Withdrawal | Published again after it |
|---|---|---|---|---|---|
| relay.primal.net | took all | took | yes | notice kept | kept |
| nos.lol | took all | took | yes | notice kept | kept |
| nostr.mom | took all | took | yes | report gone; notice not kept | not kept (finding 21) |
| relay.damus.io | not checked from the command line (finding 23) | | | | |
| relay.wellorder.net | down (finding 20) | | | | |
| The Record | refused: "pubkey not on EIN allowlist for this relay"; kinds 5 and 10050 refused from anyone | | | | |

No relay asked for proof of work, payment or a sign-in from a new key. What the outbox keeps is accepted when it is
sent late, so keeping a note exactly as signed (W1) holds. The Record refuses deletions (kind 5) from anyone,
Mecha Jono included, and its relay information does not say that its writes are restricted
(`limitation.restricted_writes`); both go to the agent platform.

## What pairs with the agent platform's audit

| Here | There |
|---|---|
| Findings 4, 5, 7 | The key switch, its start date, the write list |
| Finding 8 | What a registered relay node promises (handoff task 4) |
| Finding 9 | The Record's 500-a-filter limit; the archive route (handoff task 5) |
| Finding 1 | The Record's and blackpi's own relay information |
| Finding 13 | Whether Mecha Jono reads or writes public channel messages |
| Live check | The Record refuses kind 5 from anyone, so Mecha Jono cannot withdraw a note there by deletion; its relay information could say that writes are restricted |
