# Decision D-RP: Publishing one report to the globe

**Status:** decided by the owner, 20 November 2026 ("public publishing should work"), after the intern-readiness
review found that a report written in the Intel Dashboard had no working way to reach anyone else's globe. Built
the same day. Withdrawal (RP7) decided and built the same evening, on the options set out then: a withdrawn
version alone, with a deletion request, or an undo window before sending.

## Why

Interns write reports in the Intel Dashboard. Before this, the only way out to the public was the Exchange's
"Publish a report". It sends a package manifest to IPFS and a kind 30023 note carrying the package's IPFS address,
the report's title and a checksum of each report's text, not the text. starcom.app has no pinning service, so the
upload either failed or lived only in the publishing tab's own Helia node. Other readers got a title and an address
that led nowhere.

The globe's intake already reads plain long-form notes, as Mecha Jono publishes them (the interchange spec, "Globe
intel"). A report published in that shape needs no IPFS and no new reader.

## What was decided

| # | Decision |
|---|---|
| RP1 | **The report is the note.** Kind 30023 (NIP-23), `d` = the report's id, so publishing again replaces the published version at the same address. Content: the title, a blank line, the summary when there is one, then the text. Tags: `title`, `published_at` (the first time, kept on republishing), `summary`, `t=starcom_intel`, the author's tags as topics, `jurisdiction`, `r` sources, `e … cites`, and `agent` from a key marked as an AI agent's (MX14). |
| RP2 | **Only your own Public report goes.** Refused, with what to do: a report read from the relays, one sent to you, one with no title or text, one nobody has decided who may receive (the panel asks, as Export does), a Limited or Private one, one marked Careful or Protected, sample material. A placeless report whose title begins with `[` or `{` is refused too, because the intake reads such a note as a map payload and would drop it. There is no approval gate (decided in September: publishing is not verification). |
| RP3 | **The place is never finer than the precision given.** The point goes as a `g` geohash, the shortest whose cell's half-diagonal is within the stated precision, with `geo_precision` in metres. A county-level report publishes a 4-character cell, not the street it was typed at. With no precision, 9 characters (about 3 m), the point as given. No other coordinate is written into the note. |
| RP4 | **Through the publish review, to the intel relays.** The review shows the note as it will be signed, where other globes will place it, its topics, sources and citations, the version it replaces, and what stays on the device. It goes to `publishRelays('INTEL')`. On a yes the browser records the address, event id, relays and time (`publishedReports.ts`); the panel says when it was published and whether the report changed since. |
| RP5 | **One report, not two.** The intake skips a note this browser published when it reads it back from a relay, from the moment it is sent. The local report already stands for it. On another device with the same key, the note is read like anyone's. |
| RP6 | **Stays on the device:** when it happened (no reader reads event time from a prose note yet; decision D-E), conclusions and recommendations (assessment is recorded on a case), confidence, severity and collaborators. The review lists each that is present. |
| RP7 | **Withdrawn by replacement, with a deletion request.** Withdraw, on a report published from this browser, sends through the review a NIP-09 deletion request for the note's address, then a second later a version at the same address tagged `retracted`, saying only "Withdrawn by its author." Relays that keep the newest version hold the notice in the report's place; relays that honour the request hold nothing. The order matters: a deletion by address removes every version up to its own time. Every Starcom reader takes a withdrawn report off the globe, its lists, its storage and the portfolio, without offering it back with Undo, and draws nothing for the withdrawal. It asks relays for withdrawals by their own tag, from any author, because a publisher may drop `starcom_intel` from the withdrawing version: all 53 of Mecha Jono's withdrawn notes on The Record did (read 20 Nov 2026), so copies saved before those withdrawals had stayed. Only the key that published it can withdraw it. Publishing again afterwards is allowed and clears the withdrawal. What cannot be done is said on the screen: a copy someone already took stays, and a relay may ignore the request. An undo window before sending was not built; it is the next step if the pilot shows people regretting a publish within minutes. |
| RP8 | **Kept when no relay takes it** (work package W1, 21 Nov 2026). A report, or its withdrawal, that no relay takes waits on this device exactly as signed (unless every relay that answered refused it for good, as `blocked:` or `invalid:`, which is shown with their reasons instead), with the relays its review named (`EventOutbox`), and goes when the connection returns, at the next start, or every few minutes while it waits; nothing is signed again, so a locked key or Uplink never asks twice. The report says it waits, not that it was published, and offers Cancel; after ten failed tries it says so and offers Try again. A newer version replaces one still waiting. The time a note carries is when it was reviewed, so a withdrawal's deletion and notice keep their order (RP7) whichever arrives first. |

## What it does not do

- **Recall.** RP7 replaces and asks; it cannot unsend. A copy someone already took, a screenshot, or an archive
  that keeps every version keeps the report.
- **Publish event time.** RP6. Adding it needs a tag the interchange spec names, and the intake reading it.
- **Replace the Exchange.** Its package path is unchanged. It is still the way to publish a package of several
  reports, and still depends on IPFS.

## Where it lives

- `src/services/intel/reportNote.ts`: the note and the refusals.
- `src/services/publishing/reports.ts`: the review and the send.
- `src/services/intel/publishedReports.ts`: what this browser published.
- `src/services/geoint/statedPrecision.ts`: `geohashOf`, `geohashWithin`.
- `src/services/intel/NostrStarcomIntelIngest.ts`: RP5.
- `src/components/Intel/ReportDetailPanel.tsx`: the Publish and Withdraw buttons, the question, and the published
  or withdrawn line.
- `src/services/intel/intelPersistenceSink.ts` and `IntelReportService.dropReadReport`: a withdrawn report leaves
  storage quietly. `src/services/portfolio/gatherPortfolio.ts`: no withdrawn note is offered as work.
- The interchange spec, rev 20: "Withdrawal".
