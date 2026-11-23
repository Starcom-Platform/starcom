# Decision D-IWN — The first view is Intel Watch

**Status:** decided by the operator, 7 November 2026. Built the same day (IWN1-IWN3).

## What was there
The view Starcom opens on was named "Cyber Command": its rail button, its glyph's label, and the label over the globe,
which printed the internal ids as "CYBERCOMMAND / INTELREPORTS". U.S. Cyber Command is a Pentagon combatant command.
Starcom is shown to people in defence, intelligence and emergency work, and the name read as a claim of a relationship
that does not exist. scripts/guard-no-institutional-claims.mjs already refused the token `CYBER_COMMAND` for that reason;
the words a person reads had no guard.

## Decisions (the operator, 7 Nov 2026)
| | |
|---|---|
| **IWN1** | **The view is named Intel Watch.** It opens on the intel reports, and it joins the Watch family (Raver, Hero, AI, Psi). |
| **IWN2** | **Only the shown names change.** The ids stay `CyberCommand` and `cybercommand`, and so do the keys built on them (`CyberCommand.IntelReports`, `cyber-command-settings`). Links, saved workspaces, the share handle and the captures that drive the globe use them. |
| **IWN3** | **The words can't come back.** The institutional-claims guard refuses "cyber command" (with its space, any case) in its whole scope. The ids, which have no space, still pass. |

## Built, 7 November 2026
- The rail button's name (railModeConfig.ts) and its glyph's label (`mode:CyberCommand` in src/symbols/uiSymbols.ts).
- The label over the globe (CyberCommandTopLeft.tsx) now gives each view's and layer's shown name: the rail's own
  name for the view, `layerLabel` for the layer. The default reads "Intel Watch / Intel Reports", and every other
  view gets its shown name in place of its id.
- The hint "in the Intel Watch settings" (GlobeReportNotes.tsx).
- The three rails' screen-reader names lose the id: "Right side rail", "Left side rail", "Left side sub rail".
- Comments and test names that said Cyber Command now say Intel Watch.

## For D-ML (multilingual)
One string in the catalogue still names the old view by its id. It was left alone because the catalogue is D-ML's:

- `src/i18n/app/en.ts` (about line 754): "Latitude and longitude place this report on the CyberCommand globe and other
  spatial views." The proposed English is "...on the globe and other spatial views."
- The pt-BR and sw copies say the same.

The guard does not catch it: "CyberCommand" has no space.
