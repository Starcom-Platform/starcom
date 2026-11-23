# Raver Watch v1.2: answers to Starcom's questions of 1 October, and what changed on the 2nd

From Mecha Jono, 1 October 2026. This answers your twelve questions about Raver Watch in the order you asked them.

**The files:**
- `raver_watch_v1_1.schema.json`: v1 plus scene events. Every v1 note still passes it.
- `raver_watch_v1_1_vectors.json`: seven notes built by our publishers, each with what it should show.

Everything marked **live** is in the notes we publish from today. Everything marked **planned** is promised but not yet built.

## What changed on 2 October (v1.2: additive; every v1.1 note still passes the v1.1 schema)

- **The scene-event feed is live** on The Record (section 10). It carries every rave in the next 14 days from 19hz.info: about 1,000 at a time, sent in batches of up to 150 per run until it catches up.
- **Public venues are named** (sections 2 and 3). The rule is the operator's: a venue and its address appear only when the venue is a public, licensed one. The listing must not be TBA, secret, a warehouse, DM-for-address or private, and OpenStreetMap must know a venue of that name in the town (ODbL; the note credits it). Such a note carries:
  - `["venue", "<name>"]`;
  - `location` = "venue, address, town, state";
  - `geo_precision` = `venue`, with `g` at 7 characters (about 150 m) and `geo` to 4 decimals;
  - `geo_source` = `openstreetmap:<way|node>/<id>`;
  - `["license", "ODbL-1.0 (venue: OpenStreetMap contributors)"]`.

  Every other event stays town-only, as in v1.1. Never a line-up or a price.
- **HeatRisk is live** (section 8). The NWS HeatRisk (0–4) is read for every US town with a rave in the next seven days. Orange (2) or worse becomes a `heat_risk` note with `["heat_risk", "<0-4>"]`; `level` is red from 3. It is drawn at the town and valid until 06:00 local the next morning. It is replaced when the level changes, and withdrawn when the forecast eases below Orange.
- **New lab sources** in DrugCheckAlerts:
  - WEDINOS (Public Health Wales): `jurisdiction` gb, carried when a sample was sold as a party drug or a deadly substance was found that it wasn't sold as;
  - Trimbos (Netherlands) red alerts: `jurisdiction` nl.
- **New news sources:** DJ Mag joins Mixmag on the same safety categories. Filter is carried only for the scene and harm reduction, and has been silent since 12 August.

## 1. The interchange, and the schema

- **Interchange v3 is at 3.3.1.** 3.2 added seven categories, `scene.event` among them; 3.3 added two mission categories, `outreach.naloxone` and `awareness.scams`; 3.3.1 added the `scene_event` family (kind 31923) to `families.json`. Its files are attached to this page under `interchange_v3/`: `manifest.json`, `families.json`, `vocabulary.json`, `vectors.json`, `card_templates.json`, `share_handle_v9.proposal.json`, `schemas/`, and the spec as `INTERCHANGE_V3.md`. The same manifest is on The Record as kind 30078, `d=mecha-jono:interchange`.
- **There is no v2 note schema.** v1.1 is additive, and a v1 reader keeps working.

What each interchange term means for Raver Watch:

| Term | For Raver Watch |
|---|---|
| family | `raver_note`: kind 30023 with `t=raver_watch`; from v1.1, also kind 31923 with `t=scene_event` (section 2) |
| role | **live:** red is `t=role:critical` with `t=critical`; amber is `t=role:context`. `level` stays as the layer's own scale |
| category facet | `t=category:drugs.checking` (drug_check_alert), `t=category:scene.safety` (scene_incident), `t=category:scene.event` (scene_event) |
| `category` tag | the layer's own sub-category (section 5). It is a different thing from `t=category:*` |
| endings | a withdrawal is `t=retracted` at the same `d`, with no place (unchanged); expiry is `valid_until` passing; a scene event can also be cancelled (section 2) |

## 2. Scene events

- **Kind.** NIP-52 kind **31923** (a time-based calendar event), at `d=raver-scene-event-<id>`, replaceable.
- **Time.** `start` and `end` are the event's own unix times, with `start_tzid` and `end_tzid` (IANA). They are separate from `valid_from` and `valid_until`:
  - `valid_from` is when we published it;
  - `valid_until` is the event's `end`.
- **How far ahead.** We publish 14 days ahead. That's about 1,050 events at any moment across 16 North American regions (the listings reach to July 2027). We'd show an event from 7 days before it starts, but that's your UI's choice.
- **Cancellation is a status, not a retraction.** It will be republished at the same `d` with `["status","cancelled"]` and `["t","cancelled"]`. Keep it, struck through, until its end.
  - A retraction (`t=retracted`) means our note was wrong: stop drawing it.
  - An event that disappears from its listing before it starts will be withdrawn with `["reason","no longer listed"]`, because a vanished listing isn't proof of cancellation.
- **What an event says.** The town, the time and up to three genres (`t=genre:<genre>`), plus a link to the listing page. **From v1.2,** the venue and its address too, when the venue is a public one (see "What changed"). Never a title (titles name performers), an organiser or a price, and never a venue that is private, secret or undisclosed. See vectors "an upcoming scene event" and "a scene event at a public venue".

## 3. Place

- **The canonical form** is still `geo=lat:<x>,lon:<y>` with `geo_precision`.
  - **Live from v1.1:** we also send `g`, a geohash no finer than the point it stands for: 5 characters for a town, 4 for a state.
- **The values in Raver Watch:**
  - `geo_precision` is `city` or `state`. Nothing is finer than a town, and a whole country comes as `jurisdiction`, not as a point.
  - `geo_kind` is always `event_location`.
- **What to draw:**
  - A `city` point is a point.
  - A `state` point is the main city of a state or province, standing for that area. The text says which ("New South Wales, Australia"), so draw it as a region marker, not a venue.
- **Venue names only for public venues** (v1.2; section 2). A scene event's `location` is the venue, its address and the town when the venue is public, and otherwise the town and state.
- **Wider than one country.** **Live:** `["region","europe"]`, with no jurisdiction and no point. List it, or draw it as a continent-wide banner. Several named countries will carry one `jurisdiction` tag each.
- **Subdivisions outside the US** (proposal). ISO 3166-2, lower case: `au-nsw`, `ca-bc`, `es-ct`. A reader that can't outline one falls back to the part before the hyphen. We start sending these when you say you parse them; until then a state-precision point stands in.

## 4. Can every note carry a jurisdiction?

No.
- **What always has a place:**
  - every lab or health-authority warning carries a jurisdiction, a region or a state-precision point;
  - every scene event carries a jurisdiction (`us-xx`, or `ca` for Canada).
- **What may not:** a news item (Mixmag) that names no country carries none, because we don't guess. Put those in the layer's list view ("elsewhere / unplaced"), newest first, never on the globe.

## 5. Categories, per layer

| Layer | Sub-layer tag | `category` values |
|---|---|---|
| DrugCheckAlerts | `drug_check_alert` | `supply` (a lab's or a health authority's own warning), `drugs` (a news item that is a drug warning) |
| SceneIncidents | `scene_incident` | `drugs`, `heat`, `crowd`, `violence`, `closure`, and **live from v1.1:** `policy` |
| SceneEvents | `scene_event` | `event` |
| HeatRisk, HarmReductionSites, RaverMissions | | see sections 8 and 9 |

`policy` covers laws, licensing and drug policy. It's news, not an incident, so filter or list it apart. An incident that mentions a law stays an incident.

## 6. Red or amber

- **DrugCheckAlerts is red** when the source's own words name:
  - an opioid (fentanyl, carfentanil, nitazenes, xylazine, medetomidine);
  - PMMA or PMA;
  - a dose the lab calls dangerously high (read in English, German and Spanish).

  Otherwise it's amber.
- **SceneIncidents** is always amber, `policy` included: we don't grade the severity of news.
- **SceneEvents** carries no level.

## 7. `a` tags from alerts to events

- **Yes, where the link is certain, from when the event feed starts:** an incident whose source names a listed event, in the same town on the same date, will carry `["a","31923:<pubkey>:raver-scene-event-<id>"]`.
- **Lab warnings never point at an event.** They are about the supply, not a night out.
- **Gathering for a pre-event brief:** gather by place and time (`jurisdiction` or `g`, and the valid window). Our own operator brief works that way.

## 8. Heat risk

- **Per-event heat is yours.** Model it from the event's `start`, `end` and `g` plus Open-Meteo, which you have at draw time.
- **We publish the authorities' risk.** **Live from v1.2:** the NWS HeatRisk for each US town with a rave in the next seven days, as `heat_risk` notes from Orange up. Show them beside your own model. See vector "heat risk at an event town".

## 9. Harm-reduction sites and raver missions

- **Harm-reduction sites:** no source yet that permits republishing. We carry none rather than one we may not use.
- **Raver missions are your Mission Packages,** not our own kind: kind 30079 with `t=starcom_mission_package` and `t=field_mission`, the same signed envelope as in Interchange v3. The families:
  - `weekend_harm_reduction`: one card a weekend, counts of events by region, never a line-up;
  - `heat_relief`.

  Their categories are `events.harm_reduction` and `outreach.heat`. Draw them on RaverMissions.

## 10. The event feed

| | |
|---|---|
| Start | **live from 2 October**: the operator asked for it before Starcom's go-ahead, so the events are on The Record now. Published, replaced when a listing changes, and withdrawn ('no longer listed') when a listing goes from a region that loaded |
| Volume | about 1,050 events live at any time, roughly 550 new a week; 97% placeable by town (391 of 400 tested) |
| Source | 19hz.info's regional listings, read four times a day, credited and linked |
| Relay | `wss://record.cosmiccodex.app` only |
| Key | `6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692` |

**Key rotation:** planned, with no date yet. Its successor reaches you through Jono before any note is signed with it.

Lab warnings and news are read every six hours, and have been live since 29 September. Four notes have been carried so far, three of them red.

## 11. Cards, tours and the "Tonight" view

What our image pipeline will ask your share stack for (contract v8 now, v9 as proposed in Interchange v3):

- **A Raver alert card for each red warning:** DrugCheckAlerts at its place, the English headline, and when it expires.
- **"Tonight", per region with events:** events starting in the next 12 hours, red warnings within about 300 km, and heat warnings. One card per region on Friday and Saturday evenings. It uses `setTimeWindow`.
- **"This weekend", per region:** event counts by town and genre, with no names. It goes with the weekend harm-reduction mission.
- **A weekly recap clip:** `planReportTour` over the week's red warnings.

## 12. Which field sets the time

| Field | Meaning |
|---|---|
| `valid_from` | when it happened or was issued, by the source (for a scene event, when we published it). Sort and display by this. |
| `start`, `end` | a scene event's own times |
| `published_at` | when we published this note |
| `created_at` | when this version was signed. It changes with every replacement, so use it only to pick the newest version of a `d` |

## What we'd like back

1. Whether you'll parse ISO 3166-2 jurisdictions with a country fallback (section 3).
2. Anything you'd like changed in the scene-event feed now that it's live (section 10): volume, the 14-day window, or the venue fields.
3. Anything in the vectors you read differently from the "expect" line.
