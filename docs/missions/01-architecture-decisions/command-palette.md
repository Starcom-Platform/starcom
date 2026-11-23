# The command palette (D-CP)

UX plan phase E, item E1 ([`../04-plan/ux-expansion-plan-2026-11.md`](../04-plan/ux-expansion-plan-2026-11.md)):
"Ctrl or Cmd-K. One box for places (countries, Zones, Spheres), the items drawn, layers and modes, and commands
('rain on', 'scale true', 'last 7 days'), with recent ones; keyboard throughout."

## What was there (4 Nov 2026)
The header's search box ("Search or use commands…", opened with `/`) dropped a list under it: the applications, six
slash commands (`/name`, `/callsign`, `/coach`, the glossary, `/resourcezones`, `/diplomaticevents`), countries, areas,
Zones and their Sectors, and the cases, reports and missions read from the records. No keys moved through the list, no
layer, mode or time could be chosen from it, nothing drawn on the globe could be found, and its marks were emoji.

## Decisions (the owner, 4 Nov 2026)
| | |
|---|---|
| **CP1** | **A centred palette.** Ctrl/Cmd-K, `/`, or a click on the header box opens one panel over the globe: one input, results in sections (Recent, Commands, Places, On the globe, Layers and modes, Records, Applications), arrows and Enter throughout, Esc to close. The header box stays as its opener. |
| **CP2** | **Commands in plain words.** "rain on", "scale true", "last 7 days", "history", "play" match as they are typed, no slash needed; the slash forms still work. Each command says what it will do before Enter. |
| **CP3** | **An item picked from the globe is flown to and opened.** The camera flies to it and its note opens in the inspector, as a click on it does. |
| **CP4** | **The last 8 picks, in this browser.** With the box empty they show first; the palette can clear them. |
| **CP5** | **The palette absorbs Quick Access** (found at the build: Ctrl/Cmd-K already opened it). Ctrl/Cmd-K opens the palette; Quick Access's four floating panels become commands and its layer pins sit under Layers and modes ("Pin Satellites", "Unpin Satellites"); the Globe's bottom-right layers button opens the palette on that section whole. Quick Access is retired: one box, as E1 asks. |

## Built
**E1 (4 Nov 2026).** features/palette/palette.ts holds the machinery: a result (its section, words, glyph, keywords,
and what it runs), the sources that register where what they offer lives, the matching (every word typed begins a word
of the title, keywords or description, the title's first word counting most), the recent picks, and the open state.
components/CommandPalette is the palette, on the app's one modal (Shared/Modal: announced, Tab kept inside, the page
behind locked, focus given back), mounted beside the header over every application; Ctrl/Cmd-K toggles it, `/` opens
it where nothing is being typed, the header's box opens it. The header's source gives the applications and the slash
commands (found by their words), countries, areas, Zones and Sectors, and the records as they answer; the Globe's
(PaletteGlobeSource, in its layout) gives layers and modes with each layer's pin, the time bar's ranges, Live, Play and
Stop, the replay's decay while quakes are drawn, the floating panels, every drawn layer's rail controls in the rail's
own words in six locales (each toggle on and off, each option), and the items drawn on the globe, named by their notes'
titles, flown to and opened when picked. The empty box shows the recent picks and the time bar's commands; the
Globe's layers button opens Layers and modes whole. Results that answer at once are worked out with the typing, so an
Enter right after the words runs what they find (in the app it had failed 8 times in 10). Quick Access is retired.
