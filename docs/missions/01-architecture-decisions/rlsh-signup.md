# RLSH sign-up by NavCom's card (D-RF)

UX plan phase F ([`../04-plan/ux-expansion-plan-2026-11.md`](../04-plan/ux-expansion-plan-2026-11.md)), OR7, OR19,
OR35–OR38: a hero joins RLSH; "the method is NavCom's (OR38): RLSH and NavCom share one system for profiles and for
how they are shown, so F starts from NavCom's sign-up and profile display and reuses them; any difference goes to
the owner."

## What NavCom has (read 10 Nov 2026, read-only, with the owner's leave)
No sign-up, no account, no approval and no review queue, each refused by name (navcom-app docs/product/profiles.md §1:
"An operator who publishes a card has registered"; docs/declined.md; docs/build-order.md: "Never: a review queue
with a decider"). A profile is a public card: kind 10911, replaceable, signed by a separate contact key (never the
operational key), its content limited to `callsign`, `region`, `doing`, `lightning` and refused whole if it carries
anything else; activity terms (`t`, up to 3, from a closed placeholder list, "an activity, never a qualification"),
links (NIP-39 `i`, up to 12), places as `["area", level, id, name]` (the Zone ladder in Starcom's ZSP 2.0 ids), a
NIP-32 label for its public roster (`navcom:public`). Shown with the key's print beside the callsign and "Nobody has
checked this card"; nothing derived. Withdrawn by a NIP-09 deletion (kind 5, `a` 10911:<pubkey>:, `k` 10911), the key
kept or thrown away, the copy saying it "can't unshare what's already out". Teams are kept off every card (a published
roster is a target list); crews are designed and not reachable, a crew card "one person's word", no roster, no count.
NavCom has no age gate, by design: it holds no one's age.

The plan's five steps assumed more than NavCom has: a Join flow with an age step, a team relay's review queue, and
Starcom's signed list of approvals.

## Decisions (the owner, 10 Nov 2026)
| | |
|---|---|
| **RF1** | **An RLSH profile is NavCom's card.** Kind 10911 under a contact key of its own, the alias as its callsign, its Zone as an `area` tag, found on Starcom by a label of its own (`l` `starcom:rlsh`); no review queue and no approval list. Withdrawn as NavCom withdraws a card, in NavCom's honest words. One profile system for both, as OR38 meant; the card also shows on NavCom's boards unless the person keeps it to "address only". |
| **RF2** | **No team on a profile; a crew card later.** Teams stay off every public profile and no roster is published (Starcom's own rule: RLSH draws places, never a person). A team may later publish a crew card, NavCom's "one person's word". OR36's team field gives way. |
| **RF3** | **Starcom's age rule stays.** In Starcom, the age step (RS37–RS44: no key under 13) comes before any key or card is made, as it does now; NavCom's age-blind choice holds for NavCom. |
| **RF4** | **A hero's role is NavCom's activity terms.** Up to 3 from the shared list, as tags; the list as it stands covers RLSH work, so Starcom asks for no new term (RF5). |
| **RF5** | **Said to NavCom and Mecha Jono** (the owner, 10 Nov): on Mecha Jono's handoff thread (48e8a524-1595) and in Starcom's interchange spec ("RLSH profiles are NavCom's card"). NavCom's `DOES` list covers RLSH work as it stands (patrol, supplies, carries a kit, transport, comms, search, legal observer, welfare checks, and support work): Starcom asks for no new terms. Asked: that NavCom's readers keep a card with an `l` tag they do not know. |
| **RF6** | **A list in the RLSH panel** (the owner, 10 Nov): the cards labelled `starcom:rlsh`, alphabetical as NavCom's /who/, each callsign with its key print, Zone, activity terms and "Nobody has checked this card"; no counts, nothing on the globe. |
| **RF7** | **Three ways to be found** (the owner, 10 Nov): Starcom's RLSH list (the default, `l starcom:rlsh`), also navcom.app (`l navcom:public` too), or only by its address (no label: listed nowhere, still published, and the copy says so). |

## Built
**Steps 1 and 2, 10 Nov 2026: the card and the list.**
- **The card** (`src/services/rlsh/rlshCard.ts`): NavCom's card written and read as NavCom does: content `callsign`,
  `region: "earth"`, `doing` (140 at most) and nothing else, refused whole otherwise; the Zone as
  `["area", "zone", id, name]`; up to three of NavCom's terms (its list copied as it stands, an unknown term dropped);
  `l starcom:rlsh`, and `l navcom:public` too, or neither (RF7). The key's print as NavCom prints it.
- **The key** (`contactKey.ts`): made in this browser only after the age step (RF3), never the person's Starcom key.
  Kept on withdrawal unless the person throws it away.
- **Publishing** (`src/services/publishing/rlshCards.ts`): through the review. How old is asked first; under 13
  nothing is made. The review shows who can find the card and that the card's own key signs it.
  Sent by `src/services/rlsh/sendCard.ts`, listed in `guard-publish-review.mjs` with its reason, to `rlshCardRelays()`:
  the public relays Starcom and NavCom share. An AI agent's card says so by its own alias (MX14), never the
  person's Starcom name. Withdrawal is NavCom's NIP-09 deletion, in NavCom's words.
- **The list** (`rlshRoster.ts`): the cards labelled `starcom:rlsh` and the deletions of cards, one card to a key,
  the newest standing, a deletion withdrawing every version up to it. Alphabetical by alias, with the key's print,
  Zone, terms and "Nobody has checked this card". Nobody counted, nothing on the globe (RF6).
- **The panel** (`src/components/Rlsh/RlshPanel.tsx`): "Your card" and "Heroes". Opened by the RLSH rail's card
  button, a marker's "Your RLSH card" and the palette. "A crew" is not offered until crew cards (RF2). A Zone comes
  only from ZSP 2.0's list. Words in six languages.
- **The form elsewhere is gone:** the Formbricks address, the marker's form link and the rail's link to it.
