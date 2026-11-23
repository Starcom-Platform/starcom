# Decision D-IW — IntelWeb's structure (K9)

**Status:** decided 2026-10-12 (IW1–IW4, the owner's picks); building in the
order below. K9 of the critique audit (`00-current-state/critique-audit.md`,
section 7) said "structure, then 3D". This record is the structure.

## Where IntelWeb stands (read from the code, 2026-10-12)

- **What it reads:** `IntelWebApplicationWrapper.tsx` asks
  `intelReportService.listReports()` once, when IntelWeb opens, and builds a vault
  from the answer (`IntelWebIntegrationService.buildFromReports`). A report that
  arrives later is not in it until IntelWeb is opened again.
- **What links what:** a report node; an entity node for each `entityRefs` name
  (author-tagged, never inferred); a location node for its point, keyed to five
  decimal places, so two reports rarely share one. Nothing links reports by what
  they state about each other or have in common: `cites` (citations, D-MX),
  `sourceIntelIds`, `jurisdictions`, `tags` and `author` are all on a report
  (`types/intel/IntelReportUI.ts`) and none becomes a link. So the graph settles
  into an even disc of singletons.
- **How it is drawn:** D3 v7 force layout into an SVG (`GraphEngine2D.tsx`). Plan
  block F item 4 (2026-10-02) fixed the overlays, the click that restarted the
  layout, the filters and gravity. Still open from the audit: labels collide when
  zoomed in, Isolate asks for a file path, and search removes everything that
  does not match, so a hit loses its surroundings.
- **Countries:** there is no lookup from a point to its country here
  (`countryAt` in `globeClick.ts` asks the globe's screen). A report's country is
  what it states in `jurisdictions`.

## Decisions

| | Decision |
|---|---|
| IW1 | (2026-10-12.) **Real links and hubs.** A report's citations (`cites`) and linked intel (`sourceIntelIds`) are links from it to those reports. Each country it states, each tag and its publisher is a hub node it joins. Nothing is linked that a report does not state: no links by nearness in time or place. |
| IW2 | (2026-10-12.) **Four layouts:** Clusters, the default (force layout grouped by country or topic; a group collapses to one node with its count and opens on a click; labels never overlap); Timeline (across, when it happened, as D-E reads a report's time; one row per group); Map (placed by longitude and latitude, links between places); Radial (groups as spokes around a chosen report or hub). Colour by category by default, as the globe colours it; by country, publisher or age on request. |
| IW3 | (2026-10-12.) **Reports arriving while it is open:** a button says how many arrived, and adds them when pressed, so the layout never moves under the reader. |
| IW4 | (K9.) 3D comes after the structure, as an option, under the quality governor. Not in this build. |
| IW5 | (2026-10-12, from a sample.) **Only hubs that group.** A sample of 460 notes on The Record had one publisher (Mecha Jono), 214 tags, four of them on more than half the notes (`starcom_intel` on all), and 50 on one note each. A tag is a hub only where it is on at least two notes and at most half of them; a publisher only where there is more than one. The rest filter and colour. In the sample: 160 tag hubs and 150 countries, every note in at least one. |
| IW6 | (2026-10-12.) **Every kind of tag** may be a hub under IW5: theatres and events, sources, categories, desks and severity. |
| IW7 | (2026-10-12.) **Mission packages** a note links to (kind 30079, 78 in the sample) are nodes of their own, named where Starcom holds them, else a stub that says so. |
| IW8 | (2026-10-13.) **Group by, many ways:** country (the default), theatre and event, desk, source and category, and the areas of the Zones and Spheres work: Zones and their Sectors, Spheres. A note is in a Zone or Sector as `zoneReports.reportsAbout` finds it (placed inside, or naming it); in a Sphere where it states one of its members or names it. A note in no group of the kind chosen is in one that says so. |
| IW9 | (2026-10-13.) **Collapse:** a cluster of more than 12 notes opens collapsed, one node with its count; a click opens or closes any. |
| IW10 | (2026-10-13.) **Labels:** hubs and clusters always; a note's title on hover, when selected, or zoomed in close. A label that would overlap another is left out, never stacked. |
| IW11 | (2026-10-13.) **Location nodes go:** countries now join notes; the Map layout (step 6) places each note by its own point. |
| IW12 | (2026-10-13, correcting IW2.) **Colour as the globe does.** IW2 said "colour by category, as the globe colours it"; the globe colours an intel mark by its assessment (critical, actionable, standard, raw: `intelVariantOf`) and shows its category as an icon. So notes are coloured by assessment by default, each with its category's icon in its node; the menu offers category, country, publisher and age as well. |
| IW13 | (2026-10-13.) **The Map:** a note with a point at its point; a note stating only a country gathers around that country's hub, which stands at the country's middle (it is the country). No note is given a point it did not state. Faint world borders underneath. |
| IW14 | (2026-10-13.) **The Radial:** the node selected at the middle, what it links to in a ring one step out and two steps out, each ring in spokes by group; with nothing selected, the most-linked hub. |

## Build plan

Each step: failing tests first; mutations; the affected tests; a build; a probe
in a browser on the build; push; the deploy checked live. New words go in the
catalogue (D-ML).

1. **The graph model** (`buildFromReports`): hubs for stated countries, tags and
   publishers; links for citations and linked intel; a link to a report not held
   here kept as a stub that says so. Tested against a kept sample of real
   reports read from The Record (read only), beside this record. The sample says
   how many reports state a country, and how many join nothing.
2. **Clusters** (IW8–IW11), in parts: (a) location nodes go; (b) the grouping,
   pure and tested, for each way of grouping, with the Group by menu and a force
   toward each cluster's place; (c) collapse; (d) labels without overlap; (e)
   colour-by. IntelWeb's words join the catalogue here (D-ML).
3. **Search and Isolate that keep context:** a search dims what does not match
   rather than removing it; Isolate by clicking a node, not by typing its path.
4. **Arrivals** (IW3): the report store's new reports counted on a button.
5. **Timeline**, 6. **Map**, 7. **Radial** (IW2).
8. Later: 3D (IW4).

## Step notes

### Step 1: the graph model (2026-10-13)

- **What a note names:** the intake now keeps a received note's `a` tags that
  name a note or a mission package (`refers`), and storage keeps them; both
  read through one check of the address (`citations.ts`, `namedAddresses`).
  In the sample, 88 of the 460 notes name something: 81 notes, all among the
  460, and 78 mission packages, none held here.
- **The model** (`services/intelweb/intelStructure.ts`): hubs for stated
  countries, and for tags and publishers that group (IW5); links for
  citations, named notes and linked intel; mission packages as nodes (IW7);
  stubs for what is not held. Tested on its own and on the sample run through
  the intake.
- **The vault and the graph:** a file for each hub, package and stub, and a
  relationship from each note to them. Hubs, missions and stubs are node types
  of their own, in one list the filters read (`nodeTypes.ts`), each in a colour
  of its own. Their words are English for now; IntelWeb's words join the
  catalogue with step 2's controls.
- **Found on the build:** every link pointed at the first layout's nodes, so
  links drew at the graph's corner and pulled nothing. d3 rewires an edge's
  ends to node objects, and IntelGraph passes fresh node copies with the same
  edges each render. The engine now builds fresh links each layout.
- **Checked in a browser** on the build under production's headers, with The
  Record read live for 45 s: 80 notes, 39 countries, 70 tags, 13 mission
  packages and 41 stubs, 581 links drawn between them; no page errors. Many
  stubs: the notes a convergence note names had not all arrived in 45 s.
- **For step 2:** the layout still spreads into a disc, hubs pushed to its rim;
  labels overlap; location nodes (a point to five places) rarely join anything
  now that countries do, so whether they stay is step 2's question.

### Step 2a–2b: no location nodes; Group by (2026-10-13)

- **2a:** location nodes gone (IW11); a note keeps its point. `.vercelignore`
  leaves out `docs/missions/`, read by tests and probes only.
- **2b, the grouping** (`services/intelweb/intelGroups.ts`): eight ways (IW8),
  each from what a note states; Zones and Sectors through the Zones layer's
  `reportsAbout`, Spheres through the area registry's members, both read, not
  changed. A note in several groups clusters in the largest. On the sample,
  nine in ten notes group by country.
- **2b, the layout** (`gravity.ts`, `GraphEngine2D.tsx`): each cluster has a
  place on a spiral, with room for its size; each note starts at its place and
  is pulled there; a node of another kind starts among the clusters it links.
  While grouped, the Charge slider's push is a quarter as strong and reaches
  only near nodes. The view fits the graph once the layout settles, unless the
  reader has moved it. Each cluster's name is drawn over the nodes.
- **What the build showed, in turn:** packed into the pane, 27 clusters made
  one ball; hubs pulled to the middle sat on the middle cluster; names under
  the nodes were hidden; and the notes never reached places 200 to 400 px out,
  because the Friction slider (0.9, passed to d3 as the share of speed lost
  each tick) cools the layout first. Starting each node at its place answered
  the last. The slider's meaning is unchanged.
- **Checked in a browser** on the build, live: by country 27 clusters, each
  country's notes around it and named; by Zone, the Pacific Ring of Fire; by
  Sphere, ten; by desk, three and "No desk"; no page errors. The middle stays
  busy: tag hubs link notes across many countries, and the United States and
  "No country stated" are the largest clusters. Collapse (2c) and labels (2d)
  are for that.

### Step 2c: collapse (2026-10-13)

- A cluster of more than 12 notes opens as one node with its count, in its
  place; a click opens it, a click on an open cluster's name closes it, its
  hover saying which; grouped another way, the rule again (IW9). Collapsed,
  its notes and its own hub are that node, their links outside it its links.
- Checked on the build, live: United States · 16 notes by country; In no
  Zone · 63 notes; Anglosphere, Arabophone world and Hispanosphere by Sphere;
  two desks; the view fitted to the graph; no page errors. Live b8e2ea30.
- Next: 2d, labels without overlap (the middle is still busy with tag hubs),
  then 2e, colour-by.

### Steps 2d–2e: labels and colours (2026-10-13)

- **2d, labels** (`labelPlacement.ts`, IW10): hubs and collapsed clusters
  always; a note's title on hover, when selected, or zoomed in to 1.5 or
  closer; each kept by priority only where it overlaps no label kept before it
  and no cluster's name. Placed again every tenth tick and when the layout
  settles. Live f7fd33d3.
- **2e, colours** (`noteColours.ts`, `ColourKey.tsx`, IW12): IW2 had said the
  globe colours by category; it colours by assessment and shows category as
  an icon, and the owner chose the globe's way. Notes in the globe's own
  assessment colours, read as `intelVariantOf` reads them; each note's
  category as the globe's icon in its node, where the emoji was; a Colour by
  menu (assessment, category, country, publisher, age) and a key. Live
  1c814084.
- **Seen on the build, for later:** a raw note with no category and a stub
  are both grey with the 📄 icon; a stub could be told apart by its outline.

### Step 3: search and Isolate that keep context (2026-10-13)

- A search dims what does not match instead of removing it, its links with
  it; a collapsed cluster holding a match is lit; the controls say how many
  match. A hover ends back on the search's dimming, not on full strength.
  Searching no longer rebuilds the layout.
- Isolate starts from the node selected, in the bar above the graph, with
  its steps (1 to 3), and Show all ends it; the form asking for a node's path
  is gone.

### Step 5: the Timeline (2026-10-13)

- Each note across by when it happened as D-E reads its time; a row for each
  group, the largest first, named; an axis in the reader's dates; a column for
  notes stating no time. The notes only, small, held at their places
  (`timelineLayout.ts`). A Layout menu beside Group by.
- **Found on the build:** the engine's pull of the whole graph to the pane's
  middle moved every note off its date; it is off on the Timeline. The
  header wraps now that it holds three menus. Live 4ed47e08.
- For later: one old note (March) stretches the axis, so October's notes
  crowd its right end; zooming answers it for now.

### Step 6: the Map (2026-10-13)

- A note with a point at its point; a country's hub at its middle (from the
  territories the globe draws); a note stating only a country gathered
  loosely around that hub; a note stating no place in a strip below, named
  (IW13, `mapLayout.ts`). Faint world borders underneath, the globe's
  lightest file. Notes and countries only; a state's hub, whose middle is not
  known here, is left off.
- **Found on the build:** the Map opened at full size, the Americas filling
  the pane; it opens with the whole world in view now, as the Timeline opens
  with every row. Live 83a48594.

### Step 7: the Radial (2026-10-13)

- The node selected at the middle, else the most-linked hub; what it links
  to in a ring one step out and two steps out, each group a spoke on the same
  bearing in both rings, named; the notes in no group, then other kinds in
  no group ("Others"), last. Selecting a node re-centres it (IW14,
  `radialLayout.ts`). Nothing further than two steps is drawn.
- Every node is drawn where it stands from the start, not at the corner
  until the layout's first step.
- **Steps 1 to 7 done.** Left: 3D (IW4, later).

### Follow-ups (2026-10-13)

- What is named but not held here (a stub, a mission package not held) has
  a dashed ring, and the key says so: a stub and a raw note were the same
  grey with the same icon.
- On the Timeline, a few notes far earlier than the rest (a tenth or fewer,
  before a gap wider than half the span) stand in a column of their own,
  "Earlier, to 1 Mar 2026", and the axis spans the rest.

