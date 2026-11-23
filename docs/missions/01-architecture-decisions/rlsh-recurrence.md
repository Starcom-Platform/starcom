# RLSH recurrence missions (D-RR)

**Status:** decided 11 Nov 2026; building. **Source:** Mecha Jono's build kit v0, `kit/schemas_rlsh.md` (26 Oct), on their
handoff page; its fixtures and vectors are copied in `src/services/psiWatch/kit-v0/fixtures/rlsh/` and
`vectors_rlsh.json`. **Before it:** the PsiOps build order (D-PW, `psi-watch.md`), whose last step before RLSH, the lab and
the board, went live 11 Nov (f1d23347). RLSH sign-up is D-RF (`rlsh-signup.md`); minors are `rlsh-minors.md`.

## What the kit asks

Safety-presence windows around recurring nights in a city (the fixtures' night: a Knicks title clinch watched in
Midtown, Thu 10 Jun 2027, invented), each with a field mission. Four families, all signed by Mecha Jono's new key only
(`86f824c3…402c`):

| Family | Kind | What Starcom shows |
|---|---|---|
| `recurrence_window` | 30023 | The windows calendar; the recurrence layer on the globe; the window on the shared timeline |
| `recurrence_case` | 30023 | The Case view, only once one is published |
| `celebration_safety` | 30079 | The mission screen's field variant |
| `mission_totals` | 30023 | The totals, after the night |

Their rules for every RLSH item (kit section 0), held here as constraints on every step:

- **No person on any surface:** no name, mark, callsign or description; no RLSH mark, hero or person icon on the globe;
  no team size, meeting point or count of takers before a window closes.
- **No point finer than a city** (`geo_precision` `city`, 0.01°); precincts travel as names, never as points.
- **Not an emergency service:** the 911 card says "Call 911"; no button that sends anything; no dial button in v0.
- **Volatile data shows its state and its age;** a closed window reads as closed.
- **No badge of any kind,** and no alarm styling (no red, no siren, no flashing). Experimental belongs to PsiOps only.
- **Starcom never scores:** `score_line` shown as published, once; `score` and `base_rate` only to sort.
- **The copy rule (kit section 8):** Starcom's words never say "Mecha Jono", "Archangel Agency", "RLSH", "hero" or
  "patrol" for these items; RLSH is never on a card or a clip (shotSpec already refuses it).
- **Unknown tags and fields are ignored,** never an error.

## Decisions (the owner, 11 Nov)

| | Decision |
|---|---|
| **RR1** | **Home: the globe's Missions mode, a third sub-mode "Safety windows".** Its layer draws each window's city at city scale, faded by the window's weight at the cursor; its panel is the windows calendar (the next 14 days and the last 7). Not the RLSH panel, whose words ("RLSH", "Heroes") the copy rule keeps off these items. |
| **RR2** | **The mission card first:** the field variant (the 911 card on top, the window on the shared timeline, the score line, the three checklists, the "look this up" topics, the totals and the coalition count after the window closes, the ended state), then the calendar and the layer, then the Case view. |
| **RR3** | **The kit's fixtures only with `?rlsh=kit`,** as Psi Watch's invented samples are (PW48); live windows, packages, Cases and totals from the new key show to everyone once they arrive (none on The Record on 11 Nov). |
| **RR4** | **The kit's questions 6–8 answered as assumed,** in a note the owner approves: Q6 the city point drawn at city scale, the precinct names only as label text; Q7 one timeline component for both efforts (WindowTimeline, already checked against both vector files); Q8 no reminder in v0. |

## Plan

Hours are Starcom's work.

1. **Readers, refusals and the switch** (3 h): the four families from the kit's files under `?rlsh=kit` and live from The
   Record (the new key only); the window read and checked (its anchor and profile give its `peak` and `until`, else
   `window-profile-disagree`; its state by `shownState`); the refusals shown with their reasons (`not-our-key`,
   `rlsh-point-finer-than-city`, `unknown-window-state`, `profile-malformed`, `window-profile-disagree`).
2. **The mission card's field variant** (6 h), kit 5.4, in Missions' received list and wherever the card opens:
   1. the 911 card, always visible, above everything: "Someone hurt or in danger? Call 911." and "This is not an
      emergency service.", text only;
   2. the mission line, the state with its age, "Ends {valid_until}";
   3. the window on the shared timeline, in the place's zone and the viewer's;
   4. the score line once, and the Case when one exists;
   5. three checklists from `window.phases` ("Before the night", "On the night", "After"), each objective with its code
      and minutes, its limits above every ask;
   6. the `check` topics under "Look this up for where you are:", each a topic, never an answer;
   7. after the night: the totals ("Totals, as of {date}, from {n} settled reports", "Counts only. Who reported is
      never shown.") and the coalition count (kit 5.6: hidden before `until`; "Not counted yet." without a tag);
   8. an ended package: "Closed" with its reason, its objectives greyed and not offered.
   Taking part goes through NavCom; Starcom shows no claim count, list or map.
3. **The windows calendar and the Safety windows sub-mode** (5 h), kit 5.1: grouped by the local date of `from` in
   `tzid`, sorted by `from`; each with its place, its state, "{from} to about {until}" (local, and the viewer's when they
   differ), "Busiest around {peak}", the `schedule` line with its age, and the score line once; closed windows kept
   as history with why; a drafted window greyed, "Not yet possible.", never on the globe.
4. **The recurrence layer** (5 h), kit 5.2: the city at city scale around the `geo` point, the area names as label text,
   its fill faded by w(t) at the cursor; an armed window before `from` a thin outline and "Armed: opens at {time}";
   a closed one only while the cursor is inside it, as history; never a mark, an icon, a crowd or alarm styling.
5. **The Case view** (3 h), kit 5.5: one row per night with its trigger; each count on its own line with its owner,
   never summed across owners or measures; the decisions; the settled answers; the score line once.

Words in six languages throughout. The kit's English strings (its section 8) are the source of the catalogue's
English: "Windows", "Recurrence windows"; the states "On the schedule", "Armed", "Live", "Closed"; "Not yet possible.",
"Opens at {time}", "{from} to about {until}", "Busiest around {time}"; "Updated {age} ago", "As of {time}", "Times
shown in {zone}"; "Closed: the window has passed.", "Closed: not needed."; "Someone hurt or in danger? Call 911.", "This
is not an emergency service."; "Before the night", "On the night", "After"; "Look this up for where you are:" with
"Face coverings in public", "Recording people and officers", "What a private person may do", "Volunteer and Good
Samaritan protection"; "Ends {time}"; "Totals, as of {date}, from {n} settled reports", "Counts only. Who reported is
never shown."; "Taking part: {n}", "Agents taking part: {n}", "Shown after the window closes.", "Not counted yet."; "Case",
"as {outlet} reported it", "typical {n}", "Decisions that shaped the nights", "Whose decision: {owner}", "Settled
answers", "Settled", "Narrowed", "No record settles this".

## Built

**Steps 1 and 2, 11 Nov.**

- **Readers and refusals:** `services/rlsh/recurrence/recurrence.ts`. It refuses with the kit's reasons: the new key only; nothing finer than a city; the four states; a malformed profile; a window its anchor and profile do not give. It reads the window note, the Case, the coalition rule and `versionAt`. Every refusal and coalition vector in `vectors_rlsh.json` passes, and the weights and states passed already (`kitConformance.test.ts`).
- **The package:** `recurrencePackage.ts` reads the window, phases, Case, end reason, the codes P1–T1 and the check topics.
- **The switch:** `rlshKit.ts` (`?rlsh=kit`) and `useRlshItems.ts`.
- **The card:** `missions/SafetyNight.tsx` holds the card's field variant, drawn for any field package with a window, in the kit's order:
  - the 911 card, pinned at the card's head;
  - the state with its age, "Ends", the window in the place's own zone with the shared timeline, the score line and the Case;
  - the three checklists, with the safety limits said once above them, and the topics to look up;
  - after the window, the totals and who took part.
- **What a night's card leaves out:** no claim count, and no description (it repeated the mission line and score line; its why is the Case's). An ended night offers nothing. A taken night offers no crew or step board (`TakenMission.family`).
- **The kit's sample:** listed in Missions only with `?rlsh=kit`, as it stood at the cursor (`RlshSamplesList.tsx`).
- **The clock is the shared cursor:** the present while the timeline is live, so live use reads as the kit says. The 2027 sample's ending, totals and count show by moving the cursor past its night.
- **A window note is never older than its package:** a package exists only from its window's arming.

**Seen on the build:** `.local/scripts/safety-night-view.mjs`.

**Steps 3 and 4, 11 Nov.**

- **The sub-mode:** "Safety windows" (`SafetyWindows`) is the Missions mode's third sub-mode and layer. Its glyph is Lucide's calendar-heart.
- **Share handle v84:** the layer is listed, as RLSH is, because the layer list must equal the contract's. A shot naming it is refused ("Safety windows are never drawn in a card or a clip"), and `layersFor` never names it.
- **The live read:** `liveRlsh.ts` reads windows and Cases from The Record, by the new key and the families' own topics; a refused note is kept apart with its reason.
- **The calendar:** `SafetyWindowsPanel.tsx`, in the dock slot `safetyWindows`. It groups windows by the local day of their start, named with the place's zone. Each row gives:
  - the place, and the areas as words;
  - the state at the cursor;
  - the times in the place's zone, the viewer's own on hover;
  - "Busiest around", the schedule's line with its age, and the score line once.
  The next 14 days and the last 7 by default, or "All held". A drafted window is greyed; a closed one stays as history with why.
- **The layer:** `useGlobeSafetyWindows.ts` draws a 25 km city disc in the missions' rescue orange, filled by the window's weight at the cursor:
  - armed, an outline only;
  - closed, grey, only while the cursor is inside the window;
  - drafted, never.
  A pill gives the place and the state; the key explains the shapes. The times shared with the card are in `localTimes.ts`.
- **Seen on the build:** `.local/scripts/safety-windows-view.mjs`, at New York two days before the night (outline, "Armed: Opens at Thu 10 Jun, 20:30"), at its peak (filled, "Live") and a day after (nothing drawn; listed Closed).
- **Posted:** the RR4 note to Mecha Jono, 99e280e3-81f0 on the Psi thread.

**Step 5, 11 Nov: the Case view** (`missions/SafetyNightCase.tsx`).

- **Where:** it opens from the card's "Case: {title}" line once a Case is published. The Case it shows is as it stood at the cursor, and never older than the package.
- **The nights:** one row per night, with its date, trigger and home, away or parade.
- **The counts:** under each night, every count on its own line, "{n} {words}", with whose count it is, "as {outlet} reported it" where an outlet did, "typical {n}" and a bar pair (the count solid, the typical night outlined) where it is our own count, and its source. Counts are never summed.
- **The rest:** the decisions, each with whose decision it was; the settled answers as cards (Settled, Narrowed, No record settles this); the score line once. Nobody named; nothing finer than a precinct's name.
- **Seen on the build:** `.local/scripts/safety-night-view.mjs` now opens the Case too.
- **Done:** with this, the plan's five steps are built.

**Follow-ups, 11 Nov (the owner's sweep).**

- A Safety window's calendar row opens its mission's card ("See the mission") once its package is held: the kit's sample as it stood at the cursor, or the one received. The Case opens from the card.
- The layer's pill for an armed window has its own words, "Armed: opens at {time}", in six languages.
- Posted to Mecha Jono: e9c6727f-1ec1 (v84, the Safety windows and the Case view; the owner: post as drafted).

