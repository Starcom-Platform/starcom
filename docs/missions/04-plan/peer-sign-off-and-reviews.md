# Peer sign-off and reviews

Written 2026-09-26 in answer to decision D3. Publishing is not verification,
and no approval is required. But people who want it should be able to have
their team check a draft first, so that it goes out carrying verification from
several peers instead of one person. Reviews should also be addable after
publishing. The question was whether Nostr can do this at all.

**Short answer: yes, with limits.**

- **Reviews after publishing** can be built from standard NIPs today.
- **Team sign-off** is practical as several signed events tied to the exact
  item. A Nostr event carries exactly one signature, so it can never be a
  single signature from several people.

## What Starcom already has

Verification by evidence is specified and mostly built. None of it is a review
or a sign-off, but it is what a sign-off should lean on.

- **Attested claims** (kind 30082). A claim carries its method, its modality and
  its weak backing, and never a confidence figure
  (`docs/spec/nip-draft-attested-claims.md:43-149`,
  `src/services/intel/findings/attestation.ts`).
- **Case adjudication.** A case's verdict (substantiated, unsubstantiated or
  inconclusive) is published with its counts. Contradictions nobody explained
  are carried as weak backing (`caseAdjudication.ts:108-240`).
- **Refutations** (kind 30083). A refutation must carry its own method. Contested
  state compares weights, never counts, and needs a 1.5× margin
  (`refutation.ts:172-179`).
- **Independence.** Peer findings are sorted into independent, partial overlap,
  echo or unknown (`foreignFinding.ts:42-104`).
- **Corroboration** across distinct feeds, and **source grading** from A to F
  (`missionCorroboration.ts`, `reliabilityWeight.ts`).
- **Replies to Mission Packages** are read but cannot be sent: the spec says so,
  and the writing helper was removed (`MissionPackageReplyIngest.ts`,
  `missionPackageThread.ts:120-125`).
- **In NavCom:** endorsements (kinds 30912–30914) and additive directory
  corrections (30911) are built. NavCom's attestation object follows the rule
  "Provenance, never a count" (`navcom-app/docs/attestation.md:47-49`).
- **In the intel repository:** a verification rubric where "verified" needs
  corroboration from at least two sources
  (`intel/00_admin/governance/verification_rubric.md:44-46`).

**Missing:** comments, reactions, labels and endorsements on Starcom items; any
way to review a globe intel report; and any sign-off before publishing. The wire
format allows exactly one inner signature.

## Rules a design must keep

- **Provenance, never a score.** Refusal R-6 rules out any trust or scoring API,
  and the weight derivation has no author term. Several signers cannot add
  weight. A sign-off is shown as who checked what, never as a number.
- **Evidence makes verification.** A review that states its method (what the
  reviewer checked) means more than one that does not. The display says which is
  which.
- **Locked Decision #7.** Mission Packages never carry analyst identities: the
  author is fixed as "Starcom" (`MissionPackageBuilder.ts:176`). A sign-off
  names its reviewers' keys. On reports and findings that adds nothing new,
  because their authors already sign them. On a Mission Package it would widen
  what #7 allows. See question Q3 below.

## What Nostr offers

| Need | Standard | Kind | Status | In our nostr-tools (2.16) |
|---|---|---|---|---|
| A verdict pinned to an item | [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) labels | 1985 | draft, optional | kind constant only |
| A discussion thread | [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) comments | 1111 | draft, optional | no; arrives in 2.23 |
| A quick reaction | [NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) | 7 | draft, optional | yes |
| Per-version approvals, as a pattern | [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) approval events | 4550 | unrecommended: "try NIP-29 instead" | constants only |
| Threshold team keys | FROST / MuSig2 (e.g. FROSTR, Promenade) | — | NIP drafts not merged | — |

Three facts settle the design:

- **One signature per event.** NIP-01 gives an event one `sig`, and strfry
  strips unknown top-level fields.
- **Threshold signatures hide who signed.** FROSTR says its output is "a
  standard BIP-340 Schnorr signature - indistinguishable from one produced by a
  single signer". They prove "the team signed", never which teammates, and they
  need a new team key after every roster change. They are the wrong tool here.
- **Approvals must pin a version.** NIP-72 says an approval "MUST have the
  specific version of the event". Without that, a verdict silently carries over
  to a later edit of an addressable item.

## Reviews after publishing

Offer four kinds of review, and label each by what backs it:

| Review | Built from | What it says | Shown as |
|---|---|---|---|
| **Comment** | NIP-22, kind 1111 | Free text, threaded | Discussion |
| **Verdict** | NIP-32, kind 1985: namespace `starcom.review`; labels `confirmed`, `disputed` or `needs-evidence`; an `a` tag for the item and an `e` tag for the exact version; the reasoning in `content` | A judgement, with or without reasons | "Disputed by 2 (no method stated)" |
| **Corroboration** | Kind 30082, the existing attested claim, pointing at the item | Independent evidence, with its method | "Corroborated by 1 independent source" |
| **Refutation** | Kind 30083, which already exists | Contrary evidence, with its method | The existing contested state |

- **The item's page** gains a reviews panel that reads all four kinds. The
  first reviews come from the internal relay, then from public relays.
- **Replies to packages** are sent again, as NIP-22 comments.
- **The risk** is throwaway keys posting fake verdicts. The panel shows who
  wrote each one (a teammate, a registered intern, or an unknown key) as
  provenance, not as weight.

**Size:** M, 4–6 days. NIP-22 events can be built by hand; upgrading nostr-tools
is optional.

## Team sign-off before publishing

**Revised 2026-09-26** after the post-quantum audit
([`../00-current-state/post-quantum.md`](../00-current-state/post-quantum.md)).
Post-quantum signing is a directive priority, and Starcom already has a
post-quantum signing stack that is independently verified: ML-DSA-65 on every
finding, claim and manifest, 72 conformance vectors, and 398 passing tests.
The earlier recommendation, standard labels signed only with Schnorr, did not
use it.

**The flow in every option:**
1. The author freezes the draft.
2. The draft goes to the team privately, as a bundle over the team's relay.
3. Each reviewer checks that exact version and signs.
4. The item is published, and anyone can check who signed which version.

Any edit voids the sign-offs, because the version is pinned by a digest of the
content. It is not pinned by the event id: the outbox re-signs events with a
new timestamp when it sends them, so the id is not stable.

| | What a sign-off is | Post-quantum | Who can check it | Size |
|---|---|---|---|---|
| **P1. A post-quantum attested claim** | The reviewer publishes an attested claim (kind 30082) about the exact item. Subject: the item's address. Attribute: `review:<content digest>`. Value: the verdict (checked, confirmed, disputed, needs evidence). **Method: what they checked**, which is required. Signed with ML-DSA-65 inside, Schnorr outside. | Yes, fully | Starcom, Navcom (which already reads 30082) and the repository's independent verifiers, once new vectors are added | M–L, 6–9 days |
| **P2. A hybrid label** | A standard NIP-32 label whose content carries an ML-DSA-65 signature over the item's content digest | Inner yes, outer no | Any Nostr client sees the label; Starcom verifies the post-quantum signature | M, 4–6 days |
| **P3. Co-signatures in the manifest** | Mission Packages carry a list of ML-DSA-65 signatures over the same manifest digest | Yes | Starcom and Navcom, after a change to the shared format | L, about 2 weeks plus Navcom's agreement |
| **P4. Standard labels only** (the earlier S1) | NIP-32 labels signed with Schnorr | No | Any Nostr client | M, 4–6 days |

**Recommendation: P1.**
- **It is how Starcom already defines verification:** evidence, with a stated
  method, signed post-quantum.
- **It reuses what is proven:** `signFinding`, the broadcast and verification
  paths, the conformance suite, and the desktop signer.
- **Reviews after publishing use the same kinds.** Corroboration and refutation
  are already 30082 and 30083.
- **Echoes count as nothing.** The independence assessment gives a reviewer who
  only re-read the author's own sources zero weight. Only new evidence counts,
  which is "provenance, never a score".

**Against.** P1 needs a change to the NIP: a new subject kind for "a published
item". Other Nostr clients will not show these sign-offs. P2 is lighter and
visible everywhere, at the cost of a classical outer layer and no method field
of its own.

**Prerequisites for any post-quantum option,** from the audit:

| Fix | Why | Size |
|---|---|---|
| **Cross-signing:** a person's Nostr key and ML-DSA key sign each other, and the pair is published | Without it, a post-quantum sign-off proves only "this key signed", not whose key it is | M |
| **One canonical form,** sorted by code unit everywhere | Findings use locale-dependent sorting, and manifests do not | S–M |
| **No Ed25519 downgrade** in manifest verification, and the outer and inner keys linked | Today a classical signature passes | S |
| **Honest algorithm labels,** so Ed25519 is not called ML-DSA | The team member key and two services misstate it | S |
| **A new subject kind** in the NIP and the stores, plus conformance vectors for reviews | P1 itself | M |

## Decided 2026-09-26

- **Reviews after publishing:** comments and verdicts first, shown in one panel
  with the existing corroboration and refutation.
- **Team sign-off:** P1, a post-quantum attested claim. The post-quantum
  prerequisites come first.
- **Scope:** sign-offs apply to reports and findings only. Mission Packages stay
  free of analyst keys, keeping Locked Decision #7.
