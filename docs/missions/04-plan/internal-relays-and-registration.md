# Internal relays and registration

Written 2026-09-26 for decisions D1, D2 and D4 in
[`intern-readiness-decisions.md`](intern-readiness-decisions.md). Interns will
use the live app, share work as signed bundles over the internal private
relays, and need accounts so their keys can be added to those relays.

## What is true today

- **The Record** (`wss://record.cosmiccodex.app`) is reached through a
  Cloudflare tunnel (`scripts/smoke-ein.mjs:5-9`).
  - Writes are allowlisted to the operator's key only (`scripts/claim.mjs:65-67`).
  - It advertises NIP-42 AUTH and leaves reads open (`smoke-ein.mjs:84-132`).
  - The docs place "the internal Nostr relay" on the Jetson
    (`docs/ecosystem.md:147-150`).
- **No repository records** which relay software runs the internal relay, how
  the allowlist is stored or edited, or whether NIP-86 relay management is
  available. Only the operator knows.
- **The Record runs strfry** 1.1.1, by its own description (NIP-11), read on
  2026-09-28. `npm run relay:check -- wss://record.cosmiccodex.app` found it
  never asks who is signing in, although it lists NIP-42, and serves its
  reads to anyone; it refused the check's probe for its kind. That is right
  for a public archive, and is why it is not a team relay. If the internal
  relay runs strfry too, it cannot keep reads to members (see the comparison
  below), which is D1's case for the Pi 4 relay.
- **`ai-security-relaynode` is not that relay and cannot become it.**
  - It stores any valid event without checking auth
    (`nostr_relay.rs:261-294`).
  - Its JWT login guards only an HTTP API that Starcom already retired.
- **Starcom's browser code never answers an AUTH challenge.** Only the command
  line does, in `claim.mjs:132-150`.
- **A hosted relay counts as public.** "Private" means a local-network address
  only (`publishTargets.ts:142-161`).
- **The identity panel's one Copy button copies the secret key (nsec)**
  (`IdentityNoticeRoot.tsx:54-58`, `98-99`), and nothing copies the public key. An intern
  asked to "send your key" for registration would send the secret one.
- **A pattern worth reusing** in `intake-archangel-agency`: an admin's request
  is signed with their Nostr key (NIP-98) and checked against a reviewer
  allowlist (`src/lib/reviewer.ts:7-27`). Its security notes say to stage
  access and "revoke access on the last day" (`docs/PROGRAM-SECURITY.md:166-203`).

## Rules the design must keep

- **R-1:** Starcom "will not gate anything on a credential"
  (`public/.well-known/ein-refusals.json`).
- **No register of legitimate operators.** Starcom publishes none
  (`publish-node-descriptor.mjs:139-140`).
- **No server, relay or account of Starcom's own**
  (`public/.well-known/security-policy.md:13`).

So an intern allowlist is **the relay operator's access control**. It never
appears in anything Starcom publishes, and the app works without it. Only the
internal relay needs it.

## The internal relay

What it needs, whichever machine it runs on:

- **A separate instance from The Record,** so training and team traffic never
  mixes with the real archive.
- **AUTH for reads as well as writes.** An internal relay with open reads is not
  private.
- **An allowlist of keys,** so only registered people can read or write.
- **A real certificate through the tunnel.** Browsers on the HTTPS site will
  connect only to `wss://` with a trusted certificate.
- **A retention and wipe policy** for the end of a cohort.

**The tunnel changes the wording.** Cloudflare ends the encrypted connection at
its edge, so traffic to the internal relay passes through Cloudflare as plain
text unless the content itself is encrypted. The app must not say "nothing
leaves your network" for it. It uses three honest words:

- **Public:** anyone can read it.
- **Internal:** a relay with access control, reached over the internet.
- **Local:** this network only.

## What changes in Starcom

1. **An `INTERNAL_RELAYS` set** in `publicInfrastructure.ts`, kept out of the
   federation and Navcom sets. Otherwise `nostr.json`, `starcom-node.json` and
   the spec check would publish its address.
2. **Declared, not guessed.** `isPrivateRelayUrl` treats declared internal
   relays as not public. The destination wording is shared, in the three words
   above, replacing the copies in `MissionsPanel.tsx:970-976` and
   `FindingsPanel.tsx:106-108`.
3. **NIP-42 AUTH** is answered on publish and on subscribe, with the same signer
   that signs packages (`NostrIdentityService.asSigner`).
4. **Distribution picks the relays** (decision D2: asked every time):
   - Public goes to the public relays.
   - Limited goes to the internal relays.
   - Private stays in the workspace.

   Bundles (D1) go to the internal relays, encrypted to their recipients.
5. **Reads:** mission-package and reply ingest also read the internal relays.
   Globe intel stays on public relays.
6. **Identity:**
   - a "Copy public key" button;
   - the secret key's copy is labelled "Copy SECRET key — never share";
   - one key per person, whether or not a signer extension is installed (plan
     item 2.2).

## Registration: three ways

| | How it works | Relay side | Starcom side | Trade-off |
|---|---|---|---|---|
| **A. Send your public key** | The intern copies their npub and sends it with their intake reference. An admin adds it and later removes it. | Edit the allowlist and reload | Copy npub; the internal relay set; AUTH | Simple and manual. For 6–24 people a cohort, that is fine. |
| **B. Request access in the app** | "Request access" sends a signed request (NIP-98) carrying the intake reference. An admin approves it with their own signature, and the key is added. | An endpoint the operator runs; NIP-86 `allowpubkey`, or a helper that edits the allowlist | The request screen, plus A's parts | Less manual work. Needs a small service on the operator's side, because Starcom runs none. |
| **C. Names on cosmiccodex.app** | NIP-05 names published at `cosmiccodex.app/.well-known/nostr.json`, with the allowlist synced from them | A sync job | Show the names | Publishes a list of interns' keys, against R-1, the no-roster rule and the cohort's security notes. **Not recommended.** |

**Decided 2026-09-26: B, request access in the app.** On a relay that supports
access requests (NIP-43), the app sends the request itself and needs no service
of Starcom's own. Otherwise an admin approves from Starcom through remote
allowlisting (NIP-86, signed with NIP-98). Every key is revoked on the cohort's
last day.

## Relay software, compared

Researched 2026-09-26 from each project's source, releases and container
registries. Commit counts are for the last twelve months.

| Relay | Latest release | Activity | ARM64 | Private reads | Checks the signed-in key | NIP-86 | NIP-43 | NIP-29 groups |
|---|---|---|---|---|---|---|---|---|
| **zooid** (Go, MIT) | v0.2.5, 2026-09-25 | 177 commits, mostly one author | image | by default | reads yes; writes must come from the signed-in key, except gift wraps | yes, including claims | yes, current spec | full |
| **pyramid** (Go) | v1.4.2, 2026-09-20 | 560 commits | binary and image | internal sub-relay only | no: checks the author | yes | older flow | yes |
| **haven** (Go, MIT) | v1.2.2, 2026-02-28 | 106 commits | binaries | yes | yes | yes | no | no |
| **strfry** (C++, GPL) | 1.1.3, 2026-09-04 | 253 commits | image | listed kinds only | through a write plugin | no | no | no |
| **chorus** (Rust) | v2.0.2, 2026-04 | 9 commits | build it | no | writes only | yes | no | no |
| **nostr-rs-relay** (Rust) | 0.10.0, 2026-05 | 12 commits | amd64 only | DMs only | author | no | no | no |
| **khatru** (a Go library) | — | active | compile | whatever you write | whatever you write | handlers | you write it | you write it |

**Recommendation: zooid.** It is the only relay that combines member-only reads
by default, remote membership management and claims (NIP-86, signed with NIP-98),
the current access-request spec (NIP-43) and full team groups (NIP-29), with an
ARM64 image. It is multi-tenant, many relays behind one install, which suits
hosting relays for other organisations. Its author also wrote NIP-43, and it
pairs with the Flotilla client.

**If zooid is chosen** (a recommendation, not a decision: the operator
questions at the end come first, and D1 says to use the relays already
running), before interns use it:
1. Patch two functions in `zooid/instance.go`:
   - `AllowRecipientEvent` accepts a gift wrap (kind 1059) from anyone if it
     tags a member; it should accept one only from a signed-in member;
   - `CanReceive` lets every member read every gift wrap; it should serve each
     one only to the keys it tags, as NIP-17 recommends.

   Offer both patches upstream.
2. Pin the image by digest: four tags were published on 2026-09-25 alone.
3. Mint one claim per intern, and delete it once they have joined. Claims are
   reusable and never expire on their own.
4. Mirror the repository and the image. zooid is young, first tagged on
   2026-09-02, and effectively has one maintainer, as do most of the
   alternatives.

**Runner-up:** haven, which keeps reads for members and checks the signed-in
key, but has no groups or access requests, and was built for one person.
**If neither fits,** khatru builds exactly the policy wanted.

## What Cloudflare can see

- **The tunnel carries relay traffic, with conditions.** Cloudflare says "Cloudflare
  Tunnel has full support for Websockets". It closes connections that stay idle,
  so the relay's 30-second pings (and nostr-tools' `enablePing`) must stay on.
  Cloudflare's own restarts drop connections, so clients must reconnect and
  sign in again.
- **Cloudflare can read the metadata.** TLS ends at Cloudflare, which describes
  itself as needing to "decrypt, inspect, and re-encrypt traffic". It sees every
  event's keys, kinds, tags, times and sizes, and the sign-in events that link a
  member's key to their IP address. It does **not** see the text inside
  Starcom's post-quantum envelopes, which chat now produces.
- **Sealed is not unlinked.** Direct messages, team messages and bundles travel
  as gift wraps. Cloudflare sees each wrap's recipient (its `p` tag), size and
  time, and, because Starcom sends over a connection it has signed in on, which
  member sent it. So it can learn who writes to whom and when, but not what.
- **Limited is not sealed.** Work shared as Limited goes to the internal relay as
  ordinary events, so Cloudflare can read it, as can reviews and comments.
  Limited means "only people on this relay may read it", not "nobody in
  between can". Private stays on the machine.
- **Whoever runs the relay's machine** holds everything the relay holds, and
  every backup of it.
- **The alternative:** where the metadata matters, Tailscale Funnel ends TLS on
  your own machine, but only under `*.ts.net` names.

## Any team's own relay

Secure team chat should not be an Archangel-only feature, and the protocol does
not make it one. **Starcom should work with any team's relay.** Archangel
Agency's is simply the first.

**How other clients do it:** Flotilla treats each group as a relay. Its invite
link is `/join?r=<relay>&c=<claim>[&h=<group>]`. Admins mint claims remotely,
and joining sends a signed request.

**What Starcom needs to build:**
1. **A team-relay record and a signed invite link.** The link carries:
   - the relay's address;
   - a claim;
   - the relay's own key;
   - the team.

   It uses Flotilla's `r` and `c` parameters, so links work in both apps.
2. **A join wizard.**
   - Check the relay's self-description (NIP-11): it must support sign-in (42)
     and access requests (43).
   - Sign in.
   - Send the join request with the claim.
   - Confirm membership from the relay's own signed member list.
3. **Sign-in plumbing.** Today Starcom opens 11 relay pools with no options, and
   answers no sign-in challenge, so a private relay would refuse everything it
   sends. Upgrade nostr-tools: 2.17 adds reconnection, and 2.19 adds automatic
   per-relay sign-in. Starcom then:
   - signs in only to relays the person has joined, since signing in reveals
     who they are;
   - signs in again after every reconnect;
   - turns pings on.
4. **An admin panel** for relays that support remote management: allow, remove
   and ban members, and issue and revoke claims.
5. **A relay conformance check,** so Starcom trusts a team's relay only when it
   keeps reads and writes to its members, whoever runs it.

*A kit for other organisations to run relays was proposed here, and never
decided: the owner chose "Any team's relay", meaning Starcom works with
relays other people run. One was built on 2026-09-28 and removed the same day.*

## Questions for the operator

1. Which relay software runs the internal relay on the Jetson? Can it require
   AUTH before serving reads, and does it support NIP-86?
2. Where is its allowlist kept, and how is it reloaded?
3. Will interns use the existing internal relay, or a new instance beside it?

**Answered 2026-09-28** by Mecha Jono's development session on the Jetson, in
reply to a handoff page (claude.ai/artifact/2nAxVePH6nW3C2YX3RWU7N; reply at
claude.ai/artifact/JHDjEVT4FY3sFWjdRwbYR4):

- **The cohort's relay exists:** `wss://crew.cosmiccodex.app`, "Starcom Crew",
  zooid v0.2.5 (revision `91c386e`), set up 2026-09-26 for the internship and
  empty. Its own key (NIP-11 `self`), which signs its member list and which
  invites carry: `552ddf86eda51b965cdc9628521382980ba7501260197338536cc1f5fbb46a38`.
  All six of Starcom's checks hold, run with `relay:check` on the Jetson.
- **Membership:** the member list (kind 13534) lives in zooid's store and
  changes at once. NIP-86 at `https://crew.cosmiccodex.app`, and NIP-43 with
  claims. A join request without a claim is refused and nothing is queued, so
  "Request access" works as Starcom builds it: the signed request goes to an
  admin, who allows the key with `allowpubkey`.
- **Gift wraps:** zooid v0.2.5 takes a wrap from anyone if it tags a member,
  and serves every wrap to every member: the two faults above. The Jetson can
  build patched v0.2.5; whether to is the owner's decision. The two patches
  written on 2026-09-28 (in git history at `9f8f1ba3`, `relay-kit/zooid/patches/`)
  apply to `91c386e` and pass zooid's tests there.
- **Limits:** no rate limits; a message is capped at 512,000 bytes; khatru pings
  every 30 s and drops a client silent for 60 s. Nightly backups for 14 days, on
  the same machine. One machine on one home connection.
- **The Room** (`wss://room.cosmiccodex.app`) is strfry, the EIN's node relay:
  reads open, so not for a team. **The Pi 4 relay** is not known on the Jetson.
- **Decided the same day** (R1–R4 in `intern-readiness-decisions.md`): Jono's
  personal npub owns crew; Jono and Mecha Jono administer it; zooid runs with
  the two patches, offered upstream; access off on 2027-02-22, wipe on
  2027-03-24.
- **Before interns use crew:** (a) the owner sends the npub that should own it;
  until then its owner is its own key. (b) The cohort's admins' npubs, each given
  the membership methods. (c) The owner decides on the gift-wrap patches. (d)
  Admins mint one claim per intern and delete it once used. (e) The wipe on
  2027-02-22: intern keys, claims, data and backups.
