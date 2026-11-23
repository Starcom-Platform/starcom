# Decision D-LD — The Market Exchange becomes a lead desk (K10)

**Status:** decided 2026-10-13 (LD1–LD3, the owner's picks); building in the
order below. K10 of the critique audit said "the Market Exchange becomes a
lead desk and keeps its name" (`00-current-state/critique-audit.md`, section
9 and 9.1, which also lists the defects 5 and 6 left to it). K11's four
public-record feeds (`board-feeds.md`, D-BF) are its first content: on the
live site on 2026-10-13, 80 published reports were held and none routed to
an audience, while the feeds held 280 funding windows, two reward
programmes, 13 sanctions publications and three months of exclusions.

The board's three rules hold for every lead (`opportunityAudience.ts`): no
amount is attached to a statute; declared beats derived, and derived says
so; a statute is named only where the pattern reaches it. And nothing
locates a person: people in public lists are counted, never named (BF2).

## What is there (read from the code, 2026-10-13)

- Two stat cards, "Active Listings" (published reports) and "Draft
  Reports"; a shopping-cart icon on "Publish a report"; "Loading Market
  Data…". The marketplace's words (audit defect 6).
- The board: the feed strip (BF5), then one card per routed report, in
  storage order, filtered by one audience at a time. A card shows its title,
  the pattern, the statute and decider, and its audiences; no record date,
  publisher, jurisdiction or link (audit defect 5).

## Decisions

| | Decision |
|---|---|
| LD1 | (2026-10-13.) **Feeds and reports in one list.** Each funding window, sanctions publication, exclusion month and reward programme is a lead beside each routed report; one audience filter covers all; the strip becomes the desk's summary line; a lead's detail opens beside the list. |
| LD2 | (2026-10-13.) **Four views beside the list:** a deadline timeline (leads with a closing date, by their real dates, closed ones greyed); a matrix of counts by kind and audience, which also filters; leads grouped by who decides, each group with its programme's link; a map of lead counts by country or US state, for organisations and places only. |
| LD3 | (2026-10-13.) **Start a case from a lead**, seeded with its record and links as sources (as Diplomacy's drawer does, DP7), opened in Cases. |

## Build plan

Each step: failing tests first; mutations; the affected tests; a build; a
probe in a browser on the build; push; the deploy checked live.

1. **Leads** (LD1): one model for a lead, from a routed report or a feed
   item: its kind, title, record date, closing date where there is one,
   source and link, place, audiences and whose word they are, statute and
   decider where named. Pure and tested.
2. **The desk** (LD1, defects 5 and 6): the summary line in place of the
   stat cards; the list, newest or soonest first, filtered by several
   audiences at once; the detail beside it, a report's with its record
   date, publisher, jurisdiction, link and the phrase that matched; the
   marketplace's words gone.
3. **Start a case** (LD3).
4. **The deadline timeline and the matrix** (LD2).
5. **Grouped by who decides, and the map** (LD2).

## Built

- **Step 1** (6e1d9c2a): `leads.ts`, a lead of each kind in one shape; its
  places are a report's jurisdictions, a publication's named organisations'
  countries and a month's named businesses' states, never people.
- **Step 2** (1a04c7d2, dd87ab53; live): the desk. The summary line in
  place of the strip's tiles; the list a hundred at a time, newest first or
  soonest to close; several audiences at once; the detail beside the list,
  sticky, and under its row on a phone; a report's date, publisher (Mecha
  Jono by name, another key shortened), places, the words that routed it
  marked (`routing.matched`), its law and decider, and a link to it in
  Intel. One line of reports held and drafts where two stat cards stood;
  "Active Listings", the cart and "Loading Market Data…" gone; the tabs are
  "Lead desk" and "Publish a report" with the stamp.
- **Step 3** (90480152; live): "Start a case" on any lead (`leadCase.ts`),
  its pages as sources; shown only where the app's router can open Cases.
  On the build: a case from 13 Oct's OFAC publication with its two pages.
- **Step 4** (2126f75c, e77b8022, 8610f7b0; live): Deadlines, ninety days of
  closing dates as a strip of dots, then grouped by when they close; Counts,
  leads by kind and audience, each count a filter, the kind a chip.
- **Step 5** (eaee86ad, 9cdff3a2): By decider, each group with its
  programme's page where it has one; Map, the globe's own outlines shaded by
  the leads naming each country, the US by state, a place a chip
  (`leadPlaces.ts`). On the build: 33 countries named by 15 leads.

- **Funding windows moved to a Grants tab** (2026-10-16, decision D-MF,
  MF5, `missions-first-visit.md`): grants are not missions, nor leads to
  work. The desk now holds reports, rewards, sanctions and exclusions, newest
  first; the deadline timeline and "Closing soonest" went with the grants,
  since only a funding window closes. LD1 and LD2 stand for what remains.

## What it may pay (critique C12, CR2)

The owner, 2026-10-16: "It takes more than three seconds to see anything like
money … That must come first for every listing." CR2 narrows the board's
rule 1 and BF3: the desk shows an amount a programme itself publishes, quoted
and sourced, first and prominent, never an estimate of Starcom's; where a
programme publishes none, it says who decides. The owner's picks for how:

| | Decision |
|---|---|
| CR2a | (2026-10-16.) **Reward programmes' amounts come through Mecha Jono only.** The FBI and Rewards for Justice state an amount only in each notice's prose, beside a person's name (FBI 1,264 notices, about 4.2 MB to read; Rewards for Justice 288, about 0.7 MB). Mecha Jono reads them and posts counts by "up to" amount, never a name; the desk shows nothing until they do. |
| CR2b | (2026-10-16.) **Grants.gov's award ceilings come through Mecha Jono.** Its search gives no amounts; a ceiling needs a request per opportunity. Mecha Jono posts them by opportunity number. |
| CR2c | (2026-10-16.) **A statute flag says what its programme's own page says,** word for word and linked, with who decides, that Starcom promises nothing, and that it is not legal advice: "whatever we're allowed to do … zero liability and zero legal risk". Never a figure of Starcom's. DOJ's False Claims Act page names no share: "Private citizens who successfully bring qui tam actions may receive a portion of the government's recovery." |

**Built** (2026-10-16): every row leads, under its title, with what it may
pay (`services/exchange/payLine.ts`): a programme's own words in the
programme's green, linked; who decides, muted, where nothing is published
here; "Pays nothing: a public record to work from" for sanctions and
exclusions. The detail heads with "What it may pay" and the same words, the
link, and "The programme decides whether anything is paid, and how much.
Starcom promises nothing, and this is not legal advice." The reader for
Mecha Jono's notes (`feeds/amountNotes.ts`, `t=reward_amounts` and
`t=award_amounts`, kind 30023 from their keys) is in place, read once a
visit; the note proposing them goes to Mecha Jono once the owner approves its
text.

## Found while building

- **About 490 px stood above the first lead** on the first build: the
  heading the tab repeats went, and the filters are compact.
- **The deadline strip was drawn 1,000 units wide in a 530 px column**: its
  dates read at about 6 px. Drawn 560 wide, a tick a fortnight.
- **The map was one filled disc.** d3 draws on the sphere and reads a ring's
  winding as which side is inside; the territories are wound as GeoJSON's
  RFC 7946 winds them, so each country read as the world without it. A
  polygon covering more than a hemisphere has its rings turned.
- **A routing test passed for the wrong reason:** "worked out here …, not
  stated by the publisher" also matches /stated by the publisher/. Exact
  now.
- **Grants.gov lists one opportunity closing on 5 Oct 2076**; the desk says
  so as Grants.gov does.
