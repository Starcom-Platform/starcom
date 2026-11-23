# What a report to Starcom can and cannot achieve

Written for someone outside this project — a relay operator carrying our
events, a journalist checking a claim, or a person who believes something we
published is about them and is wrong.

It states limits before capabilities, because a policy that leads with what it
can do and buries what it cannot is the kind people stop trusting the second
they find the gap themselves.

## What Starcom is, structurally

Starcom runs **no server** and holds **no account**. The application is a
client. It signs with a key held by the person running it and publishes to
Nostr relays. Most are public relays that other people operate. One, The Record
(record.cosmiccodex.app), is the first of the registered Starcom relay nodes;
more are to join that list. None of them is a server of the application.

Three consequences follow, and they are not disclaimers — they are facts about
the architecture that a reader can verify from the source:

- **We cannot delete anything from the relays.** A relay someone else
  operates takes no instructions from us, and a note removed from one relay
  is not removed from the others that hold a copy.
- **We cannot prevent anyone publishing in our format.** The event kinds and
  the specification are public, deliberately. Anybody can produce a
  well-formed Starcom-shaped event, and we keep no register of who may publish
  and have no mechanism that could enforce one.
- **We cannot tell you who somebody is.** We hold no identity records, no
  per-key history, and no profile of any publisher. There is nothing to
  disclose because there is nothing kept.

## What we can actually do

**Retract our own claims.** A published finding lives in a replaceable slot;
a retraction is published to the same slot, so any consumer that queries it
receives the withdrawal instead of the claim. This is a real mechanism, not a
promise, and it is the main thing a report to us can cause.

Its honest limit: a consumer that already fetched and cached the original will
not learn of the retraction unless it queries again. That is a property of the
transport rather than something we can fix from here.

**Correct the record in public.** A retraction is itself a signed event,
published to the same replaceable slot as the claim it withdraws — so it is
public in exactly the way the claim was. It carries a reason and a timestamp
always, and a note saying what was wrong where the publisher wrote one.

We deliberately keep no separate corrections page. A hand-maintained list on
this domain would be a second copy of the relay record, and the day it fell
behind it would be a document understating what we had corrected. The relay
record is the log: query the slot, named in `/.well-known/starcom-node.json`,
and you get the current state — the same answer whoever you ask.

Its honest limit: replacement means the retraction takes the claim's place, so
the withdrawn text is not preserved by this mechanism. You can establish that a
claim was withdrawn, when, and why. You cannot always recover what it said.

**Tell you whether the project itself published something.** A claim carries
two signatures, and they prove different things:

- The **outer Nostr signature** proves which node relayed it. Check it against
  `identity.pubkey` in `/.well-known/starcom-node.json`.
- The **inner ML-DSA-65 signature** proves which key attested the content, and
  that is the one this whole format rests on. Check it against
  `identity.claimKeys` in the same document.

Only the first of those was publishable until 2026-09-08. The claim key rode
inside every event, so the inner signature could be confirmed self-consistent
and never confirmed as *ours* — a reader could verify a claim was signed by
whoever signed it, which is not a check. This section previously promised more
than that. The keys are now published, and both layers can be checked.

**One command, if you would rather not write code:**

```
node scripts/verify-claim.mjs --subject <ref> --attribute <attribute>
```

It reads this node's descriptor, follows it to the relays, fetches the claim,
checks both signatures, says whether the attesting key is one we admit to, and
prints the weight its disclosed method derives. It needs no key of yours and no
account. Point `--descriptor` at another node to check that node instead.

What it does need is this repository: `git clone`, `npm install`, then the
command above. That is a real barrier and we would rather it were not there —
saying so is better than describing it as installing nothing.

What it will not tell you is that a claim is TRUE. A valid signature proves
authorship and nothing else.

Its limit is the half people get wrong, so we state it rather than let it be
inferred: **the absence of that signature proves nothing.** The application
ships no key of ours; it signs with a secret the operator supplies or a browser
extension holds, and refuses to publish with neither. So a
finding from a good-faith operator is *also* not signed by the node key, and by
signature alone it is indistinguishable from a hostile forgery in our format.
We cannot separate those two, and we will not claim to.

We also cannot hand you a list of legitimate operators. That is a refusal, not
a gap: `R-1` in `/.well-known/ein-refusals.json` forbids gating anything on a
credential, and a roster functions as one — appearing on it would read as
endorsement, which would make us answerable for claims we did not make and have
no way to check.

**What to check instead of who signed it.** Every claim carries the method that
produced it, and weight is derived from that method by whoever reads it — never
asserted by whoever published it. A forgery must therefore either disclose a
real method, which is checkable and largely self-defeating, or disclose none,
in which case it derives almost no weight. That is the part of the design doing
the work an identity check looks like it is doing.

**Stop doing something.** Our standing refusals are published at
`/.well-known/ein-refusals.json`, each with the reason behind it. If we are
doing something the list should have covered, that is worth telling us.

## For relay operators

We would rather you could decline exactly what you object to than drop us
whole, so:

- Our events carry `t: attested-claim` and a `schema_version` tag, and
  findings carry `e` tags naming the events they rest on.
- Kinds we publish are listed in `/.well-known/starcom-node.json`.
- What we refuse to carry or emit is at `/.well-known/ein-refusals.json`.

If any of that is insufficient to write one filter rule, tell us what would be
and we will add it. A client that is hard to filter precisely gets filtered
bluntly, and that is our problem to fix rather than yours.

## If you believe a published claim about you is wrong

Contact us on the key in `security.txt`. Say which claim, and if you can, the
event id.

What will happen: we will look. If it is ours and it is wrong, we retract it
and log the correction. If it is not ours, we will tell you what we can
establish about where it came from, which may be little.

What will not happen: we cannot make it unpublished, and we will not tell you
we can.

## Not a bug bounty

There is no reward programme. Reports are still wanted — particularly anything
showing that a claim we make about our own behaviour is false, since a
capability that does not do what it says is the failure mode this project
takes most seriously.

---

*Last reviewed 2026-09-06. If this document and the source disagree, the
source is correct and this file is the bug.*
