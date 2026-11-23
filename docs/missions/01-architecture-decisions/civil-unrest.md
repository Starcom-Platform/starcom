# Decision D-CU — Civil Unrest

**Status:** decided 2026-10-26 (CU1–CU4, the owner). Plan H8, due Fri 13 Nov.

Mecha Jono asked on 19 Oct for a Civil Unrest layer drawing their protest desk, "by country and city, and the protest
surges apart from the conflict surges". The owner chose on 25 Oct that it is a Geo Political layer beside War &
Conflict, not a section of it. Until it exists, their protest notes and protest surges carry `starcom_intel` and draw
as Intel Reports.

## What is on the grid (census, 2026-10-26)

A read-only query of The Record (`wss://record.cosmiccodex.app`), kind 30023, by Mecha Jono's key:

| What | Tag | Seen |
|---|---|---|
| A day of unrest in a country | `t=unrest_note`, `t=unrest_desk`, `t=category:unrest.events`, `d=starcom-unrest-<source>-<cc>-<day>-<hash>` | 65 |
| The week's brief | `t=unrest_brief`, `brief_week` (from, until), `trend` (country, words), `a` to the week's notes | 1 |
| What kind | `unrest_kind` and `t=unrest:<kind>`: `protest`, `shutdown` | 75 on 65 notes |
| Where | `jurisdiction` (a country, lower case) | 64 |
| | `place` (`Madrid`, `city`), `geo`, `geo_precision=city`, `geo_kind=event_location` | 15 |
| Crowd counts, each by who claims it | `claim`: value, claimant key, claimant's name, the outlet citing it, the words as stated | 12, e.g. `["claim","20000","organisers","Organizers","Armenpress","20,000"]` |
| The movement | `movement`: Wikidata id, name | 12 |
| Its Zone and Sector | `zone`, `zone_sector` | 4 |
| Who reported it | `authority` (Wikipedia's Current events portal, the CIVICUS Monitor), `t=source:<id>`, `r` links | all |
| Related travel advice | `join` to War & Conflict notes | 103 |
| Its licence | `license` (`CC BY-SA 4.0`) | all |

Protest surges are `reporting_surge` notes with `t=protest`, `d=starcom-intel-surge-protest-<cc>-<day>`, titled
"Reports of protest placed in Italy: 22 articles from 22 outlets on 25 Oct 2026, a surge in reporting, not in protest".

## Decisions (the owner, 2026-10-26)

| | Decision |
|---|---|
| **CU1** | **Chartreuse,** a hue nothing else on the globe carries, apart from the war reds and caution amber, which unrest must not borrow. |
| **CU2** | **A crowd glyph and a country tint.** Lucide's `users-round` (the megaphone is Campaigns'), at the city a note names, else at its country's middle; countries with notes in the window lightly tinted. One glyph a country and day, as the notes are. |
| **CU3** | **Moved out of Intel Reports.** Protest notes and protest surges draw once, in Civil Unrest, never also as Intel Reports, as Raver Watch's and War & Conflict's notes do. |
| **CU4** | **Protest surges, a ring, their own section.** Civil Unrest's second section, Protest surges: a thin ring round the country, never the crowd glyph, its title carrying "a surge in reporting, not in protest", pinned on or off like any section. |

Crowd counts are said as their claimants state them, side by side, never one as fact (Mecha Jono's 19 Oct note, the
owner's 25 Oct answer).

## Built (2026-10-26)

- **The reader** (`services/civilUnrest/civilUnrest.ts`): both kinds from The Record while a section is on; a day of
  unrest's day from its address, a surge timed by when it was written; each `claim` kept with its claimant, its outlet
  and its words. Tested on the live sample kept beside this record (`civil-unrest/unrest_live_2026-10-26.json`).
- **Out of Intel Reports** (CU3): the intake hands days of unrest and protest surges to this layer, counted as such;
  conflict surges stay Intel Reports.
- **On the globe** (CU1, CU2, CU4): a crowd a place, its hover naming each day with its kinds and counts beside their
  claimants; countries with a day tinted chartreuse at 0.22 (0.16 could not be seen on Blue Marble); a surge a broken
  ring at its country's middle, the country's edge dashed. Live, a day stands for 7 days and a surge for 2; a window
  shows the days in it.
- **Cards** (share contract v60): `listReports` lists both, a featured card says the counts side by side, a surge's
  says "a surge in reporting, not in protest" first, and the Data line credits each note's licence. Seen on the built
  app from the live desk: 37 days of unrest and 3 surges over Europe.
