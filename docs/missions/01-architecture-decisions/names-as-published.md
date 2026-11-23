# Decision D-NP — Names as published

*From Mecha Jono, 13 October 2026. The Interchange side is 3.13, published the same day (manifest event 2c10b614). No Mecha Jono desk names anyone until the operator switches it on, and the operator does that only after NavCom has its notice too.*

**Status:** decided by the operator, 13 October 2026: NP1 (b), NP2 (a), NP3 (b), NP4 (a), NP5 (b), the recommended set. What Starcom builds for them is below; until a desk is switched on, no note carries the tag and nothing changes on screen.

## What changes on the grid

Since 26 August every Mecha Jono desk holds back any item that names a person. Desk by desk, it will instead name a person as a cited source names them, in that source's role for them, with the source's link (the `r` tag). The desks: the World Desk (`world_note`), the Conflict Desk (`conflict_note`, and the War & Conflict Brief when it quotes such a line), the Declassified Desk (`declass_note`), Terminator Watch, Raver Watch (`raver_note`) and its scene news.

- **Never named,** whoever names them: a minor; a victim of crime; anyone hurt, rescued, missing or dead; the accused, unless a court, prosecutor or regulator names them in its own words.
- **Never published,** for anyone: a home address, a personal phone or email, a date of birth, an ID or account number, financial or health details, family members, a person's precise or real-time location.
- **`["t","names_people"]`** is on every note that names a person, from the first, and never on one that names no one.
- **Mecha Jono's compilations** (convergence cases, Zone digests, the missions built from them) never quote a named note; they count it and point at it with its `a` tag.
- **Unchanged:** `actor` tags are forces, groups and states, never a person; migrant incidents, fires, market prices, Hero Watch operations and Zone reports name no one; the card templates' `never` list ("a person's name or face") stands for Mecha Jono's videos and cards.

## What Starcom does with it today

A search of starcom-app at cc575eb6 found nothing in the intel intake (`useGlobeIntelReportPipeline.ts`, the marquee) that reads a note for people: a title is drawn as it comes. To be confirmed by whoever takes this record. Until a desk is switched on, no note carries the tag and no title names anyone, so nothing changes on screen.

## The questions, and what was decided

| # | Question | Options |
|---|---|---|
| NP1 | Intel Reports and IntelWeb: notes with `t=names_people` | (a) shown as any note, the source's link beside the title; (b) shown with a small "names a person, as [source] names them" label; (c) hidden by default, a setting shows them |
| NP2 | Starcom's own cards and clips (the capture pipeline Mecha Jono's videos use) | (a) leave tagged notes out of every card and clip until Mecha Jono's credits card exists (fix plan 2.8), as the card templates promise; (b) show the title, never a face |
| NP3 | Raver Watch (RAVER_WATCH_V1 says never a person) | (a) the Raver layer leaves out tagged notes; (b) it shows them (an artist or a promoter, as the outlet names them) and RAVER_WATCH_V1 is amended to say so |
| NP4 | Translation (D-ML, ML7) | (a) a tagged note is translated like any other, on the reader's device; (b) never published translated, reader-only, as `translate=reader-only` notes are |
| NP5 | Mission views and the NavCom adapter | (a) nothing to do: missions name no one; (b) assert it: a mission whose text carries a tagged note's words is refused |

**Decided (the operator, 13 Oct):** NP1 (b), NP2 (a), NP3 (b) with the spec amended (Raver Watch v1.7, published the same day), NP4 (a), NP5 (b). They keep every promise Starcom has made to readers while the names Mecha Jono may now publish are labelled where they appear.

## For Starcom to build

- **NP1:** in Intel Reports and IntelWeb, a note with `t=names_people` shows a small label, "names a person, as [source] names them", beside its title and source link.
- **NP2:** cards and clips (the capture pipeline) leave out tagged notes until Mecha Jono's closing credits card exists (its fix plan 2.8).
- **NP3:** the Raver layer shows tagged notes like any other.
- **NP4:** nothing: a tagged note is translated on the reader's device like any other.
- **NP5:** a mission view, and the NavCom adapter, refuse a mission whose text carries a tagged note's words (missions name no one today; this asserts it).

## Built, 24 October 2026

No note on The Record carries the tag yet (checked 23 October), so nothing changes on screen until a desk is
switched on. Tested on the kept notes of each desk with the tag added, as Mecha Jono will add it.

- **The tag** (`src/services/intel/namesPeople.ts`): read from the event's own `t` tags alone. The intel intake also
  takes `#words` from a note's text as hashtags, and a note that only writes "#names_people" is neither labelled nor
  left out. Every reader keeps it: Intel Reports, War & Conflict, Raver Watch, AI Watch, and Hero Watch, whose
  operations name no one (Mecha Jono), in case one ever does. `names_people` is not a kind of note (Raver and Hero
  Watch's unread-kind check).
- **NP1:** "names a person, as reuters.com names them" (the original source's host; "its source" without one) beside
  the title in the report panel, the dashboard's list, the globe's report popup and tooltip, the globe's note panel
  (War & Conflict, Raver Watch, AI Watch, Hero Watch notes) and IntelWeb's file and node panels. Translated with the
  other shared words (machine-drafted, as every locale is). IntelWeb never makes a hub of the tag, which would tie
  the notes that name people together as a group of their own.
- **NP2:** every list a card or clip prints from (each layer's share reports) and every featured block (and so every
  tour caption and end card) leaves the note out. The War & Conflict brief, on a card or in a tour, never makes one
  its theatre's "Most serious" line, though it still counts it: a count names no one. The share handle's description
  of a view leaves out any mark whose words quote a tagged note's title. Marks stay drawn: a glyph is neither a name
  nor a face. The in-app brief and panels show the note, labelled.
- **NP5:** each reader remembers a tagged note's title (four words or more) and sentences (six or more). A received
  package whose text carries one is refused (`carries-named-words`); the open missions view reads them again, for a
  note that arrived after its mission; Hero Watch's field missions are refused at reading and left out where they are
  placed; and a package Starcom sends to NavCom is refused when prepared and again when published. NavCom's
  observation adapter carries no free text (its fields are a fixed list), so it needed nothing.
