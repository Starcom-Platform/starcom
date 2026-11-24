# Note, 24 October 2026: our name is off every card (record D-L, L6)

For Starcom's own session to read. Branch `mj/neutral-credit`, from origin/main 32fa4170.

## What the operator decided

Starcom speaks as itself. No card, video frame or preview names Mecha Jono or Archangel, and the
operator found "Data: Mecha Jono on The Record" unclear. So our credit is dropped. Every credit a source's
licence asks for stays.

(Reworded on 24 Nov 2026, when the operator retired the project's old framing from Starcom. The decision is
unchanged.)

## What changed

- **The Data line** (`capture/sourceCredits.ts`): `CREDITS.mechaJono` is gone, from `CREDITS` and from every
  feed's `credits`: War & Conflict, the war map, Lifeboats, Relief, field missions, Raver missions, Raver Watch,
  harm-reduction sites and AI Watch. The licence credits are unchanged: Wikipedia's war list (CC BY-SA 4.0), OCHA
  via HDX (CC BY), the RNLI, IFRC GO and the rest. A feed whose only credit was ours now has `credits: []`, so it
  prints no Data line. The credits dialog lists one source fewer.
- **Feed names** (panels, load status, a card's record): "via Mecha Jono on The Record" is gone. A real source
  is still named ("War & Conflict from UN News", "Lifeboats from RNLI", "Relief from IFRC GO and OCHA via HDX").
  Where no source is named, the name says "posted on The Record". No glossary or credits entry explains The
  Record, so "from The Record" alone would not have been plain. "Reading The Record…" was already in the UI.
- **Card lines:** "via Mecha Jono" is gone from War & Conflict, Raver Watch, Lifeboats and Relief cards. The
  theatre card reads "From War & Conflict's reports on The Record". The brief reads "N items reported on <day>
  (UTC), posted on The Record". A field-mission card reads "posted by an AI agent", which keeps the AI disclosure
  without our name. The week card reads "From the weekly roundup on The Record, posted by an AI agent".
- **Standing notes and the key:** War & Conflict's items stand "three days from when it was reported". Lifeboats
  are "published on The Record", "counted from the RNLI's Return of Service". AI Watch's notes are "sorted into
  areas", their stance "read in its words". The layer picker's War & Conflict description is "War news, item by
  item, …".
- **The tour** (video): a critical item's reason is "Critical, as its report tagged it".
- **Area names** (an area card's "From …" line): "Zone and Sector Protocol 2.0: <name>". The ZSP 1.0 Zones'
  "drawn by Mecha Jono …" now reads "drawn …". The lists' fallbacks are "Zone and Sector Protocol 2.0: the
  Spheres list" and "… the Organisations list".
- **The area bake:** the Zones' source words are part of the area definitions, so
  `public/geopolitical/areas-lod0.geojson` was baked again (`scripts/geopolitical/bake-areas.ts` only). Only its
  `definitionsHash` changed (59d5d970 to 24f0514a), with its digest in `public/geopolitical/manifest.json`.
  `mj/zsp2-part2-lists` changes the same two lines. When that branch is rebased, bake again rather than pick a side.
- **AI Watch's panel:** "Sources' headlines and links on AI, posted on The Record, sorted into areas, …".
- **The rule:** `capture/__tests__/noPublisherName.test.ts` reads the code that writes what a capture prints
  (the capture and tour folders, the four feed hooks, the layer picker, the brief, the war view, the week, the
  areas), sets comments aside, and refuses "Mecha Jono" or "Archangel". It also refuses either name in any
  credit. Seven mutants were killed: a card line, our credit back, a feed name, the week line, the comment
  stripper both ways, and the capture folder left unread.

## Kept, and why

- **The Opportunity Board's "Posted by Mecha Jono."** (`marketexchange/components/leadCards.tsx`), and
  Diplomacy's "posted by Mecha Jono" (`i18n` key `viaRecord`, D-DP steps 9b and 9c). Both are in-app panels and
  never reach a capture. MF4 has the owner's words: "if it's posted by Mecha Jono, it should say it's posted by
  Mecha Jono". The `i18n` string belongs to the other machine, so it was not edited.
- **Signer names on mission cards in the Missions app:** they come from each key's own profile (MF4), not
  from code.
- **`metadata.mechaJono`:** a field name in the packages' format. It is never printed.
- **"Archangel Knight"** (`rlshVisualizationTypes.ts`): an RLSH role label. RLSH is never drawn or described on a
  card (`describeView`, `layersFor`), and `archangel-knights.json` is empty.
- **The Central American Dry Corridor's sector sources** (`public/geopolitical/zones/central-american-dry-corridor.zsp.geojson`):
  "Rivers traced by Mecha Jono through GeoNames points (approximate)". That file is the publisher's export,
  pinned by its SHA-256 in `areaRegistry.ts`. Only the Zone panel shows it, and no card does. The words change
  at the export, not here.
- **The notes' own words:** a note's text can end "Posted by Mecha Jono, an AI agent." A card quotes a note's
  title as written and not the rest (the week card takes one sentence of the roundup). A title is ours to word at
  the source, not here.
- **Comments and decision records** still name Mecha Jono where they say whose notes these are.

## For Starcom's session: re-keep the golden cards

The golden cards were not re-kept here, so they are yours to re-keep on your machine.

- The compare ran on a clean build of fdf00d23 (`npm run golden:cards -- http://localhost:5210`). All 17 cards
  differ from the kept copies. On the 13 that named us, the words changed only as this note says. What they
  now state names us 0 times, where it named us 3 to 10 times per card.
- This machine (Linux, arm64) cannot keep them. The cards whose words did not change differ here too.
  `intel-emblem-wide` differs in 1.17% of its pixels, nearly all in its text, and `europe-names-quiet-square`
  in 0.58%, against a limit of 0.2%. `weather-temperature-wide` even states its footer 20 px lower. Kept here,
  every card would differ on your machine.
- To re-keep them on your machine: `npm run build && npx vite preview --port 5210 --strictPort &`, then
  `npm run golden:cards -- http://localhost:5210`. Read each card's text differences (each should be one of the
  changes above), then run it with `--update`, look at each card, and commit.
