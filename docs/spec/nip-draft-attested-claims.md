NIP-XX
======

Attested Claims
---------------

`draft` `optional`

This NIP defines event kinds for publishing **verifiable analytical claims** —
assertions derived from evidence, carrying enough provenance that any consumer
can weigh them independently rather than trusting the publisher.

## Motivation

Nostr already carries opinions well. It carries *findings* poorly.

A finding is not a note. It is a claim someone derived, and the useful questions
about it are ones a note cannot answer: how many independent sources support it,
how it was arrived at, how precisely it is timed, whether anyone disagrees, and
whether the author still stands behind it.

The naive encoding — publish the claim with a confidence score attached —
fails in one specific and fatal way as soon as more than one publisher exists.
**A self-reported confidence is worth exactly the publisher's honesty.** Every
publisher can claim `1.0`; one operator running five clients manufactures
apparent consensus for free. Any protocol that lets an author assert their own
credibility has built a system that rewards whoever is willing to lie the most.

This NIP takes the opposite approach, adopted from
[attestation](https://en.wikipedia.org/wiki/Attestation) practice: **a claim
publishes its method, and consumers derive weight themselves.** There is no
confidence field. There is nothing to inflate.

## Event kinds

| Kind | Type | Name |
|---|---|---|
| `30082` | parameterized replaceable | Attested Claim |
| `30083` | addressable | Refutation — see [Addressing](#addressing-d-tag) |

Retraction is not a separate kind — see [Retraction](#retraction).

## Attested Claim (`30082`)

```
{
  "kind": 30082,
  "tags": [
    ["d", "<percent-encoded subject>:<percent-encoded attribute>"],
    ["t", "attested-claim"],
    ["schema_version", "2"]
  ],
  "content": "<JSON, see below>"
}
```

### The `d` tag is the claim's identity

Under a parameterized-replaceable kind, the `d` tag **is** the claim's
identity: two events sharing an author and a `d` tag are one claim, and the
later replaces the earlier. Every implementation therefore **MUST** derive it
identically, or claims from different implementations never replace one
another and a retraction never reaches the claim it withdraws.

The `d` tag **MUST** be:

```
percentEncode(claim.subjectRef) ":" percentEncode(claim.attribute)
```

where `percentEncode` escapes every octet outside the unreserved set
`A-Z a-z 0-9 - _ . ! ~ * ' ( )` as `%XX` over the UTF-8 encoding, using
uppercase hex — the behaviour of ECMAScript `encodeURIComponent`.

Implementations **MUST NOT** normalise case, collapse whitespace, transliterate,
or prefix the tag with a vendor or application name. Each of those has a
concrete cost, and this specification is explicit about them because the
reference implementation shipped all three:

- **Lossy folding merges unrelated subjects.** Collapsing non-alphanumerics
  reduced `北京`, `Москва` and `東京` to the same tag, so a claim about Beijing
  was silently replaced by a claim about Moscow. Every non-Latin-script subject
  shared one slot. Within Latin script, `Acme Corp`, `Acme-Corp` and
  `Acme/Corp` collided the same way.
- **The separator must be escaped inside the components**, or the tag is
  ambiguous: `subjectRef "A:B"` with `attribute "C"` and `subjectRef "A"` with
  `attribute "B:C"` would otherwise produce the identical tag.
- **A vendor prefix in a shared identifier is a centralising factor.** Any
  other implementation would have to hardcode one application's name to
  interoperate with it.

Case and whitespace are deliberately significant. If two publishers write the
same subject differently they occupy different slots, and that is correct: it
is a subject-canonicalisation disagreement, which must be resolved where
subjects are chosen rather than hidden by a slot function that quietly merges
distinct claims.

`content` is a JSON object:

```jsonc
{
  "schemaVersion": 2,
  "claim": {
    "subjectRef": "…",      // what the claim is about
    "subjectKind": "person" | "object" | "organization" | "place" | "event" | "unknown",
    "attribute": "…",       // what property is asserted
    "value": <any>          // the asserted value
  },
  "method": {
    "algorithm": "…",              // implementation-defined identifier
    "algorithmVersion": 1,
    "parameters": { … },           // the values ACTUALLY USED, not defaults
    "sourceCount": 3,              // a COUNT, never identities
    "observedFrom": "<ISO 8601 UTC>",
    "observedTo": "<ISO 8601 UTC>",
    "timePrecisionMs": 86400000,   // uncertainty width of the above
    "criteria": "…",               // plain language, for a human reader
    "modality": "primary_record",  // HOW it was observed, see Modality
    "weakBacking": [],             // REQUIRED, see Declaring your own weak backing
    "derivesFrom": { … },          // OPTIONAL, see Crediting someone else's method
    "inputFingerprints": ["…"]     // OPTIONAL, see Reproducibility
  },
  "publishedAt": "<ISO 8601 UTC>"
}
```

Implementations **MUST NOT** include a `confidence`, `weight`, `score`, or
equivalent self-assessment field. Consumers **MUST** ignore one if present.

### Required properties, and why each is required

**`subjectKind`** changes what a claim *means*. "This organisation was at X" and
"this person was at X" support entirely different inferences — an organisation
can be in twenty places at once and a person cannot. A consumer applying any
exclusivity reasoning needs to know which it holds. `unknown` is valid and
**MUST NOT** be guessed.

**`parameters`** ships the values actually used. An algorithm identifier and
version alone re-derive nothing: two publishers running `v1` with different
thresholds produce different claims with no way to tell them apart.

**`sourceCount`** is a count. Source identities **MUST NOT** appear anywhere in
`content`. This is not redaction after the fact — an implementation should not
have them at this layer to begin with.

**`timePrecisionMs`** is the uncertainty width on the observation window. Not
every source knows *when* to the same resolution, and a claim assembled from
month-precision inputs cannot support a statement about a 24-hour window. Absent
**SHOULD** be treated as one day: a date with no time is a day, not a midnight.

## Modality

`modality` records **how the observation was made**. It is required, and
`unknown` is valid but **MUST NOT** be guessed.

```
in_person        the observer was physically present at the subject
field_attested   a party who was present attests to it
direct_contact   the subject or its operator was contacted directly
primary_record   an authoritative record published by the subject or its registrar
secondary_record a record republished or aggregated by a third party
inference        computed from other claims or a corpus, not observed
self_attested    the subject asserts it about itself
unknown          not determinable
```

**This list is not a ranking, and implementations MUST NOT treat it as one.**
A national corporate register is a `primary_record` obtained by download; a
phone call to a shelter is `direct_contact`. Which of those deserves more
weight depends on the attribute, and the consumer decides — the same rule that
forbids a publisher declaring its own confidence forbids this specification
declaring it on the publisher's behalf.

What the vocabulary does provide is *distance from the thing itself*, which is
the axis every implementation in this network converged on independently. A
consumer weighing two claims about the same subject now has a stated basis for
preferring one, instead of guessing from an implementation-defined algorithm
identifier.

Two mappings are recorded here because they were contributed by the
implementations they came from:

- A physical-observation ranking of in person over phone call over website maps
  onto `in_person`, `direct_contact`, `secondary_record`.
- A competency ladder of field-attested over curriculum-attested over
  self-attested maps onto `field_attested`, `inference` (with the corpus digest
  in `parameters`), `self_attested`.

## Crediting someone else's method

`derivesFrom` is optional. It states that the algorithm this claim used was
specified by someone else, so that running another participant's method does
not require holding their signing key.

```jsonc
"derivesFrom": {
  "node": "starcom",                      // who specified the method
  "method": "address-enumeration@1",      // its name and version THERE
  "specification": "bafkrei…"             // CID of the document defining it
}
```

Absent means the method is the publisher's own. Present, every field is
**REQUIRED**; a partial `derivesFrom` **MUST** be rejected, because a citation
that cannot be followed is worse than none — it implies a provenance a consumer
cannot check.

**It does not, and MUST NOT, affect weight.** An implementation that scores a
claim higher because it cites a well-regarded method has re-invented
author-declared confidence with an extra step: the publisher would be asserting
trustworthiness by association rather than disclosing what it did. The
conformance vectors pin this — a claim carrying `derivesFrom` derives exactly
the weight of the same claim without it.

**It is not `relayedVia`, and the two answer different questions.**
`relayedVia` says the SOURCES reached this publisher through a shared editorial
path, which is evidence about independence and legitimately discounts
corroboration. `derivesFrom` says the METHOD came from elsewhere, which says
nothing about the sources and changes no term in the derivation.

### What it is actually for

Recall. A method can be found defective after claims have been built on it —
this specification exists in the state it does because its own reference
implementation shipped a slot-collision bug that silently merged unrelated
subjects. When that happens, the party who specified the method needs to be
able to say so, and consumers need to find every affected claim regardless of
who published it.

Without this field that is impossible: a consumer sees `algorithm:
"address-enumeration"` and cannot tell whether it is the method that has the
defect or an unrelated implementation that happens to share a name. Naming the
specification by content address removes the ambiguity, because the document
that defines the method is the thing being cited, not a label.

## Declaring your own weak backing

`weakBacking` is a required array naming the inputs to this claim that the
publisher knows to be thin, stale, or unreproducible. An empty array is a
positive statement — *this publisher checked and found none* — and is not the
same as the field being absent. An absent `weakBacking` **MUST** be rejected.

```jsonc
"weakBacking": [
  "gleif-golden-copy: undated source url, no archived copy"
]
```

The rule exists because a publisher that computes its own weakness and then
withholds it is worse than one that never computed it: the information existed,
and the consumer was denied it. The reference implementation shipped exactly
that defect. Its freshness guard classified every input as archived,
upstream-dated, or `UNREPRODUCIBLE`, and that classification lived only in the
build — a consumer receiving the published claim could not tell.

A claim that names its own weak backing is not a weaker claim. It is a claim a
consumer can weigh, which is the only kind worth publishing.

## Deriving weight

Consumers compute weight from `method` and `publishedAt`. This NIP does not
mandate a formula — different applications legitimately weigh differently — but
a conforming derivation **MUST** depend only on published facts, and **MUST NOT**
depend on any value the author asserted about their own credibility.

A reference derivation, offered as a starting point:

| Factor | Rule | Rationale |
|---|---|---|
| corroboration | `min(sourceCount, N) / N` | Saturating. Linear growth rewards splitting one source into many. |

Where `method.relayedVia` is present and non-empty, every contributing source
reached the publisher through those aggregators. Such sources are distinct
observers sharing one delivery path, and that path is a single point of failure
the count cannot express: one editor asserting a value with five citations is
indistinguishable, downstream, from five registries independently agreeing.

The reference derivation therefore counts additional relayed sources at half
weight — `1 + (sourceCount - 1) x 0.5` — keeping the first at full value
because the evidence is real, and **caps the result below saturation** at
`N - 1`. The cap matters as much as the discount: a relay's failure mode does
not weaken as sources accumulate, since one editor can cite eleven registries
as easily as five. A claim delivered wholly through a single aggregator
**MUST NOT** reach the corroboration of one received independently. The 0.5 is a judgement, not a measurement, which
is precisely why `relayedVia` is published: a consumer who weighs it
differently has the facts to do so.
| precision | `min(window / timePrecisionMs, 1)` | Coarser timing supports a windowed claim less strongly. Being finer than needed earns nothing. |

`precision` applies only where the claim was matched by a time-and-distance
window. A claim carrying `method.parameters.matchedBy: "equality"` was matched
on an exact identifier, publishes `windowHours: 0` because no window was used,
and **MUST** be treated as `precision = 1` rather than run through the ratio —
which would yield 0 and silently zero the weight of every such claim. Timing
precision is not a weak signal for an identifier match; it is not a signal.

Absent `matchedBy` means `"distance"`, so claims published before this
distinction existed are unaffected.

#### Enumeration: counts are not agreements

A claim carrying `method.parameters.matchedBy: "enumeration"` is a **census**:
its value was obtained by counting the members of a stated set, not by
observing agreement between independent sources. Such a claim **MUST** also
carry `method.enumeratedBoundary`, a human-readable statement of exactly what
was enumerated, including the snapshot date of the underlying data.

For an enumeration, the corroboration term is **inapplicable and MUST NOT be
applied**. A complete count of one authoritative register publishes
`sourceCount: 1` and is not thereby a weak claim; running it through
`min(sourceCount, N) / N` would divide a national register's weight by `N` for
having exactly one register. There are no independent observers to count,
because agreement is not what is being asserted.

What replaces it is the **stated boundary itself**, and the requirement is
structural rather than graded. An enumeration missing `enumeratedBoundary`
**MUST be rejected**, exactly as any other missing required field is — not
accepted at a reduced weight. A count *is* the entire claim, so a count whose
boundary nobody can determine is not weakly supported: nobody can re-run it, and
an unrepeatable count is indistinguishable from an invented one. A valid
signature over such a payload is still a rejection.

Consumers that derive weight without performing structural validation **SHOULD**
treat a missing boundary as `corroboration = 0` — zero, never a middling
default — but this is a backstop for a claim that should never have reached the
derivation, not a second legitimate state. The reference vectors exercise both
paths: `enumeration-census` is accepted and weighed, `enumeration-no-boundary`
is rejected.

For an accepted enumeration, corroboration is `1`: the boundary is stated, and
what would otherwise be measured by agreement has been established by census.

`precision` is likewise inapplicable and **MUST** be treated as `1`, for the
same reason it is for `"equality"`: no time window was used.

`recency` carries essentially all of an enumeration's weight, and for that
reason it is measured differently. Age **MUST** run from `method.observedTo` —
the instant the register describes — and **MUST NOT** run from `publishedAt`.

Elsewhere `publishedAt` is a fair proxy for the age of the evidence, because a
corroborated finding is published about when it is observed. A census breaks
that link: the snapshot instant and the decision to publish are independent,
and `publishedAt` is a value the publisher chooses. Ageing from it lets anyone
republish a years-old register this morning and derive full freshness — the
same class of defect as reading a declared confidence, arriving through a field
nobody thinks of as a credibility claim. The reference vector
`enumeration-census` publishes a snapshot older than its publication date
precisely so the two paths give different answers: `0.3299` from the snapshot,
`0.7937` from `publishedAt`.

`relayedVia`, if present on an enumeration, does **not** discount it. The relay
discount models a shared point of failure between several observers; a census
has no such plurality to compromise. Consumers wanting to discount a relayed
register have the field and may do so, but the reference derivation does not.

The narrowing that makes this safe is in the claim itself. A register records
what was **filed**, not what is true, and a conforming `claim.attribute`
**SHOULD** say so — `companiesAtRegisteredAddress` rather than
`companiesOperatingAt`. Under that reading, the residual uncertainty is snapshot
currency, boundary completeness, and the authority of the register, all of which
this derivation addresses. Nothing in it is a proxy for independence, and it
must not be read as one.
| recency | `0.5 ^ (age / halfLife)` | Analysis decays. The half-life is a judgement, and implementations should state theirs. |

#### Weight is a real number, and MUST NOT be compared for equality

Two conforming implementations of the same derivation will not produce
bit-identical weights. Floating-point associativity differs with the order
terms are multiplied, and implementations legitimately round for display. The
reference implementation and an independent one, given the same event,
produced `0.75` and `0.7499999964232856` — the same weight by any meaning that
matters, and unequal to `===`.

Implementations therefore **MUST NOT** compare derived weights for exact
equality, and **MUST NOT** key, cache, or deduplicate on a weight value. A
conforming comparison uses a tolerance; `1e-6` is ample, since no decision this
number informs is sensitive at that scale.

Rounding is **presentational**. An implementation may round for display, but
the rounded value **MUST NOT** feed back into ordering or comparison: rounding
to four decimals makes `0.75000001` and `0.74999999` a tie, and a tie is
resolved by whatever order the list happened to be in — which is not a property
of the evidence.

`age` is measured from `publishedAt` to the moment of evaluation, which has a
consequence worth stating plainly: **weight is not a property of the event.** It
is a property of the pair (event, evaluation time), and the same event evaluated
a year apart yields different weights by design — that is what decay means.

Two things follow, and both are normative:

- A consumer that displays, exports, or transmits a derived weight **MUST**
  accompany it with the evaluation time it used. A weight without one cannot be
  checked by anyone, including its author later.
- A consumer **MUST NOT** cache a derived weight as though it were a field of
  the event. Recompute it, or carry the evaluation time with it.

Conformance vectors therefore pin `evaluatedAt` explicitly; without it, two
correct implementations produce different numbers and neither is wrong.

## Methods other than corroboration

`method.algorithm` is an implementation-defined identifier, and this section
exists to say plainly what follows from that: **publishing a new method is an
announcement, not a negotiation.** No consumer needs to agree in advance, and
none needs to change to keep working.

That holds because of one property, which implementations MUST preserve:

> **Nothing in weight derivation reads `algorithm`.**

Weight comes from `modality`, `sourceCount`, `timePrecisionMs`,
`parameters.windowHours` and `publishedAt` — all of which every method must
supply. A consumer meeting an identifier it has never seen therefore derives a
weight normally. What it cannot do is re-run the method, which is what
`criteria` and `parameters` are for: `criteria` states in plain language what
was done, for a reader who will not run anything.

A consumer **MUST NOT** reject a claim because `algorithm` is unfamiliar, and
**MUST NOT** rank methods by identifier. Both would reintroduce
author-asserted authority through the back door: the author picks the string.

### `parameters` carries the values that algorithm actually used

Not the corroboration algorithms' fields. `windowHours` is common to every
method that makes a claim about a period, and the rest of `parameters` is
whatever the named algorithm used and a reader would need to repeat it.

`distanceThresholdKm` is specific to distance matching and is **optional**. An
algorithm that matched nothing by distance publishes no threshold. A consumer
**MUST NOT** read its absence as `0` — a zero radius would read as an extremely
precise match rather than an inapplicable one, which is the same trap
`matchedBy: 'equality'` exists to avoid.

## Case adjudication — `algorithm: "case-adjudication"`

A human read the evidence gathered in an investigation and reached a
conclusion. It is an attested claim like any other, at kind `30082`,
distinguished only by its method.

```jsonc
{
  "claim": {
    "subjectRef": "Northwind Shipping Ltd",
    "subjectKind": "organization",
    "attribute": "case-adjudication:C-042",   // the case number is part of it
    "value": "substantiated"                  // | "unsubstantiated" | "inconclusive"
  },
  "method": {
    "algorithm": "case-adjudication",
    "algorithmVersion": 1,
    "modality": "inference",
    "parameters": {
      "windowHours": 336,
      "reportsBehind": 3,
      "contradictionsTotal": 2,
      "contradictionsAddressed": 2
    },
    "sourceCount": 3,
    "timePrecisionMs": 86400000,
    "weakBacking": [],
    "criteria": "…"
  }
}
```

### Why the case number is in the attribute

Kind `30082` replaces on `(author, subject, attribute)`. Two investigations of
the same subject are two claims, so without something distinguishing them the
second would occupy the first's slot and **delete an earlier investigation's
published conclusion**. Implementations MUST make the attribute unique per
investigation; this one appends the case identifier.

### `value` is a verdict, not a confidence

Three outcomes, and `inconclusive` is one of them. A case that looked and could
not settle the question has produced information, and an adjudicator with no way
to say so is pushed toward overstating.

This does not reintroduce declared confidence. A confidence is the author
grading their own work — unverifiable, and refused everywhere in this format. A
verdict is the conclusion the investigation was opened to reach. The
distinction is whether the field describes the WORLD or describes the AUTHOR'S
CERTAINTY about it.

### `contradictionsAddressed` is backed by text, not by a checkbox

The publishing node holds, for each contradiction it counts as addressed, the
adjudicator's written account of HOW. That text is **not** published — see
below — but it is what the count is made of: an implementation MUST NOT
increment this for a contradiction with no stated reason.

A boolean would have been cheaper and worthless. A tick costs nothing to apply,
so a count of ticks measures willingness to tick. Requiring words means the
number a consumer sees was paid for.

`contradictionsTotal > contradictionsAddressed` is a normal, publishable state
and **MUST NOT** be rejected. Implementations SHOULD also state the shortfall in
`weakBacking`, where a reader looking for exactly this will find it without
subtracting two numbers.

### The adjudicator's reasoning does not travel

`claim.value` carries the verdict; the prose stating it stays with the
publishing node.

This is not secrecy. The publication gate keys on `subjectKind`, and free text
cannot be evaluated by it — prose naming a person passes a check that a
structured subject would have stopped. Distillation is the discipline the
format asks for, and a consumer receiving the verdict plus the counts can weigh
the claim without it.

A consumer wanting the reasoning asks its author, which is a conversation
between people rather than a broadcast about someone.

## Refutation (`30083`)

Corroboration without refutation is agreement-counting. A protocol where
publishers can only ever agree amplifies its first guess.

```jsonc
{
  "schemaVersion": 2,
  "refutes": {
    "subjectRef": "…",
    "attribute": "…",
    "authorPubkey": "…",     // WHICH publisher's claim
    "publishedAt": "…"       // WHICH version of it
  },
  "ground": "contradicting-evidence" | "failed-reproduction"
          | "source-defect" | "superseded-by-time",
  "method": { … },           // the refuter's OWN evidence, same shape
  "publishedAt": "…"
}
```

A refutation **MUST** carry its own `method`. **A refutation is an attestation.**
Without this requirement the cheapest possible message — "wrong" — outweighs
expensive evidence, and refutation becomes a denial-of-service on truth.

`refutes` **MUST** identify both the author and the specific `publishedAt`.
Subject and attribute stop identifying a claim as soon as two publishers exist,
and without the timestamp a refutation silently applies to every later revision
— including one that fixed the very problem being refuted. **A refutation is
about a claim as it was made, not about a subject forever.**

Refutation is **addressable** at its own kind, deliberately not a replacement of
the claim's `30082` slot. Publishing into another author's slot is impossible by design, and
should stay that way: a protocol where disagreement overwrites the thing being
disagreed with has no record left to check.

### Addressing (`d` tag)

A refutation **MUST** carry a `d` tag derived as:

```
percentEncode(refutes.authorPubkey) + ":" +
percentEncode(refutes.subjectRef)   + ":" +
percentEncode(refutes.attribute)    + ":" +
percentEncode(refutes.publishedAt)
```

Every component is percent-encoded, **including the timestamp**. ISO-8601
contains colons, so leaving `publishedAt` raw splits a four-part identifier into
six on its own separator and the address stops being decomposable.

> **DEFECT — reported 2026-08-26, RESOLVED 2026-08-28.**
>
> As published, this section called refutation a regular event and specified no
### UNRESOLVED: this address is roughly 4,000 characters

`authorPubkey` is an ML-DSA-65 public key, which is 1,952 bytes — 3,904
characters as hex. A refutation's `d` tag is therefore ~3,957 characters, against
~21 for the claim it contests.

Measured against the five relays this node publishes to, rather than assumed:
four run strfry and declare `max_message_length` between 131,072 and 1,000,000;
one declares no limitation block at all. **None declares a limit on tag-value
length.** So 3,957 bytes is not obviously refused by anything a relay states
about itself, and an earlier draft of this section claiming refutations "will be
rejected" was speculation — it is recorded here because the correction matters
more than the alarm.

What remains true is that the value is roughly two hundred times larger than any
other `d` tag this protocol emits, relays index `d` tags, and no relay declares
what it does with an index key of that size. That cannot be settled from
declared limits; it needs one deliberate empirical test against a relay whose
operator consents, or a design that does not need the test.

The size is also a cost independent of acceptance: an address nobody can read,
log, or paste is worse for the humans debugging a contest than one they can.

**This is not yet decided.** The obvious repair is to address by a digest of the
author key rather than the key itself — `sha256(authorPubkey)` as 64 hex
characters brings the tag to ~120 — which preserves everything this section
argues for: the address stays four components, stays deterministic, and a
consumer holding a candidate author can still confirm the match by hashing it.
What it gives up is reading the author directly out of the address, which no
consumer needs, because the signature already names them.

It is recorded rather than changed because the derivation is shared, and because
the cost of deciding is near zero right now and rises with every refutation
anyone publishes. Neither implementer has published one outside test vectors.

> `d` tag. NIP-01 derives storage semantics from the kind number, and `30083` is
> in the addressable range `30000–39999`. Relays replace on
> `(pubkey, kind, d-tag)` and treat an absent `d` as empty, so **every refutation
> an author published would have overwritten their previous one** — an author
> could hold exactly one refutation on a relay, ever. That defeated the property
> this section argues for.
>
> Confirmed independently by two implementers: Starcom against `nostr-tools`
> (`isRegularKind(30083) === false`, `isAddressableKind(30083) === true`), and
> Mecha Jono against NIP-01's numeric ranges directly. Mecha Jono's
> `configs/ein_relay_kinds.json` had already inherited `30083` from this text
> without the contradiction being caught on that side either — the defect was in
> the number, not in any one reader.
>
> Two fixes were offered: relocate the kind into `1000–9999`, or keep `30083`
> and specify the `d` tag above. Both implementers chose the second, and both
> reported zero migration cost — no refutation had been published by anyone.
>
> **Why this is the right semantics rather than a compromise** (Mecha Jono's
> reading, which is better than the one originally offered here): the identifier
> includes `attribute`, so a refutation of one attribute and a refutation of
> another coexist. Only two refutations of the *same* attribute collide, and
> there "the refuter's latest word on this point supersedes their own earlier
> word" is closer to how correction works than an accumulating pile of
> superseded attempts.
>
> Addressability at a kind that is not `30082` never touches a claim's slot. The
> requirement that a refutation must not overwrite the claim is satisfied by
> using a different **kind** — not by being regular. The two were conflated.
>
> The encoding of `publishedAt` was found while implementing the agreed fix,
> before any refutation existed to be addressed by it.


## Retraction

A retraction is published to the **same `d` tag** as the claim it withdraws,
under kind `30082`. Because the kind is parameterized replaceable, relays keep
only the latest event per slot, so the withdrawal propagates through the same
mechanism the claim did.

```jsonc
{
  "schemaVersion": 2,
  "retracted": true,
  "retracts": { "subjectRef": "…", "attribute": "…" },
  "retractedAt": "…",
  "reason": "superseded" | "error" | "source-withdrawn"
          | "subject-request" | "policy" | "decayed",
  "note": "…"                // OPTIONAL
}
```

`decayed` is distinct from `superseded` and the distinction is load-bearing:
`superseded` asserts that a **newer finding replaces this one**, so a consumer
should go and look for it. `decayed` says there is no replacement — the
publisher is simply no longer willing to stand behind a claim they have not
rechecked. Collapsing the two would send consumers hunting for a finding that
does not exist.

Consumers **MUST** check `retracted` before reading `claim` — a payload at a
claim's slot is no longer guaranteed to be a claim. They **MUST** discard cached
copies, and **MUST** treat a retracted slot as *absent* rather than as a
negative finding. **A withdrawn claim about X is not evidence against X.**

`note` is optional deliberately. Withdrawing a wrong claim quickly matters more
than explaining it well, and a retraction must never be blocked on composing a
justification.

#### An unrecognised `reason` does not refuse the withdrawal

A consumer meeting a `reason` it does not know **MUST** still honour the
retraction, and **MUST NOT** map it onto one it does know. Report it as
unrecognised — a third state — rather than guessing between `superseded`,
which sends a reader looking for a replacement, and `decayed`, which says
there is none.

The reasons are genuinely not interchangeable, so refusing what cannot be
interpreted is tempting and is the wrong trade. The failures are not
symmetric: wrongly honouring a withdrawal costs a claim the author can
republish, while wrongly ignoring one means continuing to publish something
its author has disowned. `subject-request` exists for a person asking to be
removed, and a consumer that declines to stop because the justification was
unfamiliar has chosen the failure that person cannot undo.

This is stated because the specification's silence on it was enough for an
implementer to get it backwards — the reference implementation first refused
these, and the vector `retraction-unknown-reason` now pins the correct
behaviour.

Only the author can retract. Disagreement by others is refutation.

#### A retraction only reaches a consumer that looks again

The obligations above — check `retracted`, discard cached copies, treat the
slot as absent — all begin the moment a consumer *learns* of the withdrawal.
Nothing so far obliges it to look, and a consumer that fetched a claim once and
cached it indefinitely satisfies every sentence above while serving a claim its
author disowned. That is the gap this section closes, because it is not a
theoretical one: `subject-request` exists for a person asking to be removed,
and their removal propagating depends entirely on someone re-querying.

The transport helps and does not solve it. These kinds are
parameterized-replaceable, so a relay holds only the latest event per slot: a
consumer that re-queries a slot gets the withdrawal, or nothing, rather than
the claim. Re-querying is therefore cheap and needs no separate retraction
feed. It still has to happen.

- A consumer **MUST** re-query a claim's slot before doing anything with a
  cached copy that is hard to undo — republishing it, citing it in a claim of
  its own, or presenting it as current.
- A consumer **MUST NOT** present a cached claim without the age of the cached
  copy. A reader cannot otherwise tell a claim that is current from one
  withdrawn months ago, and the two look identical.
- A consumer **SHOULD** re-query on a cadence rather than at a fixed expiry.
  A TTL says when a copy becomes untrustworthy, which is not knowable; a cadence
  bounds how long a withdrawal can go unnoticed, which is the actual quantity
  anyone cares about.

Deliberately no number. A cadence that suits an interactive client and one that
suits an archival mirror are different, and a figure here would be obeyed by
implementations it does not fit and ignored by the rest. State the cadence in
the node descriptor instead, where a peer can read it and decide what your
copies are worth.

This document's own publisher meets these by construction rather than by
policy, which is worth stating so it is not mistaken for diligence: its
federation ingest re-subscribes each session with a time-bounded filter, so
every session reads the current contents of each slot, and a withdrawn claim
arrives as a retraction or does not arrive at all.

## Reproducibility

#### Committing to an enumerated set

An enumeration has a problem the other claim shapes do not: it can have
thousands of contributing inputs, so `inputFingerprints` cannot carry them — an
event listing 12,645 company numbers is not an event. Yet a count is precisely
the shape a reader holding the same source most needs to check, and without
something they can recount, get a different number, and have no way to see
*which* members differ.

`method.enumeratedSetDigest` MAY carry the SHA-256, as lowercase hex, of the
enumeration's member identifiers **sorted and joined with `\n`**. Sorting is
what makes it a property of the set rather than of the order a source happened
to yield: two implementations reading one register in different orders **MUST**
produce the same digest, or it reports differences that do not exist.

It is a commitment, not a disclosure. A consumer without the underlying data
cannot verify it and **MUST NOT** treat its presence as evidence of anything;
a consumer with the same stated boundary recomputes it and compares one value.

A conforming implementation **MUST** treat a present-but-malformed digest as a
rejection rather than ignore it: a reader comparing their own value against one
that cannot match anything concludes their data differs, which is worse than
carrying no commitment at all. The reference vector `enumeration-census`
publishes its members as test data — unsorted, so an implementation that skips
the sort fails the vector instead of passing by luck — while the event itself
carries only the digest.

It is deliberately its OWN field rather than a convention layered onto
`inputFingerprints`, which means per-input hashes. A consumer that already
implements `inputFingerprints` and met a set commitment there would compare it
against individual evidence hashes and conclude, wrongly, that it holds none of
the same evidence.

`method.inputFingerprints` MAY carry hashes of the contributing evidence, sorted.
Its purpose is to let a consumer answer *"do I hold the same evidence?"* without
either party revealing content or sources.

A fingerprint **MUST** be computed only over facts that make an input *the same
input* to another party — typically subject, attribute, value and timestamp.
Implementation-local identifiers **MUST NOT** be included: two clients ingesting
the same upstream record assign their own ids, and including them makes identical
evidence fingerprint differently, defeating the only purpose fingerprints have.

#### Evidence files

When a contributing input is a file (a captured page, a picture, a document),
its fingerprint is the full SHA-256 of the file's bytes, as 64 lowercase hex
characters. The bytes are the input. Two parties holding the same file compute
the same fingerprint, and that is what makes it comparable. A file fingerprint
and a fact fingerprint (32 hex) never collide by construction, so a consumer
can tell them apart by length.

A file fingerprint confirms a guess: anyone who can obtain the same file can
confirm it was used. A publisher **MUST NOT** fingerprint files from a source
that needs protecting.

#### Timestamp proofs

`method.inputTimestamps` **MAY** map fingerprints that appear in
`inputFingerprints` to OpenTimestamps proofs: base64 of a detached `.ots` file
whose file digest is that SHA-256. A proof shows the input existed no later
than its attestation. The proof may be pending, naming the calendar that will
complete it, or complete, naming a Bitcoin block.

- A proof **MUST NOT** affect derived weight. Existence by a moment is about
  the input, not the claim, and weighting it would invite stamping as a
  ritual.
- A key with no matching fingerprint **MUST** be treated as malformed, the same
  as a malformed `enumeratedSetDigest`. A proof for an input the claim does not
  name is either an error or an attempt to borrow credibility.
- A consumer **MAY** verify or upgrade a proof. A proof that fails to verify
  says nothing about the claim, only about that proof.
- Publishers **SHOULD** keep proofs small: one per file, not one per calendar
  answer.

### Independence

Fingerprints allow the question that makes agreement meaningful:

| Overlap with consumer's own evidence | Interpretation |
|---|---|
| none | independent — genuine corroboration |
| partial | partially informative |
| complete | **echo** — the same evidence reaching the same conclusion |
| not assessable | unknown |

An echo is agreement that adds nothing. Two clients that ingested the same public
dataset and reached the same conclusion are *one* piece of evidence counted
twice.

Echo is not a hypothetical. Measured against real sources: every record in the
Global LEI Index joined to the complete Norwegian company register on the
organisation number, 57,187 entities, agrees on postcode 91% of the time — and
that agreement is manufactured, not observed. An LEI issuer validates the
entity against its home register, so the two are one source restating another.
The proof is in what happens when the copying stops: records still being
revalidated disagree 2.96% of the time, while lapsed ones disagree 23.50%, a
7.9x difference on the same population. A consumer treating that 91% as
corroboration would be counting a copy as a second witness.


Consumers **SHOULD** treat `unknown` conservatively rather than optimistically.
Rewarding a publisher who supplies nothing checkable makes opacity the winning
strategy.

## Signature layers

A claim carries two signatures, and conflating them is the interoperability
mistake this section exists to prevent.

**The outer signature is the relay event.** Publishing to a public relay means
a standard event signed with secp256k1 under BIP-340. This is not a design
choice; it is the price of using infrastructure nobody in the network operates.

**The inner signature is over the claim content**, and it is algorithm-tagged:

```jsonc
"signature": {
  "alg": "ml-dsa-65",
  "pubkey": "<hex>",
  "sig": "<hex>"
}
```

`alg` is **REQUIRED**. Registered values:

```
ml-dsa-65     ML-DSA-65 (FIPS 204), post-quantum
ed25519       Ed25519 (RFC 8032)
ecdsa-p256    ECDSA over NIST P-256, SHA-256
secp256k1     secp256k1 with BIP-340 Schnorr
```

A verifier that does not implement an `alg` **MUST** treat the claim as
unverified rather than as invalid, and **MUST NOT** discard it — a claim it
cannot check is not a claim it can refute.

**No participant has to adopt another participant's curve.** Where one identity
must be shown to be the same party as another, the holder signs each key with
the other and retains both signatures; a verifier checks the pair. This needs
no registry, no server, and no agreement on a primitive — which is the property
a decentralised network should want. The construction is not this
specification's invention; it was contributed to resolve a live collision
between three curves in use across four independent implementations.

## Security considerations

**Sybil resistance is structural, not a mitigation.** Because weight derives from
method and independence derives from evidence overlap, there is no field an
attacker can set to inflate a claim. Running many clients over one data source
produces many echoes worth nothing, rather than manufactured consensus. This
property depends entirely on there being no self-asserted confidence, which is
why that prohibition is normative.

**Fingerprints are a confirmation oracle, not encryption.** They are
deterministic across publishers by necessity — a salted hash could not be
compared between parties — and deterministic hashing of low-entropy inputs is
brute-forceable. Anyone who can *guess* an input can confirm it was used.
Publishers **SHOULD NOT** publish fingerprints for claims derived from sensitive
or confidential sources.

**Claims about people deserve deliberation.** `subjectKind: "person"` marks a
claim about a named individual, broadcast to public relays, where being wrong is
not quietly correctable. Implementations **SHOULD** require an explicit,
per-claim decision before publishing one, rather than treating it as a default.
This NIP does not mandate the mechanism, only that publishing about a person
should not happen merely because nobody considered it.

**Relays are not trusted.** Signature verification is the consumer's
responsibility. A relay serving a payload whose signature does not verify is
either broken or hostile, and consumers **SHOULD** surface such rejections rather
than discarding them silently — a peer whose claims never verify is a fact worth
seeing.

**Verification does not imply trust.** A valid signature proves who published a
claim, not whether they are worth listening to. Trust lists, reputation, and
allow/deny policy are out of scope here and are correctly a separate concern.

## Reference implementation

An implementation, and an independent verifier written from this document rather
than from that implementation's source, exist at
<https://github.com/Jthora/starcom-app> (`scripts/verify-finding.mjs`).

The verifier deliberately imports no application code. If a document needs its
author's source tree to be usable, the source tree is the real specification and
the document is decoration.

**Independent implementations are actively wanted.** Everything above has so far
only been implemented twice by the same author, which means it has only ever been
tested against one set of assumptions.

## Conformance vectors

Signed example events, with their canonical forms, digests, and expected
outcomes, are published in [`vectors/`](vectors/README.md). They cover the
happy path, tampering, wrong-signer, the two spec violations that carry *valid*
signatures, coarse timing, and a unicode canonicalization edge case.

`scripts/conformance.mjs` is a reference consumer that imports no application
code — it reimplements every rule above from this document. It is intended to
be replaceable by yours.
