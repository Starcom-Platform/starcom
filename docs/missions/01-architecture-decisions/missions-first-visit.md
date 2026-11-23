# Decision D-MF — Missions, where the first visit gives up (C1, C2)

**Status:** diagnosed and decided 2026-10-16 (MF1–MF3, the owner's picks, each the recommended option); building in the order below. The owner's
critique (`00-current-state/critique-2026-10-16.md`, C1): after the globe,
exploring leads into Missions, "it's just a list… who cares", and this is where
they want to leave. C2: Missions should be a globe mode of their own, like
Raver Watch and Hero Watch.

## What a first visit sees (the live site, 2026-10-16)

The Missions app opens on its Missions tab: a row per received package, 16
from one node (Mecha Jono). Each row is a title in a box with a "?" (its
origin unknown), a PUBLIC badge, and one line of plumbing: the signer's npub,
the relay, the date it states. Above them, "16 Mission Packages received and
verified from 1 node"; below them, "No missions yet. Build one from a case,
or start one with New Mission." The tabs are Overview, Missions, Projects,
Chat, Operatives and Admin; the buttons Received, Import bundle and New
mission.

Opened, a package can be strong. "Carry naloxone in Colorado" says that 1,847
people died of an overdose in the year to May 2026, up 10.3%; that naloxone
is sold without a prescription; four things to do with their time (30, 10, 30
and 5 minutes); where (Colorado) and until when (15 November); its safety
limits in full. Then: "Read here, not taken: taking a field mission and
reporting back come later."

## Why a person who wanted to act leaves

1. **The list shows the least telling part of each package.** The stakes,
   the place, the deadline, the effort and what a person would do are all
   behind a click; what shows is an npub, a relay and "stated". Nothing says
   why this one matters or what it asks of me.
2. **The titles do not say the objective.** "Ebyte NE2-D11" is a device
   model; its objective ("get owners a fix or a mitigation they can use
   tonight") is inside. Mecha Jono's.
3. **Eleven of the sixteen are grant notices posted as missions**
   (AmeriCorps, OJJDP, BJA, a Ghana health programme, spina bifida
   research…): funding opportunities for organisations, not something a
   person can take on tonight. They are the lead desk's funding windows.
   Two are cyber asks (device advisories), three are field missions
   (naloxone in Colorado, Nebraska, New Mexico).
4. **Most cannot be acted on.** A field mission is read only ("taking … and
   reporting back come later"); only a desk ask has "Take this on".
5. **The page talks to an operator.** "Received and verified from 1 node",
   "Unknown origin", "No missions yet" under sixteen of them, and tabs for
   projects, operatives and administration.
6. **There is nothing to look at.** No place on a map, no picture, no one
   else taking part ("No public claims seen"): after the globe, a flat list.
7. **The text carries protocol.** A cyber ask's body ends "published as a
   kind-30023 note with d=starcom-intel-ic-icsa-…". Mecha Jono's.

**What the packages already say of themselves** (The Record, read-only, 2026-10-16):
each of Mecha Jono's kind 30079 events carries `t` tags for its category
(`category:funding.grant`, `cyber.ics`, `outreach.naloxone`, `relief.disaster`,
`charity.revocation`, `awareness.scams`, `civic.public_comment` and more), where
it is done (`where:desk` or `where:field`), its size (`variant:quick_win` or
`long`), its audiences, and `mission_state`, `priority` and `mission_family`
tags. The cards can sort by these rather than guess. A first read returned 100
events of kind 30079 (open and closed cases among them) where the app lists 16:
which are left out, and why, is the first thing step 1 finds out.

**Why 16 (step 1's first finding, The Record read-only, 2026-10-16 afternoon).**
The Record then held 187 events of kind 30079, every one Mecha Jono's, each at
its own coordinate. The app's own verifier, run over all of them:

- **107 are Starcom mission packages** (`d=starcom_mission_package_…`): 85 open,
  22 closed. By family: 24 grant notices, 25 charity revocations, 17 charity
  fundraising, 9 device advisories (ICS), 6 recall checks, 5 disaster
  volunteering, 3 each of naloxone, public comment, scam shield and refunds
  owed, 2 each of heat relief, harm reduction, malware takedown and
  exclusions, 1 smoke relief. 81 are done at a desk, 20 in the field.
- **80 are NavCom's interchange cases** (`d=ic-…`, no `starcom_mission_package`
  tag), the same missions in the interchange's own record. The app never asks
  for them: its subscription narrows on that tag.
- **The app asks only for the last 24 hours** (`since: now − 24 h` in
  `useReceivedPackages`, "a replaceable-event backlog would otherwise re-verify
  the whole history"). Of the 85 open packages, 16 were published that day,
  22 in the week before, 47 earlier: a package not republished today is not
  shown. The list also keeps 50 at most.

So a first visit sees 16 of 85 open missions. And because the list adds each
event it receives, a package republished during a visit would be listed twice.

Starcom's: 1, 4, 5, 6, and 3 where it routes. Mecha Jono's: 2, 7, and 3 where
it posts. Each of Mecha Jono's goes to them as a URL artifact (C23).

## Decisions

| | Decision |
|---|---|
| MF1 | (2026-10-16.) **Stakes-first cards now, a globe mode next.** The list becomes cards that lead with the objective as the headline, then the place, the deadline, the effort and the steps, and one clear action; who signed it and over which relay fold into its provenance. Then Missions as a globe mode of its own (C2): each mission at its place, its card on a click. The app becomes a person's own missions. |
| MF2 | (2026-10-16.) **Grant notices go to the lead desk**, as funding windows on the Market Exchange, not to Missions, which holds what a person can do. Mecha Jono is asked, in an artifact, to post them as funding notes. |
| MF4 | (2026-10-16, after step 1.) **Who posted it is read from the posts, and its badge from its domain.** The owner: "if it's posted by Mecha Jono, it should say it's posted by Mecha Jono", and Starcom is not to be coded to say so for it. A signer's name comes from the key's own profile (kind 0); the badge from NIP-05, the domain the profile names listing that key ("✓ mecha.jono.archangel.agency"), for any publisher. Later, a "Recognised by Starcom" badge from a list Starcom's own key signs, which the owner signs and publishes. |
| MF5 | (2026-10-16.) **Grants are not missions: a Grants tab in the Market Exchange.** Beside "Lead desk" and "Publish a report", holding only grants: the Grants.gov windows and Mecha Jono's grant notices, a notice matching a window marked on it with its steps. Missions shows none. This refines MF2 and the lead desk's LD1 for funding windows. |
| MF6 | (2026-10-16.) **A received package not marked Public is never shown.** Archangel Agency's and Archangel Knights' internal missions do not belong in Starcom; none received is internal today (all 107 are Public). One that is not is counted, "N not public, not shown", and not drawn. |
| MF7 | (2026-10-16, for step 3.) **A taken mission lives in a "Taken on" list** under "Your missions": a checklist card each, its steps to tick, its safety limits, place and end. Kept on the device, apart from the missions a person writes, so nothing in it can be packaged or published as theirs. |
| MF8 | (2026-10-16.) **Taking is on the device only, for now.** A public claim (NavCom's `claimed` label, kind 1985) puts a person's key beside a place and an activity; it is designed with step 4, reporting back through the publish review. |
| MF9 | (2026-10-16.) **Safety limits are read and agreed before taking:** taking opens them in full, and "I'll keep to these" is the button that takes the mission. The limits then head its checklist. |
| MF10 | (2026-10-16.) **Any mission, desk or field, is taken whole;** its steps become the checklist. Asks already taken one at a time stay where they are, in the attention queue. |
| MF11 | (2026-10-16, for step 4.) **A report is sealed to the package's publisher** (NIP-59 gift wrap, as NavCom allows for claims), naming the package by its `a` coordinate, and goes through the publish review. Nobody else sees it. |
| MF12 | (2026-10-16.) **A report holds the counts the package asks for**, one number for each count it names, and nothing else: no place, no people, no photos, the day only ("count things, never people"). |
| MF13 | (2026-10-16.) **Reporting claims nothing.** The publisher hears through the report; a person's key never stands beside a place in public. |
| MF14 | (2026-10-16.) **Mecha Jono, and NavCom, are sent an artifact proposing the report's shape,** so their side can read it; the owner approves its text before it goes. |
| MF15 | (2026-10-16, after step 4.) **Chat announces its prekeys only when chat is used:** the first time a person opens a conversation or sends in chat, never because another feature (a report, a publish) made their key. |
| MF16 | (2026-10-16, for step 5.) **Missions with no place go in an "Anywhere" rail** beside the globe in the Missions mode: compact cards, "Can be done from anywhere (N)", each opening the same card with "Take this mission". |
| MF17 | (2026-10-16, for step 5.) **A placed mission is drawn as its place outlined, with a badge counting its open missions,** as Hero Watch draws field missions (HW6); Hero Watch keeps its own section. A click opens that place's missions as cards. |
| MF3 | (2026-10-16.) **A field mission can be taken and reported back:** taken, its steps a checklist in the person's own missions, and the counts reported through the publish review, its safety limits kept. Reporting publishes, so it rides on publish safety (the cohort's Phase 0). |

## Build plan

Each step: failing tests first; mutations; the affected tests; a build; a
probe in a browser on the build; push; the deploy checked live.

1. **The cards** (MF1): the objective as the headline (the package's
   mission line where its title is not one), the place, the deadline as a
   countdown, the effort summed from its steps, the steps themselves, and the
   action the package allows; provenance folded; the operator's words gone
   from the first view; sorted by what closes soonest and what can be done
   now.
1b. **Not Public, not shown** (MF6).
1c. **Who posted it, from the posts** (MF4): the signer's profile name, and
   the NIP-05 badge when its domain lists the key.
2. **Grant notices out of Missions, into a Grants tab** (MF2, MF5): told
   apart from field missions and asks; the Market Exchange's Grants tab holds
   the Grants.gov windows and Mecha Jono's notices.
3. **Taking a field mission** (MF3): taken into the person's missions, its
   steps a checklist, kept on the device.
4. **Reporting back** (MF3): the counts the package asks for, through the
   publish review.
4b. **Chat keys only when chat is used** (MF15): a key made by a report or a
   publish announces no chat prekeys until the person uses chat.
5. **Missions on the globe** (MF1, C2, MF16–MF17): a mode of its own, each
   placed mission's place outlined with a count badge, its cards on a click,
   and an "Anywhere" rail for the missions with no place.
   - 5a. One read of received packages, shared: the Missions app, the
     Grants tab and the mode subscribe to one ingest, started while any of
     them is shown (each started its own).
   - 5b. The mode: "Missions" on the rail beside Hero Watch and AI Watch,
     `?mode=Missions` deeplinks, its glyph, in the missions' rescue orange
     (HW8: the same mission, the same colour, whichever mode shows it).
   - 5c. Placed missions drawn: each US state, US territory or country with
     open missions outlined, a pill counting them, the hover naming up to
     three with their limits. A mission naming areas inside its state (heat
     relief's 15 forecast areas) is drawn as its state, its card listing
     them.
   - 5d. The panel: a click on a place opens its missions as cards, each
     with "Take this mission"; the "Anywhere" rail lists the missions with no
     place, "Can be done from anywhere (N)".
   - 5e. On cards (the share handle): a Missions layer, after 5d, with the
     note to Mecha Jono in step 6.
6. **The artifacts for Mecha Jono and the Beu**: titles that say the
   objective, no protocol in the text, grant notices as funding notes, and
   what the globe mode needs from a package.

## Built

- **Step 1, what is received** (e30e1189): every package the relays hold,
  not the last day's; one per address, the newest. 16 cards became 85.
- **Step 1, the cards** (MF1): `received/missionCard.ts` reads each package
  for its mission line (its format's, or the description's "MISSION:"), its
  title as what it is about, two sentences of stakes (stopped before a list,
  cut at 280 characters), its place (a state, a country, the areas it
  names), its end, the minutes its steps left say, and the steps. It takes
  its state as the panel does, the signed profile over the tags. The cards
  lead with what closes soonest, then quick wins, then the newest; ended
  and closed after, the closed behind "Show the 22 closed". The summary
  line reads "85 missions open now · 76 at a desk · 8 in the field". Who it
  is from, framed against the signing key, and the time the publisher
  states, fold into its foot; the relay and the version are in its
  details. A Public distribution, which nearly every received package
  states, draws no chip; any other does. Public claims show on the card.
  Refusals sit behind "N could not be verified". A person's own missions
  are headed "Your missions", and with none of their own, the line points
  to the missions above. Words in all six languages.
- On the build, read from The Record: 85 cards, no console errors, no
  sideways scroll at 390 px; a headline is three lines at most (the heat
  relief mission line names fifteen forecast areas).

- **Step 1b, not Public, not shown** (MF6): a received package not marked
  Public, limited, private, stating none or carrying no readable manifest,
  is never drawn, only counted: "N not public, not shown". All 107 on The
  Record were Public; the 13 authored "Archangel Agency" are closed public
  missions from before the author was "Mecha Jono".
- **Step 1c, who posted it** (MF4): `identity/signerProfiles.ts` reads a
  signer's own profile (kind 0) where its packages are, and `identity/nip05.ts`
  asks the domain that profile names whether it lists the key (redirects
  refused, six seconds to answer). A verified name is held for the session
  in `names.ts` (source `nip05`, never stored, never published), after any
  name a person learned. So KeyName says "Mecha Jono ✓", the card adds
  "mecha.jono.archangel.agency", the provenance frame reads it as the
  signer's, and another key claiming "Mecha Jono" is an impersonation.
  Mecha Jono's profile on The Record names mecha@mecha.jono.archangel.agency,
  and that domain lists its key. On the build, under the production CSP: 85
  cards, every one verified, no console errors.

- **Step 2, grants out of Missions, into a Grants tab** (MF2, MF5): a grant
  notice (family `grant`, or category `funding.grant`) draws no card; the
  open ones are counted under the summary, "17 grant notices are in the
  Market Exchange, under Grants", with "Open Grants" where the router can
  open it (`openTab: 'grants'`). The Market Exchange has three tabs: Lead
  desk, Grants, Publish a report. Grants holds Grants.gov's windows, the
  soonest to close first, as a list or on the deadline strip, and the grant
  notices received (`exchange/grantNotices.ts`): a notice meets its window by
  title, a title cut short ("…") the one window beginning with it, and is
  marked on that window's row with its mission line and steps in its detail;
  the rest are listed after with their closing dates. The board names no
  publisher itself (MF4). The lead desk keeps reports, rewards, sanctions and
  exclusions, newest first; its Deadlines view and "Closing soonest" went to
  Grants, since only a funding window closes. On the build, read live: 68
  missions open (85 less the 17 notices); Grants.gov 287 open, 97 within 30
  days; 17 notices, 11 on these windows, 6 listed after.

- **Step 3, taking a mission** (MF7–MF10): "Take this mission" in a
  mission's detail, desk or field, in place of taking asks one by one. One
  that states limits shows them in full first (`limitsOf`: its format's, or
  every ask's, each once), and "I'll keep to these" takes it. Taken, it is
  kept on this device in `received/takenMissions.ts` with the words it was
  taken with, apart from the missions a person writes, and nothing is sent.
  "Your missions" shows "Taken on (N)": a card each, its limits at its head,
  its steps to tick (each dated), "N of M steps done", the minutes left, and
  "Let it go", which asks first. A taken mission's card says "Taken". An ask
  taken alone before stays, and can be let go. On the build: a naloxone
  mission taken through its limits, a step ticked, the tick still there after
  a reload, let go; no relay was sent anything.

- **Step 4, reporting back** (MF11–MF13): a taken mission whose package
  names counts (its format's effect, then performance, each "<label>: a
  count.") offers "Report back": a whole number for each, blanks left out,
  then the publish review, which shows the report as it will be sealed, the
  key alone that can open it, the day only, "claims nothing", and the relays.
  On a yes it is a kind 1 rumor naming the package by its `a` coordinate,
  `t=starcom_mission_report`, a `count` tag each and a `day` tag, dated
  the start of its UTC day (`received/missionReport.ts`), sealed and wrapped
  to the signer by NIP-59 (`received/sendReport.ts`) and sent to the five
  public relays and the relays the signer's NIP-05 lists for its key. The
  review is told it is sealed (`sealed: true`): it asks no "you are the
  publisher", since nothing readable goes public, and names each relay as
  holding it sealed; the key backup prompt still shows. The card
  lists each report sent, its day, its counts and how many relays took it;
  nothing is kept if none did. The shape is spec rev 13, "Reporting back,
  sealed"; MF14's note proposes it to Mecha Jono and NavCom (posted as
  drafted, with the owner's approval, as reply 8f30a53f-c324 in the J7
  thread on Mecha Jono's handoff doc, 2026-10-16). On the
  build, with every relay faked so nothing left: cancel sent nothing; a yes
  sent one wrap, kind 1059, to seven relays, addressed only to the signer,
  no count readable in it, and the card listed the report.

- **Step 4b, chat keys only when chat is used** (MF15): a key's chat prekey
  bundle is still prepared, so what arrives can be read, but it is announced
  only once the person has used chat with that key (`services/chat/chatUse.ts`,
  kept per key): a message sent (direct or team), a conversation they opened,
  a channel they made. A window an arriving message opened, and the Global
  channel the chat adapter makes at every mount, do not count. This replaces
  plan item 2.7's announcing a key made later at once. A bundle refreshed
  after its one-time keys are spent is still republished, since it was public
  already. Someone who chatted before this change announces again at their
  next send.

- **Step 5a, one read** (9a7cf471): `useReceivedPackages` is one shared
  ingest, started by the first view that asks and kept open a minute after
  the last, so the Missions app, Grants and the mode read each package once.
- **Steps 5b–5d, Missions as a globe mode** (MF1, C2, MF16–MF17): "Missions"
  on the rail beside AI Watch, one section, Open missions
  (`?mode=Missions`). Its glyphs, proposed for the sheet: the mode Lucide's
  goal (a flag over a target), the section the clipboard its places wear on
  the globe; each icon keeps one meaning. Share contract v47: `layers` gains
  `OpenMissions` (its feed line and whenReady come with 5e). The missions the app shows open
  (`received/missionPlaces.ts`) are drawn by place as Hero Watch draws its
  field missions: each US state, US territory (Guam as Guam) or country
  outlined in the missions' rescue orange (`DATA_SCALES.missions`, HW8), a
  clipboard at its middle and a pill counting them, the hover naming three
  with their limits (`useGlobeMissions`). A click on a clipboard opens the
  place's missions in the Missions panel: the globe's note store carries
  the click, its set marked `panel: 'missions'`, which the note panel
  leaves alone. At rest the panel says how many are at places and lists the
  rest, "Can be done from anywhere (N)"; each row opens the mission in full,
  the Missions app's own dialog, with "Take this mission". On the build: 13
  missions at 10 places, 55 from anywhere (68 in all, as the app), New
  Mexico's clipboard opening its 2 missions, the dialog on top; at 390 px the
  panel scrolls inside its slot; no relay sends.

- **Step 5e, on cards**: Missions gives the card a feed line (how many open
  missions at how many places, those listed rather than drawn, "as their
  publishers post them", its limits; no credit is coded for a publisher,
  MF4) and whenReady holds a card until the read is whole, the states
  outlined and the pills drawn. The read is whole once every relay has sent
  all it holds, read with `readComplete` past a relay's cap, or has failed,
  and every package in it is verified (`MissionPackageIngest.isSettled`);
  the shared store says `loaded`. On the build, a card with Missions on.

- **Step 6, the notes to Mecha Jono** (C23, one per case): posted as drafted,
  with the owner's approval, as replies in the J7 thread on Mecha Jono's
  handoff doc (2026-10-16): A, a place on every mission that has one
  (93c9d783-a98a); B, mission lines one each and short (594a263c-fc3a); C,
  protocol out of the text (2f3e806d-720d); D, grant notices as funding
  notes, a closing date on each and the opportunity number as data
  (2498e876-ba47); E, titles that say the objective, low priority
  (6f588760-0c95). Counts from The Record, read only, the same day.

## Found while building

- **A first report also announces a chat key.** The report makes the
  person's key (key on first signing), and secure chat then publishes its
  prekey bundle (kind 30078) to the five public relays, unasked
  (`SecureChatIntegrationService`): seen on the probe as five events beside
  the wrap. It names no mission or place, but a relay that sees both arrive
  can link the new key to a sealed message to the signer. Chat's, not this
  work's; raised with the owner, who decided MF15.
- **The Record may refuse a wrap.** It is allowlist-write and "meant to be
  public and permanent", and a wrap is signed by a one-time key. Mecha
  Jono's NIP-05 lists it, so a report is offered to it and counted only if
  it takes it; MF14's artifact asks whether to leave it out.
- **A count's label is its name on the wire,** so a reworded count splits
  old and new reports. MF14's artifact asks Mecha Jono for stable ids.
- **A card was let go from half a read.** whenReady first counted the
  missions read once any had arrived: on the build it went at 10 s with 14
  of 68. The ingest's plain subscription could not say when it was done,
  and could not read past a relay's cap (The Record sends 500 a filter);
  it now reads each relay with `readComplete`, as Raver Watch does since
  4ff10bb8.
- **The United States' clipboard stands behind Colorado's.** A mission for
  the whole US (scam shield) is drawn at the country's middle, which falls
  in Colorado; its pill is hidden by Colorado's. Hero Watch places the same
  way. Worth a decluttering pass with the mode's next work.
- **A mission naming its place only in its text is listed anywhere:** "the
  closed charities in Brooklyn Park, MN" carries no area, so it is not
  placed. For step 6's note: a place on every mission that has one.
- **15 of 187 packages name counts**, all open field missions (The Record,
  2026-10-16): scam shield, refunds owed (three), public comment, naloxone
  (three), malware takedown, heat relief, disaster volunteering (five).

- **Mecha Jono's key showed as "?"**, unknown, on every card: names were
  only learned (BD25: a roster, a collaborator, a bundle). Decided as MF4:
  from the posts, with the domain's badge.
- **"No relays are connected" on a first load** (nostrService), logged as an
  error when relay.damus.io fails before any other relay has connected:
  damus answered 503 all day. Not this work's; worth a look, since the
  message is wrong a moment later.
- **The Ukrainian Missions test raced its own list** under load (the
  heading drawn at once, the row once the list loaded); it waits for the row.
- **Mecha Jono's own wording, for step 6's artifacts:** a heat relief
  mission line lists all fifteen forecast areas; three Washington refund
  missions share one mission line, told apart only by their titles; 7 of
  22 open grant notices state no closing date (the rest give it in
  `operation.clock`, which Grants reads; corrected 2026-10-16, this line
  first said it was only in the prose), and the Grants.gov opportunity
  number is only in a task's words.
