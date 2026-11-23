# Decision D-BF — Four public-record feeds for the Opportunity Board (K11)

**Status:** decided 2026-10-13 (BF1–BF6, the owner's picks, each the
recommended option); building in the order below. K11 of the critique audit
(`00-current-state/critique-audit.md`, section 9.1 and the decisions table)
chose "all four: HHS-OIG exclusions, sanctions changes by programme, published
reward notices, real funding deadlines". The board's three rules
(`src/services/exchange/opportunityAudience.ts`) bind every feed: no amount is
ever attached to a statute; declared beats derived, and derived says so; a
statute is named only where the pattern reaches it. And the board never
locates a person.

## The sources, measured (2026-10-13)

| Feed | Source | Size, cadence | Read by a browser? | People in it |
|---|---|---|---|---|
| HHS-OIG exclusions | LEIE, `oig.hhs.gov/exclusions/downloadables/` | Full list 10.8 MB; monthly supplement 19 KB (September: 145 rows) | No (no CORS header) | 136 of September's 145 are individuals, each with date of birth and address |
| Sanctions changes | OFAC Sanctions List Service | SDN list 5.7 MB, 19,432 entries, 74 programmes; a delta file per publication, 74 KB on 13 Oct; publications every few days | The change history (JSON) yes; the files no (S3 sends no CORS header) | 7,501 of 19,432 entries are individuals |
| Reward notices | FBI Wanted API; Rewards for Justice (WordPress API) | FBI 1,263 notices; 35 of the first 50 state a reward | Yes, both | FBI's list includes missing people and victims, with physical descriptions |
| Funding deadlines | Grants.gov `search2` (a plain-text POST: the JSON preflight is refused) | 1,467 posted or forecast | Yes | None |

Challenge.gov's API answers 404; SAM.gov needs a key.

## Decisions

| | Decision |
|---|---|
| BF1 | (2026-10-13.) **Direct where the source allows, Mecha Jono where it does not.** The browser reads FBI, Rewards for Justice and Grants.gov itself. LEIE (monthly) and OFAC (each publication) reach Starcom as Mecha Jono's notes on The Record, with an on-demand file as fallback, as DP17 does for EIA. Nothing is carried in the app. |
| BF2 | (2026-10-13.) **People as counts only.** Organisations, vessels and aircraft by name with their record; people only as counts, by state, profession, exclusion basis or sanctions programme, each count linking to the official search. No name, date of birth, address, NPI or ID number of a person is shown. |
| BF3 | (2026-10-13.) **Reward programmes, not people.** Each programme with how many notices it has open, by kind; what it pays for, who decides, and its tip line. No names, photos or descriptions, and never a missing person or a victim. No amount. |
| BF4 | (2026-10-13.) **Grants.gov now:** posted and forecast opportunities on a timeline by their real closing dates, filtered to the board's audiences. SAM.gov later, through Mecha Jono, since it needs a key. |
| BF5 | (2026-10-13.) **A strip above the leads:** four compact summaries at the top of the Opportunity Board, each opening to its list. K10 later makes the board a lead desk. |
| BF6 | (2026-10-13.) **Five more audiences:** compliance/AML analyst, sanctions researcher, insurance SIU investigator, academic researcher, public-interest attorney (Mecha Jono declares `audience:public_interest_attorney`). |
| BF7 | (2026-10-13, after step 5.) **A professional practice in its owner's name is counted, not named.** An LEIE business whose name carries a professional suffix ("…, MD, INC", "… PC") is counted with the month's practices; a business on a row that names a person is the person's, and counted. The owner kept the call made under BF2. |

## Build plan

Each step: failing tests first; mutations; the affected tests; a build; a
probe in a browser on the build; push; the deploy checked live.

1. **Audiences** (BF6): the five archetypes and their labels; Mecha Jono's
   `public_interest_attorney` read as declared.
2. **The strip** (BF5) and **funding windows** (BF4): Grants.gov read on
   opening the board; the summary ("N close within 30 days, the next on …")
   and the list by closing date, each with its agency, number and link, and
   the audiences it serves.
3. **Reward programmes** (BF3): FBI and Rewards for Justice counted by kind,
   missing people and victims left out by their classification; each
   programme's basis, decider and tip line.
4. **Sanctions changes** (BF1, BF2): each OFAC publication counted by
   programme and type, entities, vessels and aircraft named; read from Mecha
   Jono's notes, else a file made at build time from OFAC's last 30 days.
5. **HHS-OIG exclusions** (BF1, BF2): each month's supplement counted by
   state, profession and exclusion basis (each basis, a section of 42 U.S.C.
   §1320a-7, in plain words), organisations named; Mecha Jono's notes, else
   a file.
6. **Sanctions in the country brief** (DP6's deferred part): the programmes
   naming a country, from the same OFAC read.
7. **The note to Mecha Jono** proposing the LEIE and OFAC notes, for the
   owner to approve.

## Built

- **Steps 1 and 2** (915c3e5c, bff34b0d; live): the five audiences, the strip
  above the leads, and funding windows: Grants.gov's posted and forecast
  opportunities in three funding categories (science and technology
  research; law, justice and legal services; information and statistics),
  each with the audiences its category serves, said to be worked out here.
  On the live site: 280 open, 98 closing within 30 days, 53 forecast with no
  closing date (counted, never placed).
- **Step 3** (40cad1c6, 18d7c805; live): reward programmes, FBI and Rewards
  for Justice, counted by kind; RFJ's basis 22 U.S.C. §2708 and the Secretary
  of State as decider, read from its programme overview; the FBI's decider
  only, no statute named that was not read. On the live site: 1,063 FBI
  notices and 272 RFJ notices, 1,335 in all.
- **Step 4** (c8d182b9; live): sanctions changes. `snapshot-ofac.mjs` at
  each build (13 publications since 13 Sep, 193 organisations, vessels and
  aircraft named, 29 KB); OFAC's change history read by the browser; each
  publication linked to OFAC's notice for its day.
- **Step 5** (8578bac3; live): HHS-OIG exclusions. `snapshot-leie.mjs` at
  each build: July to September 2026; September 145 excluded (136 people,
  9 businesses named), 53 reinstated. Each basis in OIG's own words; four
  codes OIG writes that its authorities page does not (1128Aa, 1160,
  BRCH SA, BRCH CIA) are shown as OIG's codes, not explained.
- **Step 6** (27c577dc): the country brief's sanctions (DP6's deferred
  part), OFAC's SDN entries with an address in the country by programme.
  On the build, Russia: 5,207 entries, 1,730 of them people, 4,714 under
  RUSSIA-EO14024.

## Found while building

- **Rewards for Justice's CDN keeps the first site's CORS header an hour.**
  CloudFront caches its API's answers (max-age 3600) with the
  `Access-Control-Allow-Origin` of whichever site asked first and does not
  vary by Origin: a probe from a local build locked starcom.app out of the
  live board. Each request now names the site's host (`starcom_origin`),
  which WordPress ignores and the CDN keys on (18d7c805).
- **The FBI's API sends a notice with every total.** `pageSize=0` sends no
  total and there is no `fields`; the notice is never read or kept.
- **Grants.gov's titles carry HTML character references** (16 of 333
  opportunities): decoded (`htmlEntities.ts`).
- **A professional practice is often its owner's name.** The full LEIE has
  3,466 businesses; 133 carry a professional suffix ("…, MD, INC", "… PC")
  and are counted, not named. No row names both a person and a business
  today; if one does, it is counted as the person's. A call made here under
  BF2; the owner kept it (BF7).
- **OFAC's country names are its own** ("Korea, North", "Burma", "Region:
  Crimea"). Matched to the globe's codes by Natural Earth's names and
  OFAC's spellings; disputed regions OFAC names apart are listed, never
  assigned.
- **Step 7** (2026-10-13): the note to Mecha Jono, approved by the owner as
  drafted, posted as reply bd621d59-57c0 in the J7 thread of their handoff
  doc: `sanctions_changes` and `health_exclusions` notes, people counted,
  never named.
