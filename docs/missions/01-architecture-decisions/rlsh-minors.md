# Map RS44 — Minors among RLSH: Starcom's features against the target

**Status:** mapped 2026-10-17; RS45–RS49 decided by the owner the same day; RS45 built, then superseded by RS49 (no scraped data); RS47 and RS48 built (roster.md, "Built, after the review of the law").

The target, adopted by the owner (D-RS, RS44), from what established groups do (Guardian Angels patrol at 16+,
Scouting's two-deep rule and no one-on-one contact, Red Cross and CERT age rules; research, not legal advice):

1. Patrols, and meetups with strangers: 18 or over; 16 inside an adult-led team.
2. Minors on charity and observing, with an adult present.
3. No private messages between an adult and a minor.
4. Never a minor's location.

## What Starcom has, and where it stands

| Feature | What it does | Against the target |
|---|---|---|
| **RLSH layer** (Hero Watch mode, `useGlobeRLSH`, `RLSHVisualizationService`; until RS49 an embedded dataset) | Was: 197 individuals from a scrape of the RLSH wiki, each at a city centroid, with name, image, "identity", team, foes, equipment, actions and the wiki's full text. | **Rule 4:** people described in the press as teens were placed by city; their ages now are not known. **Worse:** the wiki's own pages recorded harm to minors by some of those drawn as heroes. Nothing marked them. One record's "identity" field held a legal name. (Named details are kept off the repository, with the owner's legal notes.) |
| **Field missions** (Missions tab, `TakeMission`) | Anyone takes a field mission (naloxone in pockets, and so on), its limits agreed first. | **Rules 1–2:** no age question, unlike field adventures (RS37). |
| **Sealed chat** (`services/chat/sealedChat.ts`) | Direct and team messages, sealed by NIP-59. | **Rule 3:** an adult can message a minor privately; Starcom does not know either's age. |
| **Teams and invites** (`teamworkspace/teams`) | Teams on their own relays; invites, access requests. | **Rule 1:** an adult-led team is possible, but nothing says who leads or how old members are. |
| **Hero Watch's other layers** (lifeboats, IFRC, OCHA, field missions from Mecha Jono's grid) | Organisations and missions, never individuals. | No conflict found. |
| **Adventures** (RS37–RS43) | The age question, the warning, with-an-adult for minors, under 13 desk only. | Meets rules 1–2 for adventures. |

## What the plan has to settle

- **The records of harm to minors** first: drawn as heroes, and reachable by any minor who opens Hero Watch.
- **Places of individuals:** city points for people of unknown age, against rule 4.
- **The age question elsewhere:** field missions, and direct messages, ask nothing today.
- **What the dataset is for:** a wiki scrape is the wiki's account of people, not their own (MF4, "identity from the
  posts"); Starcom repeats it with their faces and cities.

## What is decided

| | Decision |
|---|---|
| RS45 | (2026-10-17.) **Records of harm to minors: removed now, by a conclusive check.** Not a name match against anything else: a record is flagged when its own page, about that hero, says a minor was harmed. A flag decides nothing alone: each waits on a decision, removed with the sentence, its source and its standard, or cleared with why. Being listed as RLSH buys no benefit of the doubt: a false status, or one worn as cover, is why every match stops the build. The owner, verbatim: "don't just kill off a RLSH just because of such a record… however… don't immediately assume that because they are RLSH that perhaps they get the benefit of the doubt." |
| RS46 | (2026-10-17.) **Individuals at their region, never a city.** A city only for someone who posts their own registration saying 18 or over (identity from their own posts, MF4). |
| RS47 | (2026-10-17.) **Field missions gated as adventures are:** the age question, the warning, "going with an adult" under 18; desk missions only under 13 and for AI agents. |
| RS48 | (2026-10-17.) **Minors: team chats only.** Someone who said 13–17 opens no one-to-one sealed chat, sending or receiving; team chats, seen by every member, stay. |
| RS49 | (2026-10-17.) **No scraped RLSH data:** until a data-share agreement with the RLSH wiki's owner, Starcom ships and fetches none. Heroes submit their own public profiles through NavCom. |

## Built, RS45 (2026-10-17), then RS49

- **RS45, first** (46a64122): three records whose own wiki pages state harm to a minor were removed (one
  conviction, one investigation, one arrest alleged, each recorded with its sentence, source and standard), one
  page about a hero harmed as a child was cleared, a check stopped the build until each flagged record had a
  decision, and the popup said nobody listed is vetted or endorsed.
- **RS49, the same day:** the owner chose no scraped data at all. The embedded dataset, the static-file and
  Wikipedia rungs are gone (the two registrations heroes submitted themselves, in `src/data/rlshRoles/`, are
  kept: they are their own); the RS45 check went with them,
  replaced by `scripts/guard-rlsh-sources.mjs` (in `guards` and the build), which fails if scraped RLSH data is
  shipped or fetched again. The layer draws no one until heroes submit their own profiles; its feed is "RLSH
  profile list, as heroes submit it through NavCom", and the popup says "A profile its hero submitted. Starcom has
  not vetted or endorsed anyone here."
- RS46 (region, never city) applies to submitted profiles when they come.
