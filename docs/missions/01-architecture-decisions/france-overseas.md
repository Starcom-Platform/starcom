# France's overseas regions as territories (D-FO)

Mecha Jono's note of 7 Nov 2026 on the handoff thread (da53bf42-2c65): every Intel Watch frame of their recordings
showed "1 territory named and not drawn — no boundary at that level for gf". French Guiana has its own ISO 3166-1
code, but the map drew it inside France, so a report placed there was never drawn. They offered two ways: separate the
regions, or keep the map and word the case.

## What was there (8 Nov 2026)
The country map is Natural Earth's 1:50m admin-0 countries, simplified to three detail levels
(public/geopolitical/world-territories-lod0/1/2.geojson). France's shape held French Guiana at every level, Réunion
from lod1, Martinique and Guadeloupe at lod2; Mayotte was drawn nowhere. So `gf`, `gp`, `mq`, `re` and `yt` resolved to
no territory, and a point in French Guiana read as France. Every Intel note on The Record naming `fr` (ten of the last
500 read on 8 Nov) was about metropolitan France; the one naming `gf` ("Conflict: Brazilian drug war") meant French
Guiana as Brazil's neighbour.

## Decisions
| | |
|---|---|
| **FO1** | **Separate the five** (the owner, 8 Nov). French Guiana, Guadeloupe, Martinique, Réunion and Mayotte are territories of their own, as ISO and the relays code them; France is metropolitan France. |
| **FO2** | **Nothing else on the map moves.** Each part France's shape held becomes its region's with its vertices untouched (French Guiana's edges with Brazil and Suriname included); a region a level did not draw gets its largest island from Natural Earth's 1:50m map units, cut to as few points as that level gives islands of its size. Every other feature is as it was. |
| **FO3** | **No country changes colour.** The colour bake keeps each territory's slot from its last run and colours only new ones (scripts/lib/territoryNeighbours.mjs); before, it re-balanced every slot, and these five would have moved some thirty countries. |
| **FO4** | **A list naming France holds the five** (PARTS_OF, areaRegistry.ts): they are regions of the French Republic, and the EU counts them as its outermost regions (TFEU, art. 349). The EU, NATO and the Francophonie draw them as they drew French Guiana before. Continents take each by Natural Earth's own filing: French Guiana South America, Guadeloupe and Martinique North America, Mayotte Africa, and Réunion (filed under the open ocean) Africa, as Mauritius is. |

## Built (8 Nov 2026)
scripts/geopolitical/split-france-overseas.mjs splits the three levels (and world-territories.geojson, lod1's copy)
from data/raw/geopolitical/ne_50m_admin_0_map_units.france.geojson (Natural Earth 5.1.1, the six map units with
ADMIN = France); geo:fetch runs it after simplifying. The meshes were baked again (geo:bake, geo:qa: shared border
edges unchanged at every level; four island parts added at lod0, three at lod1, Mayotte at lod2), the colours and
names written (five names, shown from zoom 5), the areas baked again (the Zones' search index unchanged). The territory
index now names each: Cayenne lies in French Guiana, Paris in France; `gf`, `gp`, `mq`, `re`, `yt` each resolve.
