# Nostr event kinds Starcom uses

Generated from `src/services/nostr/kindRegistry.ts` by `scripts/kinds-table.ts`; do not edit by hand.
`npm run guards` fails when this table and the registry disagree.

For the kinds Starcom specifies, the wire format is in [`starcom-navcom-interchange.spec.md`](starcom-navcom-interchange.spec.md)
and [`nip-draft-attested-claims.md`](nip-draft-attested-claims.md). Retention follows NIP-01: kinds 0 and 3, and
10000–19999, replaceable; 20000–29999 ephemeral; 30000–39999 addressable (replaced by kind, author and `d` tag);
the rest regular.
"Dormant" means the code holds it but no screen reaches it.

| Kind | Name | Retention | Group | Starcom publishes | Starcom reads | Signed, never sent | Dormant |
|---|---|---|---|---|---|---|---|
| `0` | Profile metadata (NIP-01) | replaceable | From a NIP or another app |  | The profile of a key that signed a mission or a note, for its name. |  |  |
| `1` | Text note (NIP-01) | regular | From a NIP or another app |  | Globe intel notes tagged starcom_intel; replies to Mission Packages; the notes a NavCom operator cites. | Invite codes, in the link that carries them. |  |
| `4` | Encrypted direct message (NIP-04) | regular | From a NIP or another app |  |  |  | Only the older chat adapter handles it, and chat no longer chooses that adapter (22 Nov 2026, audit finding 13). Direct messages are sealed (NIP-59) instead. |
| `5` | Deletion request (NIP-09) | regular | From a NIP or another app | The deletion of a report its author withdrew (D-RP, RP7), and of a withdrawn RLSH card. | Deletions of RLSH cards. |  |  |
| `13` | Seal (NIP-59) | regular | Specified by Starcom | Inside a gift wrap only. | Opened inside gift wraps addressed to this key. |  |  |
| `40` | Public channel creation (NIP-28) | regular | From a NIP or another app |  |  |  | Only the older chat adapter, which chat no longer chooses, and service methods nothing calls (audit finding 13). |
| `41` | Public channel metadata (NIP-28) | regular | From a NIP or another app |  |  |  | Only the older chat adapter, which chat no longer chooses (audit finding 13). |
| `42` | Public channel message (NIP-28) | regular | From a NIP or another app |  | Messages others published in a public channel the person opens, shown as not encrypted. Starcom sends none: a channel message cannot be sealed, so the chat window refuses it (audit finding 13, 22 Nov 2026). |  |  |
| `43` | Hidden channel message (NIP-28) | regular | From a NIP or another app |  |  |  | A service method nothing calls (audit finding 13). |
| `44` | Muted channel user (NIP-28) | regular | From a NIP or another app |  |  |  | A service method nothing calls (audit finding 13). |
| `1059` | Gift wrap (NIP-59) | regular | Specified by Starcom | Sealed mission reports, bundle parts, direct and team chat, and sealed roster items, each to its recipients only. | Gift wraps addressed to this key. |  |  |
| `1111` | Comment (NIP-22) | regular | Specified by Starcom | Comments on Mission Packages, claims and reports (plan item 5.1). | Comments on what is shown here, and replies to this key's Mission Packages. |  |  |
| `1911` | Field observation (NavCom) | regular | From a NIP or another app |  | NavCom's observations, which reports cite (D-MX). |  |  |
| `1912` | Mission report (NavCom) | regular | From a NIP or another app | A report on a mission, sealed to its signer (MX28). | Reports sealed to this key on missions it published. |  |  |
| `1985` | Label (NIP-32) | regular | Specified by Starcom | Review verdicts, settlements of mission reports, and steps taken on a team's work. | The same, on what is shown here. |  |  |
| `10050` | Inbox relay list (NIP-17) | replaceable | From a NIP or another app | Where this key receives sealed reports, with a mission that asks for them. | Another key's inbox list, to seal to it. |  |  |
| `10911` | RLSH card (NavCom) | replaceable | From a NIP or another app | The person's RLSH card, signed by its own contact key (D-RF). | RLSH cards, for the RLSH list. |  |  |
| `13534` | Relay member list (NIP-43) | replaceable | Specified by Starcom |  | A team relay's list of members. |  |  |
| `20091` | Team invite | ephemeral (relays keep none) | Starcom app |  |  | A team invitation, carried in its link. |  |
| `20092` | Team access request | ephemeral (relays keep none) | Starcom app |  |  | A request to join a team, carried to its lead. |  |
| `20093` | Record bundle | ephemeral (relays keep none) | Starcom app |  |  | A bundle of records, carried in its file. |  |
| `20094` | Record bundle part | ephemeral (relays keep none) | Starcom app | Inside a gift wrap only. | Opened inside gift wraps addressed to this key. |  |  |
| `20095` | Sealed chat message | ephemeral (relays keep none) | Starcom app | Inside a gift wrap only. | Opened inside gift wraps addressed to this key. |  |  |
| `20096` | Relay probe | ephemeral (relays keep none) | Starcom app | Only to a relay being checked, signed by a key used once. |  |  |  |
| `20097` | Evidence custody record | ephemeral (relays keep none) | Starcom app |  |  | Carried with captured evidence, in its file. |  |
| `20098` | Portfolio attestation | ephemeral (relays keep none) | Starcom app |  |  | Carried in a portfolio's file. |  |
| `22242` | Relay sign-in (NIP-42) | ephemeral (relays keep none) | From a NIP or another app | Sign-in to a team relay or an internal relay the person joined; never stored. |  |  |  |
| `27235` | HTTP authorization (NIP-98) | ephemeral (relays keep none) | Specified by Starcom |  |  | An HTTP header, for a team relay's management calls. |  |
| `28934` | Relay join request (NIP-43) | ephemeral (relays keep none) | Specified by Starcom | A request to join a team relay, with the invite's claim. |  |  |  |
| `30023` | Long-form note (NIP-23) | addressable | Starcom app | People's reports and their withdrawals (D-RP); Psi Watch calls, on a team relay; the Exchange's and NetRunner's announcements. | Globe intel; Mecha Jono's desks (Raver, Hero, AI and Psi Watch, Civil Unrest, War & Conflict, RLSH recurrence, the Exchange's feeds); mission totals. |  |  |
| `30078` | Application data (NIP-78) | addressable | Starcom app | Post-quantum prekey bundles, for sealed chat. | A contact's prekey bundle. |  |  |
| `30079` | Mission Package | addressable | Specified by Starcom | Mission Packages. | Mission Packages from any author, and Mecha Jono's field missions. |  |  |
| `30081` | Dispatch Capability | addressable | Specified by Starcom | A delegated or revoked right to dispatch a mission. | Capability chains, to check a dispatch. |  |  |
| `30082` | Attested Claim | addressable | Specified by Starcom | Findings, with their method. | Findings from any author, weighed by method. |  |  |
| `30083` | Refutation | addressable | Specified by Starcom | Refutations of findings. | Refutations of findings held here. |  |  |
| `30084` | Roster Item | addressable | Specified by Starcom | Roster items: in public, on a team relay, or sealed to invitees. | Public roster items. |  |  |
| `31923` | Calendar event (NIP-52) | addressable | From a NIP or another app |  | The windows of Mecha Jono's Psi Watch and Raver Watch. |  |  |
