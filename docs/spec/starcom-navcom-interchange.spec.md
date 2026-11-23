# Starcom ↔ Navcom Interchange — Spec

> **See also [`nip-draft-attested-claims.md`](nip-draft-attested-claims.md)** —
> the generalised, protocol-level form of the Finding format below, written as a
> NIP for implementers with no connection to this project. Where this document
> describes what Starcom does, the NIP describes what anyone could do. They are
> intended to stay compatible; if they drift, the NIP is the one strangers will
> read, and this one should follow it.

> **Added in rev 20 (2026-11-20).** A globe-intel `30023` note is withdrawn by a newer version at the same
> address tagged `["t", "retracted"]`: a Starcom reader takes its report off the globe, its lists and its storage,
> and shows nothing for the withdrawal. A person's report published from Starcom goes out as a plain `30023` note
> carrying its own text, at `d` = the report's id, and is withdrawn this way, a NIP-09 deletion request a second
> before. "Replacement" below, under "Withdrawal".

> **Added in rev 19 (2026-10-23).** A Starcom reader refuses a Mission Package whose content is over 131,072 bytes,
> The Record's own limit, or any of whose lists holds over 1,000 entries, before reading its manifest. That is the
> security re-audit of 23 October 2026. "How big a package a reader takes" is below. The observation conformance
> vectors now describe NavCom's real form, which Starcom's reader has taken since 6 October; until now they still
> showed the earlier draft.

> **Added in rev 18 (2026-10-23).** A Mission Package may say which Causes and Initiatives it works toward, by
> `["a", "30084:<pubkey>:<d>", "<relay>", "toward"]` tags as roster items carry them, and a cause counts it as work
> toward it. Decision D-RS RS59, in `docs/missions/01-architecture-decisions/roster.md`. The shape is in "A
> package toward a cause" below. A package made in Starcom may ask for counts at `metadata.format.effect`, a field of
> no one's name, read after Mecha Jono's own; its publisher posts a NIP-17 inbox list (kind 10050) and settles or
> challenges the reports sealed to it with NavCom's labels (MX32; "Reports to a publisher in Starcom" below). A reader
> showing another app's Story holds back what names or places people (RS58); that changes nothing on the wire.

> **Added in rev 17 (2026-10-18).** Tasks together: a team working a mission takes, releases, does and checks
> its steps by NIP-32 labels in `starcom.step`, on the team's own relay only. Decisions D-RS RS55–RS57, in
> `docs/missions/01-architecture-decisions/roster.md`. The shape is in "Tasks together" below. Nothing about a
> step is ever posted to a public relay.

> **Added in rev 16 (2026-10-18).** The roster's last four kinds have their screens and their tags.
> Decisions D-RS RS51–RS54, in `docs/missions/01-architecture-decisions/roster.md`. Additive: a reader
> of rev 14 keeps every item it kept before.
>
> - **Initiative:** `["first_step", …]` and `["for", …]` beside its `purpose`, the problem; and
>   `["a", "<coordinate>", "<relay or ''>", "grew_into"]`, the campaign or epic its author started from
>   it. Others join it by posting work `toward` it.
> - **Cause:** no tags of its own. It counts the work `toward` it, and how many publishers that work
>   comes from. Following one is kept on the reader's device and never posted, so no list of who follows
>   it exists.
> - **Saga:** its `counts` links are the stories its author chose; stories `toward` it are listed after
>   them, marked as told toward it.
> - **Story:** never names or places people. Starcom's review refuses one carrying a key, a handle, an
>   email address, a phone number, map coordinates or a street address, saying which line.

> **Added in rev 15 (2026-10-18).** Starcom's sealed reports take NavCom's form (its mission
> interchange rev 6, §5.0–§5.2). Decision D-MX MX28, in
> `docs/missions/01-architecture-decisions/mission-interchange.md`. The shape is in "Reporting back,
> sealed" below.
>
> - **Kind `1912`, NavCom's report.** It answers rev 13's question, which NavCom's rev 4–6 had answered
>   first. The content is exactly NavCom's: the callsign, the day, each count on the package's own effect
>   line, verbatim.
> - **A salt.** Every sealed report carries 32 random lowercase hex characters in its content. Without
>   one, the id inside the seal is a hash of things anyone can guess, and a `settled` label naming it
>   would name its author too.
> - **The recipient's inbox, nowhere else.** A report goes only to the relays the recipient's NIP-17
>   kind `10050` list names. It never goes to The Record, and never to a public relay the recipient did
>   not name. A recipient that names none is sent nothing.
> - **Effect lines only.** A publisher drops any count whose line it does not carry as an effect, so
>   Starcom no longer asks counts on performance lines.
> - **An Adventure's return** takes the same form, with `seen` beside the counts.

> **Added in rev 14 (2026-10-17).** The roster: one addressable kind, `30084` Roster Item,
> for every larger kind of work, from a Cause to a Saga. Decisions D-RS RS1–RS19, in
> `docs/missions/01-architecture-decisions/roster.md`. The shape is in "Roster Item — `30084`"
> below.
>
> - **Kinds, never instances.** Starcom defines what a Directive, an Epic or an Adventure is;
>   people and Mecha Jono make every one. Starcom publishes none of its own.
> - **One shape.** A title, a purpose, limits, a window, places, and links up and down, the
>   kind of work in a `roster` tag. Each kind's own tags come with its screens.
> - **Links two ways.** A `toward` link says this work is toward that, and anyone may add it;
>   a `counts` link says its author counts that as part of this.
> - **Where it goes is who sees it.** Public, sealed to invitees by NIP-59, or to a team's own
>   relay. Kept on its author's device until they post it.

> **Added in rev 13 (2026-10-16).** Starcom sends its first reply: a report
> on a Mission Package, sealed to the package's signer. Decisions D-MF
> MF11–MF14, in `docs/missions/01-architecture-decisions/missions-first-visit.md`.
> The shape is in "Reporting back, sealed" below.
>
> - **A report is a reply, sealed.** A kind `1` rumor with the package's `a`
>   coordinate, sealed to its signer by NIP-59. Nobody else can open it, and a
>   relay learns neither who sent it nor what it says.
> - **Counts only.** One number for each count the package names, and the day.
>   No place, no people, no photos, no time of day.
> - **It claims nothing.** No label, no public post. NavCom's `claimed` label
>   is unchanged and Starcom does not send one.
> - **Asked of NavCom:** whether the rumor should be kind `1912`, NavCom's
>   reserved report kind, rather than kind `1`. Starcom will send that if so.

> **Added in rev 12 (2026-10-12).** Evidence captured in a person's browser now
> backs claims. Decisions D-EX EX23–EX24, in
> `docs/missions/01-architecture-decisions/browser-extension.md`.
>
> - **Evidence fingerprints.** A Finding's `method.inputFingerprints` may hold an
>   evidence file's fingerprint: the full SHA-256 of the file's bytes, 64
>   lowercase hex characters, beside the 16-byte observation fingerprints (32
>   hex). A peer holding the same file hashes it and compares. The two kinds
>   cannot match each other by accident. Built: Starcom's case positions carry
>   them, from cases marked open.
> - **Timestamp proofs.** An optional `method.inputTimestamps` maps an evidence
>   fingerprint to an OpenTimestamps proof of it (base64 of a detached `.ots`
>   file). That proves the evidence existed by a moment, to anyone with an
>   OpenTimestamps client, without the file. Proposed: built once agreed.
> - **Weight is unchanged.** Neither field is a weight input. A consumer that
>   does not read `inputTimestamps` ignores it.

> **Added in rev 11 (2026-10-06).** Answers to NavCom's Mission Interchange,
> its rev 1 and rev 2
> ([NavCom's side](https://raw.githubusercontent.com/Jthora/navcom-app/main/docs/spec/mission-interchange.spec.md)).
> The decisions are D-MX, in
> `docs/missions/01-architecture-decisions/mission-interchange.md`.
>
> - **Who publishes.** A person publishes, using Starcom or NavCom as their
>   client, and the signer is responsible for what they sign. A package's
>   `author` now names its signer, by the callsign they choose to publish or
>   by their key, and never anyone else; the client is named in a NIP-89
>   `client` tag. Where older text below says "Starcom publishes", read it
>   as "a person publishes through Starcom".
> - **The package profile** gains `claims`, `mission_state`, `valid_until`,
>   `jurisdiction`, `agent` and `client`, and a package counts things, never
>   people. The manifest signs the same values as `profile`.
> - **The manifest vectors are regenerated.** They had not changed since
>   2026-09-01 and no longer matched what Starcom emits: they still showed
>   `classification`, no asks and `"Starcom"` as author. They now show the
>   profile, a callsign as author and the asks, and three cover the profile,
>   two of them refused. `manifest-objectives-never-cross` is renamed
>   `manifest-objective-position-masked`: since rev 5 an objective crosses as
>   an ask, with any position in it masked.
> - **The return path** gains NIP-32 labels in the `navcom.mission`
>   namespace, published to NavCom's relays; Starcom will read them there.
> - **Citations** of NavCom's kind-`1911` observations, in the tags of the
>   event that publishes a report or package.
> - **Relays:** what each one is. None is authoritative for every kind.
> - **Standing:** NavCom's kinds of standing, from the same events by the
>   same rules; never a total, a rank or a ratio.
>
> Each part says whether it is built. Standing is the part not built yet.

> **Added in rev 10 (2026-09-25).** A `geo_precision` tag, read on intake: how
> precisely the position was placed, as a word (`county`) or a distance
> (`500m`, `12km`). A geohash states its own precision in its length and is read
> that way when it is where the position came from. Starcom draws a coarse
> report with the area it could be in, and a card featuring it says so. See
> "How precisely it was placed".
>
> **Added in rev 9 (2026-09-23).** **The encoding of `pubkey` and `sig` is
> finally stated** — hex or base64 on read, told apart by decoded byte count;
> lowercase hex on write; canonicalise to hex wherever a pubkey is used as an
> identity. A peer asked this after rev 6, rev 7 and rev 8 while it blocked
> their first Mission Package, and they were right that it was silent on both
> sides: Starcom's verifier called `hexToBytes` on their base64 and returned
> `false`, so a genuine package read as a forgery with nothing logged anywhere.
> Fixed in code, not only written down. Also in rev 9: `done` is the publisher's
> view and never the claimant's; `for` keeps its name at the peer's request; and
> NIP-34's status quartet is recorded as prior art for an ask's status being its
> own signed event.

> **Added in rev 8 (2026-09-23).** A `t=scratch-verification` marker for test
> traffic, in the Globe intel section. Starcom refuses it, counts it, and never
> draws it. It is proposed as shared vocabulary rather than a local convention,
> because a node with no way to mark its own fixtures cannot rehearse against a
> live network without polluting it for everyone reading the same relays. The
> section states plainly what it cost to learn: three of ours are on the public
> relays permanently and cannot be retracted by anyone.

> **Added in rev 7 (2026-09-23).** An "Offers, asks and audiences" section —
> a proposal, implemented by nobody yet, for telling a claim from a request for
> work from an offer. It records why NIP-99's `kind:30402` is the wrong home for
> reward-bearing work (its `price` tag is required), and proposes that the market
> channel be an AUDIENCE rather than a price. Written down because both nodes are
> holding their routing vocabulary still, each waiting on the other.

> **Revised in rev 6 (2026-09-21).** The Globe intel section now says what this
> node does with an event that has no position — it keeps it — where it had said,
> falsely since 2026-09-20, that such an event is refused and appears nowhere. It
> also gains a section on replacement: kind `30023` is addressable, so a republish
> at the same `d` replaces the earlier version instead of standing beside it. Both
> were raised by a peer building against this document.

> **Added in rev 5 (2026-09-21).** `objectives` on the Mission Package manifest,
> and a "Replying to a Mission Package" section. Both close gaps a peer reported
> on 2026-09-20: the asks inside a package never actually crossed the wire, and
> there was no return path defined anywhere, so a peer wanting to answer a
> package was guessing at a convention. Both omissions were ours.

> **Added in rev 4 (2026-09-20).** A "Globe intel" section, for kinds `1` and
> `30023`. Every earlier revision described only what Starcom PUBLISHES and never
> what it READS onto its globe, so a peer with geolocated work had nothing to
> implement against and guessed — publishing on kind `30079` tagged
> `t=starcom_intel`, which reaches neither surface. The omission was ours.

Normative for the two event kinds under "Mission Package" and "Finding" — both are
implemented, tested, and broadcasting today. "Globe intel" describes the read side,
and is equally implemented: it is what the running globe subscribes to. The third section, "Pattern ingest (draft)",
is a proposal only; see its own note.

This is Starcom's half of a conversation that has to happen with whoever is building
`navcom-app` before any of it is a real interop spec rather than one side's assumption. It
exists so that conversation starts from an accurate description of working code, not from
memory or from `docs/ecosystem.md`'s prose (which is the narrative companion to this
document, not a substitute for it — see that file's own note on which one wins if they
disagree).

## Relay surface

> **Rewritten in rev 11.** What each relay is, as it describes itself. None is
> authoritative for every kind of event: a reader reads every relay it can.

| Relay | What it is | Who writes | What it carries here |
|---|---|---|---|
| **The Record**, `wss://record.cosmiccodex.app` | Mecha Jono's archive. Its NIP-11 document: *"EIN open-read, allowlist-write archive. Kind-scoped -- everything here is meant to be public and permanent. Operated by Mecha Jono."* | Its allowlist only | Mecha Jono's packages, intel and settlement labels. It honours NIP-40 expiry |
| **blackpi**, `wss://blackpi.cosmiccodex.app` | A read-only mirror of The Record: it streams The Record live, syncs it in full every 10 minutes, and keeps no reader's address. Its NIP-11 name is *"The Record (mirror)"* | Nobody: it refuses every write | Whatever The Record holds. Starcom reads it only when The Record does not answer, since 6 October 2026 |
| **The five public relays**, below | Public relays | Anyone | What people publish through Starcom: packages, findings, intel |
| **NavCom's relays**: `wss://relay.damus.io` and `wss://nos.lol` today | Two of the five, chosen by NavCom | Anyone | Operators' claims, reports, witness and challenge labels (NavCom's §5.0) |
| **Team relays** | Private: reading and writing both need sign-in | Their allowlist | Planned for team work (`docs/missions/04-plan/internal-relays-and-registration.md`); nothing in this interchange |

```
wss://relay.primal.net
wss://nostr.mom
wss://relay.wellorder.net
wss://relay.damus.io
wss://nos.lol
```

Configurable per instance; these are defaults, not a hardcoded requirement on
either side. Starcom reads The Record and the five, and The Record's mirror
in its place when The Record does not answer. What people publish through
Starcom goes to the five; The Record accepts only its allowlist, and its
mirror nothing.

## Event kinds

| Kind | Range | Name | Content |
|---|---|---|---|
| `30079` | parameterized-replaceable | **Mission Package** | Full `PackageManifest` JSON, plaintext |
| `30081` | parameterized-replaceable | **Dispatch Capability** | Empty; the grant is carried entirely in tags |
| `30082` | parameterized-replaceable | **Finding** | `{ content: FindingContent, signature }` JSON, plaintext |
| `30083` | regular | **Refutation** | `{ content: FindingRefutation, signature }` JSON, plaintext |
| `30084` | parameterized-replaceable | **Roster Item** | Text for people; the item is carried in tags — rev 14 |
| `1912` | regular | **Report** (NavCom's) | `{ callsign, date, counts: [{ line, n }], salt }` JSON; sent only sealed, never published — rev 15 |
| `1`, `30023` | regular, parameterized-replaceable | **Globe intel** | A GeoJSON payload, or prose carrying a geo tag — see below |

Both kinds sit in Nostr's `30000`–`39999` parameterized-replaceable range, which is a
**global namespace shared with every Nostr app that exists**, not a private Starcom/Navcom
allocation. `30079` and `30082` were picked to avoid the numbers this codebase already knew
about at the time (`30023` NIP-23 long-form, `30078` NIP-78 app data), not because the range
around them is reserved. **The actual collision-avoidance mechanism is the event's `d` tag,
not the kind number** — two unrelated apps can legally use the same kind as long as their
`d`-tag values never collide, and two events from the same app with the same kind and `d`
tag are the same replaceable slot by design. Any third party adopting this spec needs to be
told that explicitly, not left to infer it from source comments — which is exactly what was
happening before this document existed (`MissionPackageBroadcastService.ts`'s comment on
`30079` says this; nothing said it anywhere a non-Starcom reader would see it).

## Globe intel — `1` and `30023`

**This section exists because its absence had a consequence.** Everything above
describes what Starcom PUBLISHES to Navcom. Nothing described what Starcom READS
onto its globe, so a peer with geolocated work and no way to learn this shape
guessed: a real integration partner published open cases on kind `30079` tagged
`t=starcom_intel`, which is our Mission Package kind carrying our intel hashtag.
Both filters excluded it and nothing they published ever reached the globe.

### The filter

```
kinds: [1, 30023]
tags:  ["t", "starcom_intel"]        # also accepted: starcom-intel, starcomintel
```

Kind `30079` is NOT read onto the globe. It is the Mission Package kind, and its
subscription narrows on `t=starcom_mission_package` — see above. Tagging
`t=starcom_intel` onto a `30079` event reaches neither surface.

### Test traffic — `t=scratch-verification`

Added in rev 8. A publisher marks its own fixtures:

```
["t", "scratch-verification"]     this event is test material; do not ingest it
```

Starcom refuses any event carrying this tag, counts it as `droppedScratch`, and
never draws it. **A node that cannot mark its own test traffic has no way to
rehearse against a live network without polluting it for everyone else reading
the same relays** — so this is offered as shared vocabulary, not a Starcom
convention.

The rule is the TAG alone. Never the title, never a placeholder-looking digest,
never the word "test" in the content: a read path that silently drops real intel
because of how it is worded is a worse failure than a fixture on a globe.

**This exists because of three events of ours that cannot be taken back.** On
2026-08-06 cross-node verification runs published three `30023` events tagged
this way — "Backbone-Activation Cross-Node Verification &lt;timestamp&gt;",
carrying `QmScratchVerificationCidPlaceholder…`, a CID that resolves to nothing,
placed at Washington DC because that is what the scratch script hardcoded. They
are on `nostr.mom` and `nos.lol` and they are permanent: NIP-09 deletion and
addressable replacement both require a signature from the publishing key, and an
audit on 2026-09-23 found the three carry three DIFFERENT pubkeys, one minted
per run by scratch scripts that were never committed and no longer exist. Nobody
holds those secrets. Nobody can retract them.

Until 2026-09-23 they were three of the seven pins a first-time visitor saw on
Starcom's own globe. Refusing them at the read side is the only remedy that was
ever available, which is the argument for the tag: the alternative to marking
test traffic is not "no litter", it is litter nobody can identify or remove.

Publishers are asked to route test traffic to a private relay first — Starcom's
own `publishTargets.ts` exists for exactly that — and to use this tag as the
second line of defence, for the case where something reaches the public surface
anyway. Which it will.

### Where the position comes from

Any ONE of these. The first that parses wins.

```
content: a GeoJSON object or FeatureCollection    # Point, LineString, Polygon
tags:    ["geo", "lat:38.9072,lon:-77.0369"]      # lat/latitude, lon/lng/longitude
tags:    ["g", "<geohash>"]                       # decoded to the cell centre
```

The `geo` tag's separators are permissive — `,` `;` `:` `=` and whitespace all
parse — and `lat`/`latitude` and `lon`/`lng`/`longitude` are all accepted.

### How precisely it was placed — added in rev 10

```
tags: ["geo_precision", "county"]     # a kind of place
tags: ["geo_precision", "12km"]       # or a distance: metres, or km
```

Words, as the radius Starcom reads them: `exact` 10 m, `address` 30 m,
`street` 100 m, `block` 250 m, `neighbourhood`/`neighborhood` 2 km,
`district` 5 km, `town`/`city` 10 km, `county` 30 km, `metro` 50 km,
`region` 150 km, `state`/`province` 250 km, `country` 1000 km. An unknown word
is not guessed at: the report carries no precision, which is read as unknown,
never as exact.

When the position came from a `g` geohash and no `geo_precision` is given, the
precision is half the diagonal of the geohash cell. A geohash is never used for a
position stated some other way.

What Starcom does with it: a report placed to 2 km or coarser is drawn with the
area it could be in, at its true size on the surface; a share card featuring it
states the precision in words; and the share handle rounds a position to the
decimal places the precision supports (a whole degree from 50 km up) and never to
more than one.

If an address is someone's home, `geo_precision` is how to say "this is only the
county" without moving the point somewhere untrue.

### An event with no position

**Kept.** Corrected in rev 6: this section said an event with the hashtag and no
position was "refused before parsing… not stored and does not appear anywhere",
and that stopped being true on 2026-09-20. The rule was ours, and our reply to a
peer's intake spec already said so — this document was the last place still
claiming otherwise, which is the worst place for it, because it is the one
people build against.

Three cases, told apart on the report so a reader can see which it is:

```
a coordinate (or a shape)   drawn at that point                  geometry:<how it was reduced>
["jurisdiction", "<code>"]  drawn as that territory's outline    geometry:jurisdiction
neither                     kept and listed, never drawn         geometry:none
```

- **Jurisdiction.** The tag is read exactly as named, lowercased and otherwise
  untouched — never remapped onto a vocabulary of ours. Any number may be given.
  A country-level code (`us`, `fr`) is drawn as that country's boundary. A
  sub-national code (`us-tx`, `us-tx-leander`) matches no boundary here — this
  node holds 242 countries — and is **not** widened to its country, because that
  would claim more than was said. It is listed and readable, and the globe says
  by name which codes it could not draw.
- **No place at all.** Kept, stored, and shown in the report lists (IntelDashboard,
  IntelAnalyzer, IntelWeb), which never required a coordinate. It is never drawn,
  because inventing a point would put it somewhere nobody said anything happened.
  It is described as naming no place — the publisher's silence, not a lookup this
  node failed.
- **Content beginning with `{` or `[`** is treated as a geo payload. Plain-text
  content should not start with either.

An event that CLAIMS a position this node cannot parse — a malformed `geo` tag,
GeoJSON with no readable feature — is still refused and counted, and the globe
reports it as having "an unreadable position". That is a defect in what arrived,
not a category of intel.

### Replacement — kind `30023` is addressable

Added in rev 6. Kinds `30000`–`39999` are identified by `(kind, pubkey, d)`, not
by event id, as NIP-01 defines. So a `30023` republished at the same `d` —
to close a thread, or to retract it — **replaces** the earlier version. It does
not arrive beside it.

```
address          <kind>:<pubkey>:<d>       a missing d is the empty string
newer wins       by created_at
on a tie         the lower event id is kept
stale arrivals   dropped, and counted — relays answer independently
kind 1           never replaced, whatever tags it carries
```

The pubkey is part of the address, so no one can replace another author's note
by choosing the same `d`. A retraction does not need to repeat the claim it
withdraws: once a newer version is seen, the older one is no longer shown,
whether or not this node can read what replaced it.

This was reported by a peer whose notes did exactly this and arrived as
duplicates — the withdrawn version stayed on screen beside its own retraction.
Deduplication had been on the raw event id.

#### Withdrawal — added in rev 20

A newer version at the same address carrying `["t", "retracted"]` withdraws the
note. A Starcom reader takes its report off the globe, out of every list and out
of storage, a copy saved in an earlier session included, and draws or lists
nothing for the withdrawal itself. Only the publisher's own `t` tag counts, never
`#retracted` in the text, and only on an addressable kind: a kind `1` note cannot
be withdrawn this way. Without the tag, a newer version is a report like any
other, and replaces the older one on screen.

The withdrawal need not keep `starcom_intel`: a Starcom reader asks every relay
it reads for `kinds: [30023], #t: ["retracted"]` over the same window as the
reports, from any author. It can only take away what its own address held, and
the address carries its author's key.

A report a person publishes from Starcom is withdrawn with two events:

```
kind 5       ["a", "30023:<pubkey>:<d>"], ["e", <last version's id>], ["k", "30023"]      at T
kind 30023   ["d", <d>], ["title", "Withdrawn"], ["t", "starcom_intel"], ["t", "retracted"] at T + 1 s
content      "Withdrawn by its author."   (both)
```

The deletion request goes first. A NIP-09 deletion by address removes every
version up to its own time, so a notice signed earlier would go with it, and a
reader that had saved the report would never learn to drop it. Neither event
repeats the report's title, text, place or topics. A relay that keeps only the
newest version holds the notice in the report's place; a relay that honours the
request holds nothing; a copy already taken stays where it was taken.

### What a line or a polygon becomes

Both are accepted. A report is placed at ONE coordinate — a polygon's centroid,
a line's halfway point, falling back to the first vertex where the centroid lies
outside the shape or the shape crosses the antimeridian — and the report records
which of those was used. The shape is also kept, as a **bounded outline**: at
most 64 vertices, rounded to five decimal places, carrying both the original
vertex count and the kept count. The globe draws that outline and says how many
of its shapes are simplified.

So a publisher gets a pin where the shape is, an outline of the shape, and a
statement that the outline is not the geometry they sent. A 2000-vertex polygon
is accepted; it is drawn with 64 of those vertices.

### Limits, stated rather than discovered

```
maxFeaturesPerCollection   50      # per event, on the parser
maxVerticesPerPolygon      2000
maxEventVertexTotal        5000
```

Content is stored truncated to 8000 characters. A report with no readable time
is placed by when it was written, and says so; one with no readable time at all
is not placed on the timeline (decision D-E).

## Mission Package — `30079`

```
kind: 30079
tags: [ ["d", "starcom_mission_package_<manifest.id>"],
        ["t", "starcom_mission_package"],
        ["t", "navcom_handoff"] ]
content: JSON.stringify(manifest)   // PackageManifest, see below
```

> **Added in rev 11: the package profile NavCom reads.** Beside the two `t`
> tags above, a package MAY carry these, each as NavCom's spec defines it:
>
> | Tag | Value | Means |
> |---|---|---|
> | `["t", "navcom_mission"]` | | Field work: NavCom draws it on its map |
> | `["mission_state", …]` | `open`, `closed`, `claimed` | Whether anybody is behind it. `claimed` only with `claims: one`. Keep it true: close what can no longer be settled |
> | `["claims", …]` | `one`, `many` | A task one person takes, or a campaign anybody joins. Absent means `many` |
> | `["valid_until", …]` | unix seconds | When it stops applying. Required on field work |
> | `["jurisdiction", …]` | e.g. `us-ca` | Where it applies |
> | `["agent", <name>]` | e.g. `mecha_jono` | Posted by an agent. It says who posted; it limits nothing |
> | `["client", "Starcom"]` | NIP-89 | The client used. Never the author |
>
> **Count things, never people.** A package's asks and what it reports count
> materiel and public-record places, never people: a count of people at a
> place is the location of the people served.
>
> **A region, never a point.** `jurisdiction` names a country (`us`) or a
> state as ISO 3166-2 writes it (`us-ca`, `au-nsw`), lower case, chosen by the
> publisher. Nothing finer: a package published through Starcom never names a
> city (`us-tx-leander`), and a receiver refuses a signed profile that does.
>
> **The manifest signs the same values.** A package carrying the profile
> carries it twice: as these tags, which are what NavCom reads, and as the
> manifest's `profile` (below), which its ML-DSA signature covers. The tags
> are written from the manifest, and a receiver holds them to it: a package
> whose tags say other than its signed profile is refused
> (`profile-tags-disagree`), so nobody reads one thing and verifies another.
> A package with no `profile` in its manifest, from before rev 11 or from
> another producer, has its tags read as they are.
>
> **Reach.** NavCom's section 3 (read 2026-10-06) reads packages from The
> Record only, signed by Mecha Jono. A person publishing through Starcom
> publishes to the public relays, since The Record accepts only its
> allowlist. Their package carries this profile, and is not on NavCom's map
> until NavCom reads it. Starcom asks NavCom to read `navcom_mission`
> packages from the public relays too, from keys NavCom admits (D-MX, MX15).
>
> **Vectors.** Every manifest vector in `/spec/mission-vectors/` now carries
> the profile, and `expect.tags`, the tags its event carries, in any order.
> `manifest-profile-field-work` is field work. A vector with `expect.refused`
> is one a conforming builder never emits: refuse it, for the cause it names
> (`profile-region-not-a-country-or-state`, `profile-claimed-needs-one`).
>
> **Status:** built. Every package published through Starcom says
> `mission_state: open` and who takes it, as chosen on the mission in the
> Missions app. A mission switched to field work names its region and its
> end, is not marked ready without them, and is never published or sent
> again after that end. A key its holder marks as an agent's adds `agent`,
> naming the package's author.
>
> **Closing.** A dispatched mission is closed as completed or cancelled,
> which offers its closing for review: the same package, at the same
> address, saying `mission_state: closed`. Declined, the mission is closed in
> Starcom and its package still says `open`, and the closing can be published
> later. Deleting a mission whose package is published offers its closing
> first. Only the key that published a package can close it, since a
> closing under any other key would sit beside the package, not replace it.
>
> Starcom's verifier refuses tags that disagree with the signed profile.
> `claimed` waits on reading NavCom's labels.

```ts
interface PackageManifest {
  id: string;
  name: string;
  version: string;              // semver
  description: string;
  visibility?: "public" | "limited" | "private";
  createdAt: string;             // ISO 8601 date-time, with Z or an offset
  author: string;                 // its signer: their callsign, or their key (rev 11; see below)
  license: "CC-BY" | "CC0" | "PROPRIETARY" | "OPEN";
  reports: Array<{ id: string; title: string; checksum: string; path?: string }>;
  intel: Array<{ id: string; title?: string; checksum: string; path?: string }>;
  assets: Array<{ filename: string; checksum: string; size: number }>;
  objectives?: ObjectiveAsk[];    // the work this package asks for — added in rev 5
  profile?: PackageProfile;       // what NavCom reads, as its tags say it — added in rev 11
  metadata: Record<string, unknown> & { signature?: SignatureBlock };
}

interface PackageProfile {        // added in rev 11; each field is one of the tags above
  missionState: "open" | "closed" | "claimed";        // mission_state; claimed only with claims "one"
  claims?: "one" | "many";                            // claims; absent means many
  fieldWork?: { jurisdiction: string;                 // jurisdiction: a country or a state, never finer
                validUntil: number };                 // valid_until, unix seconds; with ["t", "navcom_mission"]
  agent?: string;                                     // agent
}

interface ObjectiveAsk {
  id: string;                     // stable within the package, so ONE ask can be answered
  ask: string;                    // what is being asked for
  handsBack?: string;             // what the doer returns; absent means nobody said
  effortMinutes?: number;         // whole minutes; absent means nobody estimated it
  for?: string;                   // who the work is for; absent means unstated
  limits?: string[];              // what the doer must not do; absent means none stated
  done: boolean;                  // the PUBLISHER's view — see below; never the claimant's
}
```

> **Added in rev 5 (2026-09-21).** `objectives`, and with it the correction of a
> flat statement below that had been wrong since rev 1: "Objective TEXT never
> crosses — only `objectiveCount`". That was true of the wire and false of the
> intent. Starcom rendered each objective — the ask, the expected artifact, the
> effort, the beneficiary, the limits — into a synthesized report's body, and
> `reports` cross only as `{id, title, checksum}`, so every one of them left as
> a 32-bit hash. A Mission Package arrived as a title, a briefing and a number,
> which is not enough for anyone to decide whether they could do the work.
>
> It is fixed rather than merely documented because a package that nobody
> outside can act on is not an interchange format. `objectives` sits beside
> `reports`, not inside one, so the body-content rule does not reach it, and it
> is covered by the manifest's ML-DSA-65 signature — a stronger integrity claim
> than the 32-bit checksum it replaces.
>
> `id` exists so a reply can name a single ask rather than the whole package.
> See "Replying to a Mission Package" below.
>
> **A receiver may ignore it.** It is optional, and a manifest signed before
> rev 5 verifies unchanged: manifestDigest walks the keys it finds.

> **Added in rev 9 (2026-09-23).** Two clarifications, both settled with the
> peer rather than decided alone.
>
> **`done` is the PUBLISHER's view of the ask, and never the claimant's.** It
> lives inside a signed manifest, so only the node that raised the ask can
> change it, and changing it means republishing and re-signing the whole
> package. It therefore cannot express *someone is working on this*, *this was
> withdrawn*, or anything a person who took the work might want to say. It says
> only whether the publisher believes it is finished. Saying so costs nothing
> and closes the gap the peer named: *"silence on that point is how two nodes
> end up disagreeing about whether work is in progress."*
>
> A fuller answer — a status as its own signed event, published by whoever holds
> the status rather than by the node that raised the ask — is recorded under
> "Offers, asks and audiences" below. It is not built.
>
> **`for` keeps its name.** It reads like an audience and carries a beneficiary,
> which is a genuine wart, and the peer was asked whether to rename it. Their
> answer: *"do not. We built a reader against `for` a week ago; renaming it buys
> clarity we can get from a comment and costs a working integration."* A
> correctly named field may be added beside it; `for` will not be removed or
> repurposed. This is the additive rule applied to ourselves.

`metadata.signature` is a second, independent, post-quantum-safe integrity proof over the
manifest — ML-DSA-65 (FIPS 204), signed with this Starcom instance's persisted key (see
"Signing key" below). It does **not** replace, and per NIP-01 cannot replace, the outer
Nostr event's own Schnorr/secp256k1 signature; it proves the manifest payload specifically
wasn't altered after this instance produced it, independent of relay-level trust in the
outer signature.

```ts
type SignatureBlock = { alg: "ml-dsa-65"; pubkey: string; sig: string };
```

`pubkey` and `sig` are **hex or base64** — see "How `pubkey` and `sig` are
encoded" below, which a receiver must read before implementing this block. The
bare `string` here is what blocked a peer for three revisions.

> **Corrected in rev 3 (2026-09-19).** This section documented a required
> `classification: "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET"`.
> The code replaced it with the optional `visibility` above, and this document
> was not updated, so a node building to it would have published a field no
> receiver reads, in a clearance vocabulary Starcom has removed. Receivers still
> ACCEPT a legacy `classification` of any string, so packages from older builds
> validate — do not produce it. Found while answering a peer's questions about
> the package shape; `src/services/exchange/schema.ts` is the reference.

**Redaction guarantee**, enforced in code, not just stated: `reports`/`intel` cross only as
`{id, title, checksum}` — never body content.

> **Changed in rev 11.** `author` names the package's **signer**: the callsign
> they choose to publish, or their key (hex or npub) when they have none.
> Never a legal name, and never anyone else: not collaborators, not
> reviewers, not a name learned inside the client. The application is named
> only in the NIP-89 `client` tag. Receivers MUST accept a callsign or a key
> here.
>
> Until rev 11 the paragraph below was the rule: `author` named the
> publishing node, and a pubkey was refused. That put the client in the
> author's seat while the outer event was always signed by the person. What
> it protected still holds: no collaborator or reviewer identity crosses.
> **Status:** built. A package published through Starcom names its signer:
> the callsign they set with `/callsign`, or their key as an npub. Starcom's
> verifier accepts a callsign or the signer's own key, and refuses a key that
> is not the signer's (`author-not-signer`). Packages published before rev 11
> name `"Starcom"` and are still accepted.

*Before rev 11:* `author` names the **publishing node**, institutionally. Starcom writes
`"Starcom"`; another node writes its own name. What the field must never carry is
an operator identity — a collaborator id, a display name, or a pubkey — because
the whole point is that a package cannot be traced to the analyst who made it.

> **Corrected in rev 2.** This previously read "always the literal string
> `Starcom`", and the conformance runner enforced exactly that — which would have
> required every other node on the network to claim to be Starcom in order to pass.
> The invariant is *institutional, not personal*; it was never *this institution*. Mission collaborators (the team roster) never reach the package at all.
`relatedReports`/`relatedCases` cross only as counts in `metadata`, never as ids or linked
content.

Objective text **does** cross, in `objectives` (rev 5). What still does not, and has no
field to travel in: the internal record an objective rests on (`evidenceRef`) and whoever
here has taken it (`claimedBy`). Both are absent by construction rather than filtered, so
a field added to the internal model later cannot leak by default. `objectiveCount` in
`metadata` remains, and agrees with `objectives.length`.

**Position redaction.** `name`, `description` and the synthesized report content are
masked for coordinate-shaped text before checksumming: degrees-minutes-seconds, and
decimal pairs separated by comma, semicolon, slash, whitespace or a newline, including
`lat:`/`lon:` labelled pairs. A pair is masked only when both numbers are plausible as
latitude and longitude, which is what keeps budgets, percentages, durations and mission
numbers intact. Replaced text becomes the literal `[redacted:position]`.

**Residual gaps, stated rather than implied.** A place NAME still crosses. So do grid
systems that are alphanumeric rather than numeric pairs (MGRS, plus codes) — a long grid
reference may be removed incidentally by the digit-run rule, which is not coverage and
must not be relied on. The person-name mask is a best-effort heuristic that has been
observed to remove a given name and leave the surname. Closing these needs a gazetteer or
an operator-facing preview of exactly what will cross, not a longer regular expression.

## Replying to a Mission Package

A reply is a **kind `1`** event carrying an **`a` tag** whose value is the package's
addressable coordinate:

```
["a", "30079:<publisher pubkey>:starcom_mission_package_<manifest.id>"]
```

Nothing else is required. The `t` tags are not needed, the author need not be known to
the publisher, and the content is free text.

**The coordinate, not the event id.** Kind `30079` is parameterized-replaceable, so its
event id changes every time the package is republished while the package stays the same
thing. An `e` tag would pin one revision and fall off the moment a publisher fixed a typo;
the coordinate survives that, which is what NIP-01 defines addressable events for.

**The `d` tag holds still.** Until 2026-09-21 `manifest.id` was minted from the clock on
every compose, so a coordinate pointed at a slot the publisher would never write to again
— and the replaceable slot was never replaced, leaving every republished package standing
beside its predecessor. `manifest.id` is now the id of the record the package publishes,
stable across republishes.

**Answering one ask.** `objectives[].id` is stable within the package, so a reply may name
a single ask in its content or in a further tag. Starcom does not yet require or interpret
such a tag, and will not invent one unilaterally — if you have a shape in mind, propose it
and this section will carry it.

**What Starcom does with a reply.** It verifies the event signature, checks the `a` tag
names a package this node actually published, and shows it beside the mission. It does not
acknowledge, accept, assign or import: a reply is a statement by its author, not a record
of ours. Nothing is written back to the relay.

**What Starcom sends.** One kind of reply, since rev 13: a report, sealed to the
package's signer. It sends no public reply. See "Reporting back, sealed" below.

> **Added in rev 11: labels, the return path NavCom uses.** NavCom sends
> NIP-32 labels, never kind-`1` replies: a kind-`1` note is a public post every
> client shows, and a claim must be the operator's to make public or not. A
> label is kind `1985` with `["L", "navcom.mission"]`, one
> `["l", <value>, "navcom.mission"]` and the package's `["a", …]` coordinate.
>
> | Label | Signed by | Means |
> |---|---|---|
> | `claimed` | an operator | They are taking part. Public, or sealed to the poster by NIP-59 gift wrap |
> | `settled` | the poster | The report on it is accepted |
> | `witnessed` | anyone who was there | Settles at once |
> | `challenged` | anyone, under their own key | Reverses nothing; both stand, for the reader to weigh |
>
> A report with no `challenged` label after seven days settles itself. A
> report may land after `valid_until`; it counts if its claim came before.
>
> **Where they are.** Operators publish them to NavCom's relays (see "Relay
> surface"), since The Record accepts only its allowlist. Starcom reads them
> there, filtering `#a` for the packages it shows.
>
> **Status:** reading is built. Starcom reads these labels from every relay
> it reads, NavCom's two and The Record among them, and shows the public
> claims beside each package its Missions app shows, one per key, until they
> expire or their key sends `released` (rev 15, after NavCom's rev 4). Where a
> package carries its publisher's `["taking_part", "<operators>", "<agents>"]`,
> that count leads, since only the publisher sees private claims. A field
> package that breaks NavCom's §4.3 (no `objectives`; ids empty, holding
> whitespace or shared; a `d` tag holding whitespace; an `effect` line over
> 200 characters; a `valid_until` past 2100) is refused with its reason, as
> NavCom refuses it, and Starcom will not publish field work with no objective. A received package also says what it states to NavCom: its state,
> who takes it, its field work and its agent. Settlements, witnesses and
> challenges are about reports, NavCom's kind 1912, live since 2026-10-06 and
> the form of Starcom's own sealed reports since rev 15; they are read, and
> "settled unchallenged" is shown once reports exist. Labelling packages
> published through Starcom is later work.

## Roster Item — `30084`, added in rev 14

The larger kinds of work Starcom supports, alone or together (D-RS): a **Cause** to follow, a
**Directive** (signed intent: purpose, end state, limits), an **Initiative** (a proposal), a
**Campaign** (bounded in time and place), an **Operation** (a declared, timed push), an **Epic**
(defined by its outcome), a **Quest line** (missions in order), a **Quest** (a goal a person sets
themselves), an **Adventure** (a mission package kind called by live data), a **Story** (an
account of what was done) and a **Saga** (the long account). A Mission Package (`30079`) and a
case are unchanged; a task is a mission's step.

Starcom defines the kinds. It publishes no instance of its own: every item is someone's, signed
by them. Which publishers a reader trusts is the reader's choice (RS4): Starcom marks none.

**The event.** Addressable, so an item is edited in place at `30084:<pubkey>:<d>`:

```
kind:       30084
tags:
  ["d", "<id>"]                                 its address among its author's items
  ["t", "starcom_roster"]
  ["roster", "<kind>"]                          cause | directive | initiative | campaign |
                                                operation | epic | quest_line | quest |
                                                adventure | story | saga
  ["title", "<title>"]                          up to 200 characters
  ["purpose", "<purpose>"]                      up to 1,000: a directive's intent, an epic's
                                                "so that", a quest's reason
  ["limit", "<a limit>"]                        one per limit, up to 20 of 300 characters:
                                                what work under it must not do
  ["window", "<from>", "<until>"]               ISO 8601 UTC dates or times; "" is open
  ["place", "<code>"]                           one per place, as globe intel's jurisdiction
                                                tag writes it: de, us-mn, union:eu
  ["a", "<coordinate>", "<relay or ''>", "toward"]   up to 100: this work is toward that
  ["a", "<coordinate>", "<relay or ''>", "counts"]   up to 100: its author counts that as part
                                                of this
  ["alt", "Starcom roster item: <Kind> · <title>"]   NIP-31, for other clients
content:    the item's text, for people; up to 20,000 characters
```

A coordinate is another roster item (`30084:<pubkey>:<d>`) or a Mission Package
(`30079:<pubkey>:<d>`). Every other tag is optional; a reader keeps the item without them.

**The two links (RS18).** `toward` is the child's claim, and anyone may make it: work may be
started under a directive without asking (RS2). `counts` is the parent's: only its author can say
which work it counts. A reader shows both and says which is which, "claimed by the work" or
"counted by its author". A `toward` link never puts the child into the parent's own account.

**Who sees it (RS13, RS14).** Not a tag: where the event goes.

- **Kept** on its author's device until they post it. Nothing leaves the device by itself.
- **Public:** signed, to the relays Starcom and NavCom share.
- **Invite-only, to a few:** the same event, unsigned, as a NIP-59 rumor, sealed and wrapped to
  each invitee, one wrap each. Nobody else can open it. An invitee reads kind `1059` with `#p`
  their key and unwraps it.
- **A team:** signed, to the team's own access-controlled relay only.

Every post goes through Starcom's publish review, which shows the item as it will be signed or
sealed, who can read it, and the relays it goes over.

**Reading.** `kinds: [30084]`, `#t: ["starcom_roster"]`. The newest event at an address stands,
and `["t", "retracted"]` there withdraws the item. A reader refuses an event without a `d`, a known
`roster` kind and a title, and one past the limits above. A kind it does not know yet is counted,
not shown.

**What each kind adds.** Each kind's own tags are defined here as its screens are built: the
Directive and the Epic first, then the rest. A reader keeps a kind's tags on any item that carries
them.

- **Directive** (RS2): its `purpose` is the intent, and
  `["end_state", "<what is true when it is done>"]`, up to 1,000 characters.
- **Epic** (RS7): its `purpose` is the "so that"; `["criterion", "<label>", "<target>"]`, up to 20,
  each a label of up to 200 characters and a whole count of 1 or more (a criterion that is not one is
  left out); and `["evidence", "<what counts as done>"]`, up to 1,000. Its `counts` links name the
  missions and items it counts.

- **Campaign** (RS5): bounded in time and place, so Starcom keeps one only with a `window` and a
  `place`; it may carry `criterion` tags and `counts` links, as an Epic.
- **Operation** (RS6, RS27): bounded as a Campaign, with criteria and counts; `["coordinator",
  "<pubkey>"]` when its author does not coordinate it; and `["ended", "YYYY-MM-DD", "<why>"]` when its
  coordinator ends it before its window closes. Its counts are shown a day late and rounded down, to
  tens below 100 and to hundreds above, so nobody is followed as they go (RS26).
- **Story** (RS11, RS51, rev 16): the common shape, its `toward` link naming what it is the account of. It
  never names or places people: Starcom's review refuses one whose title, purpose, limits or text carries
  a key (`npub`, `nprofile`, hex, or a secret `nsec`), an `@` handle, an email address, a phone number, map
  coordinates or a street address, and says which line. People's names cannot be told from the names of
  towns, venues or artists, so they stay with the author. Starcom offers one after a finished mission, an
  adventure's return, an ended operation and a closed case.
- **Cause** (RS1, RS53, rev 16): its `purpose` is the concern. It gives no orders and has no tags of its
  own. A reader counts the work `toward` it, by kind, and how many publishers it comes from, never the
  people: following a cause is kept on the reader's device and never posted, since anything posted can be
  listed by whoever reads it.
- **Initiative** (RS3, RS54, rev 16): its `purpose` is the problem; `["first_step", "<a first step>"]`, up
  to 1,000 characters, and `["for", "<who it is for>"]`, up to 300. Others join it by posting work `toward`
  it, counted as a cause's is. Its author grows it into a campaign or an epic: the new item links `toward`
  it, and the initiative gains `["a", "<that item's coordinate>", "<relay or ''>", "grew_into"]`, up to 10,
  each a roster item. A `grew_into` link is neither a claim nor a count.
- **Saga** (RS12, RS52, rev 16): its `purpose` is what it is the saga of, a place, a phenomenon or a group,
  and its text the opening a newcomer reads first. Its `counts` links are the stories its author chose; a
  reader lists them first, marked "chosen by its author", then every story `toward` it, newest first,
  marked "told toward it".
- **Quest line** (RS8, RS30): its `purpose` is the skill it teaches, and its `counts` links are its
  missions **in order**, the first done first, so a reader keeps their order as signed. Each one
  finished unlocks the next in the line; the missions stay open to anyone elsewhere.
- **Quest** (RS9): its `purpose` is why it was set, and its `counts` links name its missions, in no
  order.

  For both, what is finished is the reader's own record: a mission is finished when every step of it
  is ticked there, or, with no steps, marked so by hand (RS29). Progress, and who has started a quest
  line, is never posted (RS31).
- **Adventure** (RS10, RS33, RS34): a call over missions.
  `["call", "<what is happening>", "<its odds, as its source states them>", "<its source: an https link>"]`,
  of up to 200, 300 and 500 characters; `["hazard", "<what could hurt someone out there>"]`, up to
  10 of 300 characters; `["access", "public"]`, its places public, and open and lawful to be in at that
  hour; and
  `["from_home", "<a way to take part without going out>"]`, up to 300 (RS43). A reader keeps an
  adventure only with a call whose three parts are all there, a hazard, public access, a way from
  home, a `window` with both ends, a `place`, and at least one `counts` link to a Mission Package:
  its trials, reusable from call to call. It refuses one without them, so every adventure shown
  quotes its source, says when and where and what could hurt, and leaves no one out who cannot go. `ended` on an
  adventure means its caller called it off. Starcom also calls one off where the US National Weather
  Service warns, for each US state it names: in a warning's own areas, or in the whole state for a
  tornado, hurricane, blizzard, or extreme cold or heat warning. Outside the US only its caller and
  its window call it off, and Starcom says so.

  **Its return** (RS35) is a reply to the caller, sealed as a report on a mission is ("Reporting
  back, sealed"): a kind `1912` rumor, its `created_at` the start of its UTC day, sealed and wrapped to
  the adventure's author and sent to its inbox relays. It has one tag, and its content is a report's
  with `seen` added (rev 15):

  ```
  ["a", "30084:<caller pubkey>:<d>"]
  content: {"callsign"?, "date": "YYYY-MM-DD", "seen": true | false,
            "counts": [{"line": "<label>", "n": <whole number>}], "salt": "<32 lowercase hex>"}
  ```

  Its caller posts the totals as a mission's signer does (below), the note's `a` naming the
  adventure and the labels `Seen` and `Not seen`. A reader shows them a day late and rounded down,
  as an Operation's, so nobody is followed as they go.

**An Epic's progress: mission totals (D-RS, RS23).** A report on a mission is sealed to the package's
signer, so only the signer sees the counts. The signer posts the totals, never who reported, one note
per mission, and an Epic sums the totals of the missions it counts:

```
kind:       30023
tags:
  ["d", "mission-totals-<the package's d>"]
  ["t", "mission_totals"]
  ["a", "30079:<signer pubkey>:<the package's d>"]
  ["total", "<count label>", "<whole number>"]     one per count, as the package names it
  ["reports", "<whole number>"]                    how many reports are summed
  ["as_of", "YYYY-MM-DD"]
content:    the totals, for people
```

Only a note signed by the package's own signer counts: its author must be the pubkey in its `a`
coordinate. An adventure's caller posts the same note for its returns, its `a` naming the adventure
(`30084:<caller pubkey>:<d>`). The newest note at an address stands, and `["t", "retracted"]` withdraws it. An Epic's
criterion is summed from the totals whose label is the criterion's label, compared without case or
surrounding space, over the missions its `counts` links name. A reader says how many of those
missions have totals posted, and as of when; until one does, it says none is posted.

### Tasks together — added in rev 17

When a team works a Mission Package together (RS55), each step is taken so that no two members do it twice,
released, marked done, and checked by someone other than the one who did it (RS56). Each act is a NIP-32 label,
signed by the member, posted to **the team's own access-controlled relay only**, so only its members see who
took what. A person working alone, or from a public mission, posts nothing: their steps stay their own
checklist.

```
kind:       1985
tags:
  ["L", "starcom.step"]
  ["l", "taken" | "released" | "done" | "checked", "starcom.step"]
  ["a", "30079:<signer pubkey>:<d>"]        the mission
  ["step", "<step id>"]                     as the package's steps name it
  ["expiration", "<unix seconds>"]          on taken: 24 hours on (NIP-40)
  ["p", "<pubkey>"]                         on checked: whose done it checks
content:    on checked, what was checked, up to 500 characters; otherwise ""
```

**Reading** (`kinds: [1985]`, `#L: ["starcom.step"]`, `#a: [<the mission>]`, from the team's relay). A label with
more than one `l` in the namespace, no `a`, no `step`, or a `checked` with no `p` is not one. Each step's labels
are read in the order they were signed (by `created_at`, then id):

- **taken** holds the step for its taker until its `expiration`, never more than 24 hours after it was signed
  (RS57); a label after that finds it free. While one member holds it, another's take is nothing. Taking it
  again renews the hold.
- **released** frees it, from its taker only.
- **done** stands when the step is free or held by the one who did it; the first done stands.
- **checked** counts only from someone other than the one who did it, and only when its `p` names that done.

Walking away costs nothing: a take that is never released frees itself, as NavCom's claims do.

### A package toward a cause — added in rev 18

A Mission Package (kind 30079) may name the Causes and Initiatives (kind 30084) it works toward, so a cause counts
the mission as work toward it, beside the roster items that do (RS53, RS59). Each is one tag, as a roster item's
`toward` link is written:

```
["a", "30084:<pubkey>:<d>", "<relay hint, or empty>", "toward"]
```

- **Its own claim.** A link is the package's word, which anyone may make about any cause (RS18); the cause's author
  says nothing by it. A reader shows it as the package's claim.
- **Read strictly.** Only an `a` tag whose fourth value is `toward` and whose address is a kind-30084 address is a
  link; each address once, at most 100. Any other `a` tag means what it meant before.
- **Counted, never the people.** A cause or an initiative counts the packages toward it with the roster items toward
  it, and how many publishers they come from: "3 pieces of work cite it, from 2 publishers: 1 story, 2 missions."
- **Locked with the package.** Starcom writes the links its author picked, and they cannot change once the mission is
  ready to package; a closing carries them as the package did.
- **Nothing else changes.** The manifest is unchanged, and a reader that does not know the tag ignores it, as NavCom's
  reader does.

### Reports to a publisher in Starcom — added in rev 18

Mecha Jono's packages ask for counts at `metadata.mechaJono.format.effect`. A package made in Starcom asks for them at
**`metadata.format.effect`**, in the same form, each line `<what>: a count`, things never people (a line that counts
people is refused when it is written, by NavCom's own word list). A reader reads Mecha Jono's field first, then this
one. The rest of reporting is unchanged: kind 1912, NavCom's content, sealed to the publisher, sent only to the relays
its kind 10050 list names (MX28).

- **The inbox list.** A Starcom publisher whose mission asks for counts, and who names no inbox yet, posts a kind
  10050 list beside the package, through the same review: `["relay", "wss://…"]` for each public relay its sealed
  inbox reads, never a team's relay.
- **Settling and challenging.** The publisher sees each report sealed to it, on the lines its package asks, and may
  label it `settled` or `challenged` in `navcom.mission`, naming the report by the id inside its seal (`e`) and the
  mission by its address (`a`), sent where the mission went. Silence settles it seven days from its day; a challenge
  reverses nothing.

### How big a package a reader takes — added in rev 19

A Starcom reader refuses a Mission Package before reading its manifest when either limit is passed:

| Limit | Refused as | Why this number |
|---|---|---|
| Content over **131,072 bytes** of UTF-8 | `content-too-large` | The Record's own message limit (NIP-11), so nothing The Record can carry is refused |
| A `reports`, `intel` or `assets` list over **1,000 entries** | `list-too-long` | Far above real use: published packages have held at most 1 |

A package is anyone's to post, and some public relays take 1 MB events. Checking a manifest whose list entries all
fail costs memory for every entry, so both limits are counted before the check. On 23 October 2026 the largest
package on The Record was 37,742 bytes. Nothing else changes, and a package within both limits reads as before.

## Reporting back, sealed — added in rev 13, in NavCom's form since rev 15

A person who took a mission on reports the counts it asks for to the package's
signer, and to nobody else. It goes through Starcom's publish review, which
shows the report as it will be sealed, who alone can open it, and the relays it
goes over, before anything is signed.

**Which counts.** Those the package names on its effect lines,
`metadata.mechaJono.format.effect`, each an item of the form `<label>: a count`.
A package that names none offers no report. The line is sent verbatim, exactly
as the package states it; a reader drops any count whose line its package does
not carry as an effect (NavCom §5.2). A count kept from a mission taken before
rev 15, whose line was not kept, is sent on the line `<label>: a count`.

**The rumor.** Unsigned, as NIP-59 requires, with the reporter's pubkey. Its form
is NavCom's kind `1912` (its mission interchange §5.2):

```
kind:       1912
created_at: <the start of the report's UTC day, in Unix seconds>
tags:
  ["a", "30079:<signer pubkey>:starcom_mission_package_<manifest.id>"]
content (JSON, exactly):
  {
    "callsign": "<the reporter's callsign>",            left out when none is set
    "date":     "YYYY-MM-DD",                           the day, never a time
    "counts":   [{ "line": "<the effect line, verbatim>", "n": <whole number, 0 or more> }],
    "salt":     "<32 random lowercase hex characters>"
  }
```

No `g` tag and no place: a region-indexed history of who worked where is what
neither side builds. Counts left blank are left out, not sent as zero, and at
least one is given. **The salt** is drawn afresh for every report. Without it
the id inside the seal is a hash of things anyone can guess (a key, a callsign,
a day, the lines), and a `settled` label naming that id names its author to
anyone who guesses. With it, the label names the report to its signer alone.
A reader refuses a sealed report whose salt is not that shape, and an open
report that carries one (NavCom, rev 6).

**The review says so.** For a sealed send it asks no "you are the publisher"
(nothing readable goes public) and names each relay as holding the message
sealed; the key backup prompt still shows when the key lives only in the
browser.

**The seal and the wrap.** NIP-59: the rumor is sealed (kind `13`) to the
signer by the reporter's key and wrapped (kind `1059`) by a one-time key, with
`["p", <signer pubkey>]`. The seal and the wrap each carry a random time in
the two days before, as NIP-59 advises; the rumor carries the day's start, so
the signer learns the day and not the moment.

**Where it goes.** Only the relays the signer's NIP-17 inbox list (kind `10050`)
names, read from the relays its packages are read from: Mecha Jono's names
`wss://nos.lol` and `wss://relay.primal.net`. Never The Record, a relay built for
permanence, and never a public relay the signer did not name. A signer that
names no inbox is sent nothing, and the review says why. A signer reading its
reports reads kind `1059` with `#p` its own key there. Starcom counts the relays
that took it and keeps, on the reporter's device, that it was sent: the day,
the counts and that count of relays.

**Totals.** A signer's `mission_totals` note (above) names each total by the
count's label: its line without `: a count`.

**What it is not.** Not a claim, not a settlement, not a score. Nothing in it
ranks the reporter, and nothing is published in public about them.

**Status:** sending is built. Reading reports is the signer's side: Starcom does
not read reports addressed to anyone.

## Citing a NavCom observation — added in rev 11

When an Intel Report or a Mission Package published through Starcom rests on a
NavCom kind-`1911` observation, it carries one tag for each:

```
["e", "<1911 event id>", "<relay>", "cites"]
```

A citation keeps the observation (NavCom drops uncited ones after 90 days) and
credits the operator who made it.

Starcom reads kind `1911` under `navcom-intel/0.1.0` with a tested reader that
counts one contact key as one source, so a `refines` pair, or two `anonymous`
observations from one key, never corroborate each other.

**Status:** built (2026-10-06).

- **Reading.** Starcom reads kind `1911` from every relay it reads into its
  Analyzer, each checked by its signature and against the vocabulary NavCom
  publishes, fetched from NavCom and never pinned. Its field observations
  panel lists each observation once, however many tags it carries. A position
  is shown at its precision: an `area` cell is about ±20 km, its exact radius
  depending on its latitude. Starcom's reader had been written to an earlier
  draft (a `spec` tag, vocabulary in `t` tags, a geohash in `g`) and was
  rewritten to NavCom's builder: `g` is the anchor's region slug and is never
  decoded, `d` is the anchor, and everything else, the position included, is
  in the content. **The conformance vectors** (`observation-vectors/`, 34 of them) describe this form since
  rev 19 (2026-10-23); until then they still described the earlier draft, though the reader did not. They are built
  on NavCom's own test fixture (`st-louis/st-patrick-center`, area `dp3w`), so both sides test the same event.
- **Writing on one.** A person writes a report on an observation from that
  panel, and the report keeps what it rests on. Its words name neither the
  operator nor their key: the citation is the credit.
- **Citing.** A report published through Starcom's Exchange carries the tag
  above, for each observation it rests on, on the event that announces its
  package. A Mission Package carries one for each observation its linked
  reports rest on. The relay is the one the observation was first read from,
  and empty when none is known.
- **In the tags only.** The manifest does not carry citations, so a reader of
  Starcom's manifests meets nothing new.
- **Reading citations.** A report or package Starcom receives with these tags
  says what it rests on. Each cited observation is looked up among those
  Starcom has read, then by id on the relays it reads, and never on the relay
  a citation names: asking that relay would tell it who is reading, and when.
  One that no relay holds is shown as unread.
- **Only where a report may go.** A package cites what a linked report rests
  on only when that report's own distribution reaches as far as the package
  goes. A Public package cites only what Public reports rest on, so a report's
  basis never leaves through a package its author did not send it in.

## Counts and standing — added in rev 11

Nothing published through Starcom ranks an individual operator or gives a
per-person ratio: two counts, never a ratio. Starcom keeps no per-person score.

NavCom's kinds of standing (Honor, Karma, Hours, Supply, Intel) are derived
from public events, the labels and citations above among them, by NavCom's
published rules. Starcom will show them the same way: each kind side by side,
as far as the reading device can see, never added together.

**Status:** the vestigial 0–1 trust score and its reputation votes are
removed from Starcom (2026-10-06): never set above zero, shown or published,
they contradicted the rule above.

The side-by-side card is built for Intel (2026-10-06). An operator's name,
where Starcom shows NavCom's observations, opens their card: NavCom's kinds
side by side, as the reading device sees them.

- **Intel** is two counts, never a ratio: the observations the operator
  submitted, and how many of them have been refined. Refined means cited, as
  above, in a report or package signed by a key other than the operator's:
  citing your own is not being taken up downstream. Whether NavCom's rule
  agrees is asked of NavCom.
- **Honor, Hours and Supply** mint from settled reports, which Starcom does
  not read yet, and **Karma** from bounties, which it does not read. The card
  says so for each.

Never added together, never ranked: NavCom keeps no ledger, so each device
counts what it can see.

## Offers, asks and audiences — proposal, not yet implemented

**Nothing in this section is built on either side.** It is written down so it can
be argued with before it is built, which is the only moment the cost is low. Both
nodes are deliberately holding their routing vocabulary still, each waiting for
the other; this is Starcom putting a shape on the table so that stops.

### The problem it addresses

Three different things are being said on this network, and only one of them has a
model:

```
a claim            "this is true, and here is the method"     kind 30082 — modelled
a request for work "someone should do this"                   buried inside 30079
an offer           "this is available, on these terms"        does not exist
```

`30079` currently serves as both the bilateral Mission Package handoff and, on the
peer's side, an open board thread. The `d` tag keeps the two from colliding, which
is correct and enough for storage — but a consumer still cannot tell which ROLE an
event is playing without parsing its content.

### 1. Role is declared, not inferred

Both nodes already tag this; the proposal is only to make it normative.

```
["t", "starcom_mission_package"]   a package handed to a named peer
["t", "open_case"]                 a thread offered to whoever will take it
```

### 2. An ask is addressable

The peer's form is better than ours and Starcom proposes adopting it:

```
["ask", "<record id>#<audience>"]
```

One tag per claimable unit, so a consumer can filter on `#ask` without parsing
content. Starcom's asks are currently `objectives[].id` INSIDE the manifest, which
cannot be filtered on at all.

**Additive, not a replacement.** `objectives[]` stays exactly as it is. The peer
built a reply reader against what we published a week ago, and a spec revision is
not a licence to break somebody who moved quickly on our word. Pre-beta buys the
right to change our own shape; it does not buy the right to invalidate theirs.

### 3. Three axes, not one contested vocabulary

The open question between the nodes has been "is it your `objectives[].for` or our
`presence`?" That question has a false premise. They answer different things, and
so does a third:

```
beneficiary   who gains from the work        public · affected-group · person-served · operative · agency
presence      what taking it requires        desk · contact · field
audience      who it is offered to           citizen_osint · journalist · reward_hunter · …
```

A desk task can benefit the public; a field task can benefit one person served.
Keep all three. None of them asserts what the work is WORTH, which is why all
three survive contact with the attestation model below.

### 4. The market channel is an audience, never a price

Reward-bearing work routes by audience, exactly as the peer already publishes it:

```
["t", "audience:reward_hunter"]
["statute", "<the legal basis>"]     optional; names the statute and who decides
```

**A flag names the statute and who decides. It never states an amount, an
eligibility, or a promise.** That sentence is the peer's, and Starcom proposes
promoting it to a normative constraint binding both nodes.

### 5. Why this is NOT NIP-99

[NIP-99](https://github.com/nostr-protocol/nips/blob/master/99.md) defines
`kind:30402`, an addressable classified listing, and it is the obvious standard to
reach for. It is the wrong tool here, and the reason is worth recording so nobody
rediscovers it:

> `price` is a REQUIRED tag: `["price", "<number>", "<currency>", "<frequency>"]`.

Adopting `30402` would compel this node to assert an amount. That is incompatible
with the rule in §4, and with the attestation model's central commitment — weight
is derived by the consumer from method and age, never asserted by the author. A
format that cannot represent "there may be a statutory reward, and we will not
say how much" is not a format for this work.

`30402` becomes right the moment there is a genuine priced sale, because that is a
different speech act. There is none today: no price feed, no ownership ledger, and
the marketplace types in this codebase carry an explicit freeze notice.

The ecosystem has [no settled convention for the inverse](https://github.com/nostr-protocol/nips/issues/2467)
— soliciting rather than selling — which is what an ask is. NIP-90's `kind:5000`
job requests exist but assume a paid machine service.

### 6. A status is its own event — added in rev 9

Found by the peer in answer to rev 7's question about prior art, and it is a
better answer than the question deserved. [NIP-34](https://github.com/nostr-protocol/nips/blob/master/34.md)
defines `kind:1621`, an issue: a request for work, addressed to a named subject,
with no price and no payment mechanism anywhere in the NIP. Structurally that is
an open case, and neither node had named it.

**But the transplantable part is not the issue kind. It is the four events
beside it:**

```
1630  open
1631  applied / merged / resolved
1632  closed
1633  draft
```

A status is a **separate signed event**, not a field inside the thing it
describes. Both nodes' current models are missing that, in mirrored ways:

- Starcom's `objectives[].done` is a boolean inside a signed manifest, so
  changing it means republishing and re-signing the whole package — and it can
  only ever say done or not done.
- The peer's threads carry a disposition but an individual ask carries nothing
  public at all, so someone who claimed an ask has no way to say so and nobody
  else can see it is taken.
- Both break the same way under `(kind, pubkey, d)` replacement: the status of
  an ask and the content of an ask would replace on the same address, so
  touching one rewrites the other.

The proposal is the SHAPE, not the kinds. `1630`–`1633` are scoped to a
repository through an `a` tag to `30617` and are regular rather than
addressable, so they are not adoptable as they stand. What is adoptable: a
status is its own event, it references the ask by the
`["ask", "<record id>#<audience>"]` id, and **it is published by whoever holds
the status — the claimant, not the node that raised the ask.** That last part is
the one neither design can currently express at all, and it is the reason this
is worth more than the issue kind.

Not built on either side. The zero-cost half of it — saying plainly that `done`
is the publisher's view and never the claimant's — is done, above.

Why it matters more than a modelling nicety: of the peer's 48 open threads,
**none has ever been claimed or answered by a person.** An ask that cannot be
found by the individual who would do it, and cannot be marked as taken once they
start, is not yet a working loop.

### What Starcom asks in return

Tell us where this is wrong. Every name above is a proposal, and the cost of
changing one is a conversation today and a peer's release tomorrow.

## Manifest canonicalization, digest and checksum

Two rules a second implementation cannot guess and must not have to. Neither was
written down before; both were discovered by reading Starcom's source, which is
exactly the situation this document exists to end.

### Canonical form and the signed digest

`metadata.signature` signs a SHA-256 over the canonical JSON of the manifest **with
any pre-existing `signature` block removed** from `metadata` first.

Canonical JSON is:

- Object keys sorted by **UTF-16 code unit** — a bare `<` comparison, as in RFC 8785
  (JSON Canonicalization Scheme). **Not** a locale-aware collation.
- No insignificant whitespace; arrays in their given order; values serialized as
  ordinary JSON.

> **Implementers: do not use `localeCompare` or any locale-aware sort.** Starcom did,
> and it is locale- and ICU-dependent: `['Status','author','Zulu','apple','ändern']`
> sorts to a completely different order under locale collation than under code units.
> Two conforming nodes would have signed different bytes for the same manifest and
> failed to verify each other. Fixed in Starcom; recorded here so nobody reintroduces it.

The digest is `SHA-256(UTF-8(canonicalJSON(manifest_without_signature)))`, and it is
those 32 bytes — not the JSON text — that ML-DSA-65 signs.

### How `pubkey` and `sig` are encoded

Added in rev 9, and this is the answer to a question a peer asked three times —
after rev 6, after rev 7, and after rev 8 — while it blocked their first Mission
Package. The block said `string` and named no encoding. That was the omission,
and it was ours.

```
read    BOTH lowercase/uppercase hex AND base64 (standard or URL-safe alphabet)
write   lowercase hex
sizes   ML-DSA-65 pubkey 1952 bytes · sig 3309 bytes   (FIPS 204)
        Ed25519 pubkey 32 bytes · sig 64 bytes         (legacy blocks)
```

**A receiver MUST accept both encodings, permanently — not as a transition.**
Refusing the other one silently discards correct work. Tell them apart by
DECODING and checking the byte count, never by pattern: the base64 alphabet
contains every hex digit, so a base64 string can be valid hex, but it cannot
decode to the right size under both readings. 1952 bytes is 3904 hex characters
or 2604 base64 characters. Checking the size also catches truncation, which a
pattern test waves through.

**A sender SHOULD write lowercase hex**, because in this protocol a `pubkey` is
not only key material — it is an identity. Nostr writes keys in identity
positions as lowercase hex (NIP-01), and consistency with the surrounding
protocol is worth more here than base64's ~33% saving on the wire. This is a
weak preference and a node already emitting base64 has no reason to change:
both are conforming, and Starcom verifies base64 today.

> **And the trap underneath it.** Because `pubkey` doubles as an identity, a
> node that accepts two encodings without canonicalising has made one key into
> TWO AUTHORS — their claims split across identities that never merge, and their
> own-publication check misses its own key. **Canonicalise to lowercase hex at
> the boundary where an author identity is derived**, not at the point of
> comparison. Starcom hit this in the act of fixing the encoding bug: tolerance
> on the wire is only safe with canonicalisation behind it.

### Vectors for it, because prose is not testable

Added with rev 9, and their absence was the real gap. There were twenty Mission
Package vectors and **not one carried a signature block** — so the single part
of this document that actually blocked a second implementer was the one part
with nothing executable behind it.

```
/spec/mission-vectors/manifest-signature-hex-holds.json
/spec/mission-vectors/manifest-signature-base64-holds.json
/spec/mission-vectors/manifest-signature-tampered-refused.json
/spec/mission-vectors/manifest-signature-truncated-refused.json
```

Enumerated in `/spec/mission-vectors/index.json`. The first two are **the same
manifest and the same signature**, written once as hex and once as base64. They
are a pair on purpose: a verifier that reads only the encoding it emits passes
one and fails the other, which is the exact defect this section exists to
close. Passing one of them is not conformance.

`...-truncated-refused` is a signature cut to half its length that is still
valid hex. It is what refuses an implementation that sniffs the alphabet
instead of checking the decoded size.

**On reproducing the signature byte for byte: you cannot, and you should not
try.** ML-DSA-65 signing is hedged by default — it mixes in fresh randomness, so
two signatures over the same digest by the same key differ and both verify.
These vectors are generated with that randomness disabled purely so the
committed files are byte-stable and a diff means a real format change; Starcom's
own signer is hedged, which is the recommended default. Verify the signature
given. To check your own signer, sign the published `digestHex` with the
published seed and verify YOUR signature against the published public key.

Each vector carries `canonicalJson` and `digestHex` so a mismatch can be
localised to canonicalisation, digesting or the signature rather than reported
as one opaque failure.

Why this mattered more than it looks: the failure was silent on BOTH sides.
Starcom called `hexToBytes` on whatever arrived, the throw landed in a `catch`,
and the function returned `false` — so a genuine, correctly signed package read
as a forgery, with no error logged anywhere and nothing for either node to see.
The peer named that exact shape before it was found: *"you see nothing arrive,
we see nothing rejected."*

### `checksum` is a weak, non-cryptographic hash

Every `reports[]`, `intel[]` and `assets[]` entry carries a `checksum` over content that
**does not itself cross the boundary**. Its algorithm is a 32-bit string hash:

```js
let hash = 0;
for (let i = 0; i < str.length; i++) {
  hash = ((hash << 5) - hash) + str.charCodeAt(i);   // hash * 31 + c
  hash |= 0;                                          // wrap to signed 32-bit
}
return Math.abs(hash).toString(16);                   // sign discarded
```

Specified because interoperability requires it, and flagged because the name oversells
it. This is **not** an integrity proof:

- 32 bits, further reduced by `Math.abs` discarding the sign — collisions are findable
  by brute force in seconds, not an academic concern.
- Operates on UTF-16 code units, so astral-plane characters hash as surrogate pairs.
- Not a cryptographic hash and not second-preimage resistant.

**A receiver must not treat a matching `checksum` as evidence that content is
unmodified.** The manifest's real integrity proofs are the outer Nostr Schnorr signature
and the ML-DSA-65 block over the canonical digest — both of which cover the checksum
value itself. The field's honest use is as a cheap change-detection tag between parties
who already trust the signature, not as a verification primitive.

Replacing it with SHA-256 would be a breaking format change and is an open question
below, not a unilateral one.

## Dispatch Capability — `30081`

A signed, delegable grant of authority to dispatch one mission. Introduced because
"who may publish this Mission Package" had no answer that survived a decentralised
network: the Earth Intelligence Network has no institution to issue roles, and an
access-control list stored beside the record it protects is a note, not a control.

**Authority is rooted in the resource, not granted by a body.** A chain is valid only
if it begins with a grant issued by the key the mission records as its creator. This is
the same rule the source model already runs on — a self-assigned grade is worth nothing,
and neither is a self-issued capability over something you did not create.

```
kind: 30081
tags: [ ["d",        "cap:mission:<missionId>:<holderPubkey>"],
        ["resource", "mission:<missionId>"],
        ["action",   "dispatch"],
        ["holder",   "<holderPubkey>"],
        ["parent",   "<parentEventId>"] ]   // ABSENT on a root grant
content: ""                                  // the grant is entirely in tags
pubkey:  <issuerPubkey>                       // who is granting
```

### Verification

A verifier is given the chain, the resource, the action, the acting pubkey, and
`rootIssuer` — which it **must** take from the mission record itself, never from the
chain. A chain that nominates its own root grants everything.

1. Reject an empty chain. Absence of a capability is not permission.
2. For every link, verify the event signature **from its canonical fields alone**.
   See "Cached verification" below — this is not optional.
3. Every link must carry the expected `resource` and `action`.
4. `chain[0].pubkey` must equal `rootIssuer`, and `chain[0]` must carry no `parent`.
5. For `i > 0`: `chain[i].pubkey` must equal `chain[i-1]`'s `holder` tag, and
   `chain[i]`'s `parent` must equal `chain[i-1].id`. Only a holder may delegate what
   they hold, and only by attenuating the specific grant they were given.
6. The last link's `holder` must equal the acting pubkey.

### Refusal codes

A refusal carries a stable identifier alongside any human-facing message. The
identifier is part of this contract: **add to this list freely, never rename an
entry.** Conformance vectors assert the cause, because two implementations that
reject the same chain for different reasons have agreed on the outcome by
coincidence rather than on the rule.

| Code | Raised when |
|---|---|
| `empty-chain` | No capability was presented. Absence is not permission. |
| `wrong-kind` | A link is not kind `30081`. |
| `bad-signature` | A link's signature does not verify over its canonical fields. |
| `revoked` | A link is a withdrawal, published by its issuer to the grant's own slot. |
| `malformed-grant` | A link is kind `30081` but lacks required tags. |
| `resource-mismatch` | A link names a different resource. |
| `action-mismatch` | A link names a different action. |
| `root-issuer-mismatch` | `chain[0]` was not issued by the resource's root issuer. |
| `root-has-parent` | `chain[0]` claims a `parent`, so the chain is incomplete. |
| `issuer-not-holder` | A link was issued by somebody who did not hold the prior grant. |
| `broken-attenuation` | A link's `parent` is not the preceding link's id. |
| `holder-mismatch` | The chain is valid but empowers a different operator. |

**The order above is normative.** Refusal reasons are order-dependent: a chain presented
back-to-front has a first link whose issuer may legitimately equal `rootIssuer`, and it is
the "no `parent`" clause of rule 4 that catches it — not an issuer mismatch. A chain with
its middle link removed fails rule 5's issuer check before its parent check. Implementations
that evaluate in a different order still refuse the same chains, but report different
causes, and conformance vectors assert the cause. Evaluate in the order given.

A delegation that returns to an earlier holder (A → B → A) is **valid**. Nothing is
forged; A delegated to B and B delegated back. Refusing it would mean checking identity
rather than authority.

### Withdrawing a grant

A grant occupies a parameterized-replaceable slot, `cap:<resource>:<holder>`. Its issuer
withdraws it by publishing to that same slot an event carrying a `revoked` tag whose value
is the reason:

```jsonc
["d", "cap:mission:m-1:<holder pubkey>"],
["resource", "mission:m-1"], ["action", "dispatch"], ["holder", "<holder pubkey>"],
["revoked", "left the operation"]
```

Relays keep only the latest event per slot, so the withdrawal does not merely *announce*
that a grant is dead — it removes the grant a verifier would otherwise fetch. Chains
below it fail to assemble at all, because a chain is walked by the parent's event **id**
and that event is gone. Revocation is therefore transitive without anything walking
downward looking for children, which is just as well: an issuer does not know who their
delegate went on to delegate to.

**Only the issuer can withdraw**, and this is a property of the transport rather than a
rule anyone enforces. A replaceable slot is keyed by `(pubkey, kind, d)`, so a different
key publishing to `cap:<resource>:<holder>` writes to *its own* slot and replaces nothing.
Someone else's "revocation" is an event no verifier fetches.

#### The check must precede reading the grant

A withdrawal carries the same `resource`, `action` and `holder` tags as the grant it
replaces. It has to: a verifier could not otherwise tell which grant it withdraws.

The consequence is that **an implementation reading those tags before checking for the
`revoked` marker parses a withdrawal as a perfectly good grant, and honours authority its
issuer took back.** This is not hypothetical — the reference verifier for this document
did exactly that, and returned `valid: true` for a revoked root grant until the vectors
`capability-revoked-refused` and `capability-revoked-root-refused` were added.

So `revoked` is evaluated immediately after `bad-signature` and before every grant-field
check, and it is reported as `revoked` and never as `malformed-grant`. A withdrawal is a
deliberate act by the issuer; telling a holder their capability is malformed says the
wrong thing about what happened to it, and a holder who is told the chain is broken looks
for a bug rather than asking why their authority was withdrawn.

#### What withdrawal does not do

The same limit as a retracted claim, and for the same reason: a verifier holding a chain
it already fetched, or a relay that kept the event it should have replaced, still has
something that verifies. A withdrawal reaches whoever looks again — see the revalidation
obligation in the attested-claims specification, which applies here unchanged.

### Cached verification — a required implementation note

`nostr-tools`' `verifyEvent` short-circuits on a symbol property that `finalizeEvent`
stamps onto the event object:

```js
if (typeof event[verifiedSymbol] === 'boolean') return event[verifiedSymbol];
```

Object spread copies own symbol properties, so `{ ...signed, tags: forged }` carries the
stale `true` and verifies **without the hash ever being recomputed**. A tampered grant
passes. Events arriving over the wire are JSON-parsed and cannot carry the symbol, so
this is not a hole in relay ingest — but a capability chain can be assembled in-process.

**Implementations must rebuild each event from `{id, pubkey, created_at, kind, tags,
content, sig}` before verifying it.** An object's claim about its own prior verification
grants nothing.

### Known limits

- **Key loss is authority loss.** Rooting in the resource means an operator who loses
  their key can never dispatch missions they created. There is no recovery path, and
  this is the honest cost of having no issuing authority.
- **A mission created without an identity is undispatchable.** Where the creating
  implementation records a placeholder instead of a public key, no chain can ever root
  in it. Implementations should refuse to create such a record rather than emit one that
  can never be acted on.
- **Grants are not currently broadcast by Starcom, and no node's internal authority is
  verifiable by a peer.** These are two separate statements and revision 2 of this
  document conflated them into a prohibition. Corrected here.

  *Retracted:* revision 2 said grants MUST NOT be broadcast because publishing a chain
  would leak operator identities. That reasoning was wrong. Every event on this network
  is signed, so a publishing operator's pubkey is already on the wire — in Starcom's case
  it is the same key that appears as the mission's creator, and the same key the
  corroboration model requires be visible in order to measure feed independence at all.
  A grant among such keys discloses nothing the act of publishing has not already
  disclosed, and a grant is in any case a signed statement by its issuer: a deliberate,
  verifiable claim rather than a leak. Nodes MAY publish their chains. Whether to do so
  is a transparency choice, not a safety one.

  *What is true, and is structural rather than a Starcom limitation:* verification needs
  `rootIssuer` taken from the RESOURCE, and the creation of that resource — a mission —
  is not a public event on any node. So a peer cannot establish that a chain's root is
  genuinely the creator of the mission the package describes. A node could mint a
  self-rooted chain for a mission it invented, and the chain would verify perfectly.

  This applies to every implementation, not only this one. **Authority is not a
  verifiable property on this grid; attribution, content and internal consistency are.**
  A published chain is therefore AUDITABLE — it shows how a node says its authority was
  delegated, and proves the publisher did not act alone where the chain has more than one
  link — but it is not AUTHORITATIVE, and an implementation must not treat a valid chain
  from a peer as evidence that peer was entitled to dispatch.

  The inter-node decision that remains available is whether to admit packages from a
  publishing NODE at all, taken on the outer event's `pubkey`, which legitimately and
  unavoidably crosses. Starcom implements this as an admission policy that admits every
  publisher unless an allowlist is configured; a package from an unknown node is not
  thereby false. Peers should implement the symmetric decision for themselves rather than
  assuming anyone is open by default.

## Finding — `30082`

```
kind: 30082
tags: [ ["d", "starcom_finding_<entityRef>_<attribute>"],
        ["t", "starcom_finding"],
        ["schema_version", "<content.schemaVersion>"] ]
content: JSON.stringify({ content: FindingContent, signature: SignatureBlock })
```

`d` is content-addressed (entity + attribute, normalized), not a random id — republishing
the same finding replaces the prior event instead of accumulating duplicates each time
corroboration is recomputed with no actual change to the claim.

```ts
interface FindingContent {
  schemaVersion: number;                 // wire-shape version, currently 1
  claim: { entityRef: string; attribute: string; value: unknown };
  confidence: number;                     // 0..1
  corroboration: {
    sourceCount: number;                  // count only — never source identities
    algorithmVersion: number;             // which corroboration logic qualified this, currently 1
    criteria: string;                     // e.g. "2+ independent, no unresolved conflict"
  };
  publishedAt: string;                    // ISO 8601
}
```

## Finding v2 — attestation shape

**Status: implemented, not yet broadcast.** `schemaVersion: 2`. v1 remains the
wire format on relays until the publisher is switched over; this section is
normative for what v2 IS, and the migration note below is normative for how a
consumer tells them apart.

```ts
interface FindingAttestation {
  schemaVersion: 2;
  claim: {
    subjectRef: string;
    subjectKind: 'person' | 'object' | 'organization' | 'place' | 'event' | 'unknown';
    attribute: string;
    value: unknown;
  };
  method: {
    algorithm: string;              // implementation-defined — see the NIP. Starcom
                                    // publishes 'location-corroboration' and
                                    // 'attribute-corroboration'; expect others.
    algorithmVersion: number;
    parameters: Record<string, unknown>;  // the values ACTUALLY used by `algorithm`
    modality: Modality;             // REQUIRED — how the observation was made
    weakBacking: string[];          // REQUIRED — `[]` means none. Absent MUST be rejected.
    sourceCount: number;            // a COUNT, never identities
    observedFrom: string;           // ISO 8601 UTC
    observedTo: string;
    timePrecisionMs: number;        // coarsest contributing precision
    criteria: string;               // plain language, for a reader who will not run the algorithm
  };
  publishedAt: string;
}
```

#### `algorithm` is open, and always was

An earlier revision of this document typed `algorithm` as the single literal
`'location-corroboration'`. That was never true of the protocol — the NIP has
always called it an implementation-defined identifier — and it stopped being
true of this codebase too, which publishes `'attribute-corroboration'` as well.

The distinction matters more than a type. If `algorithm` were closed, adding a
method would be a breaking change requiring every peer to agree first. Because
it is open, a node may publish a method no one else has seen and nothing
downstream breaks: **weight derivation never reads `algorithm`.** It reads
`modality`, `sourceCount`, `timePrecisionMs` and `publishedAt`, all of which any
method must supply. A consumer meeting an unfamiliar algorithm can still derive
a weight; what it cannot do is re-run the method, which is what `criteria` and
`parameters` are for.

So a new method is an announcement, not a negotiation.

Starcom currently publishes three: `location-corroboration` and
`attribute-corroboration`, both machine-derived across observations, and
`case-adjudication`, which is a human conclusion drawn from an investigation.
The last is the product Navcom structurally does not generate, and the NIP's
**Case adjudication** section is normative for it — including why the case
identifier is part of the attribute, why the verdict is not a confidence, and
why the adjudicator's prose stays with the publishing node.

It is not described again here. The `modality`/`weakBacking` omission above is
what duplicating a normative type in two documents produces, and one instance
of that per specification is enough.

#### `modality` and `weakBacking` were missing here, and are required

Both are mandatory on the wire and enforced on receipt by `REQUIRED_FIELDS` in
`ForeignFindingStore`. Neither appeared anywhere in this document until now,
while the NIP has required both — so a node implementing kind 30082 from THIS
spec alone would have published attestations that Starcom correctly rejects, and
the rejection would have looked like a bug in the peer rather than a hole here.

`scripts/guard-spec-drift.mjs` now fails the build if a field this codebase
requires on receipt is missing from either specification. The header above says
the two documents should not drift; that sentence could not previously be
checked, and this is the check.

### The change that matters: there is no `confidence`

v1 published `confidence: 0.72` — a number the publishing instance asserted
about its own output. Inside one instance that is harmless. **Across a
federation it is fatal:** every instance can claim `1.0`, and one operator
running five instances manufactures consensus for free.

v2 removes it and publishes the INPUTS instead. A consumer runs the derivation
over `method` and `publishedAt` and gets the same number the publisher would —
without asking, and without trusting. That is the difference between a claim you
must take on faith and one you can check.

This follows `navcom-app/docs/attestation.md`, adopted unchanged so both
applications in the ecosystem are built from one object:

> A claim, plus who made it, plus how they know, plus how much that is worth —
> signed, and checkable without anyone's permission.
>
> **Weight is derived from method and age, never asserted by the author.**

### Deriving weight

Three factors, multiplied, each in 0..1:

| Factor | Rule | Why |
|---|---|---|
| **corroboration** | `min(sourceCount, 4) / 4` | Saturating. Linear growth would let a source-spamming instance manufacture weight by splitting one source into forty. |
| **precision** | `min(windowHours×3.6e6 / timePrecisionMs, 1)` | A finding whose inputs are timed to the day cannot support a 24-hour claim as strongly as one timed to the minute. Being *more* precise than required earns nothing extra. |
| **recency** | `0.5 ^ (ageDays / 180)` | Intelligence decays. The half-life is a stated judgement, not a measurement. |

`parameters` ships the values ACTUALLY USED, not the algorithm's defaults.
Version alone re-derives nothing — two instances on `algorithmVersion: 1` with
different windows produce different findings and no way to tell them apart.

### Migration

A consumer distinguishes them by `schemaVersion`, which is why it has always
been on the wire.

- **v1**: read `confidence` as the publisher's own assertion, and weigh it
  accordingly — it is not comparable across instances.
- **v2**: ignore any weight-shaped field (there is none) and derive.

A v1-only consumer encountering v2 will find no `confidence` and should treat
the finding as unweighted rather than as zero-confidence. **Absent is not zero.**

### Retraction

A retraction is published to the **same `d` tag** as the finding it withdraws.
Kind 30082 is parameterized-replaceable, so relays keep only the latest event
per slot: any consumer that queries the slot gets the retraction instead of the
claim. The withdrawal propagates through the same mechanism the finding did.

```ts
interface FindingRetraction {
  schemaVersion: 2;
  retracted: true;                 // check this BEFORE reading a claim
  retracts: { subjectRef: string; attribute: string };
  retractedAt: string;
  reason: 'superseded' | 'error' | 'source-withdrawn' | 'subject-request' | 'policy';
  note?: string;                   // optional, always
}
```

`reason` separates facts that are genuinely different: `superseded` means the
claim was not wrong, only stale; `error` means it was wrong; `subject-request`
means someone asked. `note` is optional on purpose — withdrawing a wrong claim
quickly matters more than explaining it well, and a retraction should never be
blocked on composing a justification.

#### Consumer obligation — normative

A consumer **MUST**:

1. Check `retracted` before reading `claim`. A payload at a finding's `d` tag is
   no longer guaranteed to be a finding.
2. Discard any cached finding for that `d` tag on seeing a retraction.
3. Treat a retracted slot as **absent**, not as a negative finding. A withdrawn
   claim about X is not evidence against X.

**What replacement does not solve**, stated rather than glossed: a consumer that
fetched the original and cached it will not learn of the withdrawal unless it
re-queries. That is a limit of the transport. A consumer holding findings
long-term should re-query slots it depends on rather than assume a cached claim
still stands.

### Publishing about people

Claims about `subjectKind: 'person'` require **explicit per-finding consent**
from the publishing operator. Not because such findings are illegitimate —
naming who did what is much of the point of public-interest intelligence — but
because broadcasting a signed claim about a named individual to public relays,
where being wrong is not quietly correctable, should never happen merely because
nobody thought about it.

`unknown` subjects are deliberately **allowed** without consent. Blocking them
would make the prompt routine, and a prompt that appears constantly stops being
deliberation and becomes a key people press. The cost is real: a person
misclassified as `unknown` publishes without the gate. The mitigation is
upstream accuracy in `subjectKind`, not a broader block that would defeat
itself.

### Refutation — `30083`

Corroboration without refutation is agreement-counting. Contradiction detection
is internal only: an instance can notice that its *own* observations disagree,
and has no way to say so about anyone else's published claim. Refutation is the
structural difference between a network that converges on truth and one that
amplifies its first guess.

```ts
interface FindingRefutation {
  schemaVersion: 2;
  refutes: {
    subjectRef: string;
    attribute: string;
    authorPubkey: string;    // WHICH instance's finding
    publishedAt: string;     // WHICH version of it
  };
  ground: 'contradicting-evidence' | 'failed-reproduction'
        | 'source-defect' | 'superseded-by-time';
  method: AttestationMethod; // the refuter's OWN evidence
  publishedAt: string;
}
```

#### A refutation is an attestation

It carries its own `method`, and its weight is derived by the same function used
on the claim. **You cannot refute by assertion any more than you can corroborate
by assertion.** Without this, the cheapest possible message — "wrong" —
outweighs expensive evidence, and refutation becomes a denial-of-service on
truth.

#### Its own kind, not a replacement

`30083` is a regular event, not a replacement of the finding's `30082` slot.
Publishing a refutation into the finding's own slot would let anyone overwrite
anyone's claim, which is the opposite of what checkability means. A refutation
is a claim by a *different author* about a *different subject* — the finding
itself.

`refutes` pins both the author and the `publishedAt`. Subject plus attribute
alone stops identifying a claim the moment more than one instance publishes, and
without the timestamp a refutation would silently apply to every later revision
of the slot — including one that fixed the very problem being refuted. **A
refutation is about a claim as it was made, not about a subject forever.**

#### Resolution — normative

A consumer holding a claim and refutations for it derives every weight and
compares:

| State | Condition |
|---|---|
| `uncontested` | no refutation carries meaningful weight |
| `contested` | a refutation exists but does not clearly outweigh the claim |
| `refuted` | strongest refutation weight > claim weight × 1.5 |

Compare **weights, never counts**. Counting would make refutation a voting
system, and a voting system on an open network is won by whoever runs the most
instances. One well-evidenced refutation should outweigh ten empty ones — and
does, because each is weighed by its own method.

The margin is deliberate: overturning a published claim should require clearly
better evidence, not marginally better.

`refuted` **does not mean deleted**. A refuted claim stays visible and stays
checkable. The point of an open network is that disagreement is legible, not
that the loudest party wins and the record is quietly amended. That also
distinguishes refutation from retraction: a retraction is the *author*
withdrawing; a refutation is *someone else* disagreeing, and only the author can
withdraw.

**What is never in a Finding**, by construction, not by redaction after the fact: a raw
report, a single-sourced claim, an analyst identity, or any source's identity — the
corroboration-computing logic upstream of this event never attaches source identities to a
`CorroboratedFinding` in the first place, so there is nothing here to redact. `sourceCount`
is the only trace a source's existence leaves.

`schemaVersion` and `corroboration.algorithmVersion` are deliberately two different numbers.
`schemaVersion` changes when the JSON shape above changes (a field added, removed, or
retyped) — a consumer needs this to parse the event at all. `algorithmVersion` changes when
the logic that decided a claim was corroborated changes — a consumer needs this to know
what "corroborated" actually meant for this specific finding, independent of the wire
format. A schema change and an algorithm change happen for unrelated reasons and shouldn't
be forced to share a version number.

**Today's `criteria` value**: `"2+ independent, no unresolved conflict"` — 2+ independent
sources agree on a location claim within a 100km / 24h window, AND that entity has zero
unresolved location conflicts anywhere in the working set at computation time. This is
location-only in the current implementation (no free-text claim extraction); `attribute` is
an open string in the type specifically so a second claim type is additive later, not a
breaking change.

## Signing key

Both kinds sign their payload (`metadata.signature` / `signature`) under the same persisted
ML-DSA-65 keypair (`ManifestSigningKeyStore` — one keypair per Starcom instance, generated
once, reused for every Mission Package and every Finding). Deliberate: a verifier who has
seen one signed package from this instance and pinned its public key can attribute a later
Finding to the same source, and vice versa, without a second trust bootstrap.

**Known gap, not yet resolved**: there is no key-rotation story. If this instance's signing
key is ever compromised, there is currently no way to rotate it or to tell an existing
consumer "distrust anything newly signed under key X." Fine for now, where the only real
consumer is Starcom's own good faith; a real problem the day an external party starts
pinning a key. **This needs resolving before this spec is treated as stable enough for a
third party to build against**, not before Starcom starts using it internally.

## Capability negotiation and deprecation (proposed convention)

Neither kind has needed this yet — `schemaVersion`/`algorithmVersion` only exist as of this
document, and there is exactly one version of each so far. Proposed now, while it's still
free, per the same reasoning Navcom's own `docs/spec/README.md` states for its own specs:
decide the *mechanism* for change before anyone is depending on the current shape, not after.

- **A consumer states which `schemaVersion`(s) it understands** — for Finding, this is
  already mechanically possible today via the `schema_version` tag (a relay-level filter, no
  content parse required); Mission Package has no equivalent tag yet and should probably
  grow one for symmetry.
- **A deprecation window, not a flag day**: an old `schemaVersion` stays valid (parseable,
  not just "still arrives") for some stated period after a new one ships, long enough for a
  consumer that hasn't updated yet to not silently break. No specific window is proposed
  here — that number is a joint decision, not a unilateral one.
- **Neither of the above is implemented.** This section describes the shape of a decision
  that needs making with Navcom, not a decision already made.

## Pattern ingest — draft, non-normative

Navcom's own `docs/ecosystem.md` describes an outbound path — "aggregated patterns,
de-identified" — as already specified at the constraint level (`[C35]`: field data crosses
as patterns, never as operator records). No wire format for a "Pattern" event exists in
either repo yet; `PatternIngestService` does not exist as code anywhere. This section is
Starcom stating what it would need to receive, for discussion, not a contract either side
has agreed to.

A Pattern arriving at Starcom would need, at minimum, to answer the same question every
other inbound observation Starcom already handles has to answer: how does this map into
`computeReportConfidence`'s reliability-weighted model and `computeCorroboratedFindings`'s
independent-source-counting logic without inventing a third bespoke shape? The `Source` /
`Observation` envelope sketched in the Phase 4 roadmap item — `{sourceId, kind, trustBaseline,
ingestMethod}` / `{sourceId, subjectEntityRef, claim, timestamp, schemaVersion}` — was
written with exactly this in mind: a Pattern would be one more `kind` value on `Source`, not
a rewrite of the analysis code that reads it. This is documentation of an intent, not a
built interface — see that roadmap's own note that the generalized ingest plumbing shouldn't
be built until a real third source (this would be the second) actually shows up to
generalize from.

## RLSH profiles are NavCom's card — added 10 Nov 2026

The owner's decision (Starcom record D-RF, `docs/missions/01-architecture-decisions/rlsh-signup.md`): a hero's RLSH
profile made in Starcom is NavCom's card, kind `10911`, signed by a contact key of its own, exactly as
`navcom-app/docs/spec/signals.spec.md` §10911 defines it. Starcom adds no sign-up, no review queue, no approval list,
and no team on a card (a crew card may come later, NavCom's "one person's word").

What Starcom writes:

- **Content:** `{ "callsign", "region": "earth", "doing"? }` and nothing else (a reader refuses a card carrying any
  other field).
- **Tags:** `["area", "zone", "zone:<id>", <name>]` (Starcom's ZSP 2.0 ids); up to 3 activity terms `["t", <id>]` from
  NavCom's `DOES` list as it stands (Starcom asks for no new terms); `["l", "starcom:rlsh"]`, by which Starcom lists
  RLSH cards; `["l", "navcom:public"]` only when the hero chooses to be listed on navcom.app too. A hero may choose
  neither label: the card is then listed nowhere and is still published, and the copy says so.
- **Age:** Starcom keeps its own age step (no key under 13) before any key or card is made in Starcom; NavCom's
  age-blind design holds for NavCom.
- **Withdrawal:** as NavCom's: a NIP-09 deletion (`kind 5`, `["a", "10911:<pubkey>:"]`, `["k", "10911"]`), the
  contact key kept or thrown away; no wording implies the card is gone from relays that kept it.
- **An AI agent's card:** from someone who answered Starcom's age question "I am an AI agent", the card carries
  `["agent", <the card's own callsign>]` (MX14), never their Starcom name, so the card stays unlinked to their key.
- **Relays:** the public relays Starcom and NavCom share; never The Record, which takes only its allowlist.

Starcom shows the cards labelled `starcom:rlsh` as a list in its RLSH panel (callsign with its key print, Zone,
activity terms, "Nobody has checked this card"), never a person on the globe. It reads `{ kinds: [10911], "#l":
["starcom:rlsh"] }` and `{ kinds: [5], "#k": ["10911"] }`: one card to a key, the newest standing; a deletion by the
card's own key withdraws every version up to it, whether or not a relay honoured it; a newer version no longer
labelled, or refused, is not replaced by an older one. Asked of NavCom (10 Nov 2026): that a
reader keeps a card carrying an `l` tag it does not know.

## Open questions for joint resolution

Not resolved here on purpose — these need an actual answer from whoever is building
`navcom-app`, not an assumption written into Starcom's own spec unilaterally.

- **Broadcast vs. addressed-and-encrypted — a real mismatch, not a hypothetical one.**
  Navcom's own `docs/spec/signals.spec.md` states its one load-bearing architectural
  decision plainly: "Signals are encrypted to the Watchtower key, not to the individual
  holding watch," and `docs/ecosystem.md`'s own open question says "Addressed to a
  Watchtower is compatible with everything here; broadcast to operators is not." Mission
  Package and Finding, as built today, are **broadcast and plaintext** — any client
  subscribed to the relay set above can read a Mission Package's full manifest or a
  Finding's full content. That's not a bug in the sense of failing to do what Starcom's own
  spec says it should do (Starcom never promised encryption); it's a genuine open
  compatibility question with what Navcom's architecture requires before a Mission Package
  can be treated as reaching only "the Console, and only the Console," as
  `docs/ecosystem.md` requires. Options this document isn't picking between: encrypt Mission
  Package content to a Watchtower pubkey (NIP-44, matching Navcom's own signals convention);
  keep it broadcast but treat that as an explicit, stated exception with its own
  justification; or something neither side has proposed yet.
- **Whether packages are addressed or broadcast** — Navcom's own `docs/ecosystem.md` lists
  this as unresolved on its side too. The point above answers it partially (today's
  implementation is broadcast) without resolving whether that's the right answer.
- **`docs/ecosystem.md` exists in both repos, describing the same boundary from opposite
  sides, maintained independently.** Not a content conflict today — both were checked
  against each other while writing this document and are consistent — but two independently
  maintained documents describing one boundary will drift eventually. Whether one becomes
  the source of truth the other links to, or they stay deliberately duplicated with an
  explicit sync process, is a real decision this document is flagging, not making.
- **`lineage.md` ownership** — exists in `navcom-app/docs/lineage.md`, referenced from that
  repo's own `ecosystem.md`; no equivalent exists in this repo. Whether Starcom needs its own,
  or the Navcom one is the shared reference for both, is likewise flagged rather than decided
  here.

## See also

- [`../ecosystem.md`](../ecosystem.md) — Starcom's narrative description of the boundary;
  this spec is normative where the two disagree
- `../../../navcom-app/docs/ecosystem.md` — Navcom's own narrative description, written
  independently, checked against this document for consistency while writing it
- `../../../navcom-app/docs/spec/README.md`,
  `../../../navcom-app/docs/spec/signals.spec.md` — the conventions this document matches,
  and the spec containing the Watchtower-encryption decision referenced above
