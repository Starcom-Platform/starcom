# Decision D-DR: The desktop app as a relay

**Status:** proposed 21 November 2026, stage 1 only; not built. The owner asked whether Starcom Desktop could let the
computer it runs on operate as a relay, and said "proceed" to the staged answer: a personal relay first, a Zone
mirror and a full node later. Part of the EIN plan's Node profile ("EIN at global scale: the plan, with Starcom as
the reference", 20 Nov 2026).

The same day the owner asked whether Starcom Uplink could relay too, and agreed to the answer recorded as DR8. The work
is scoped, package by package, in [`relay-capability-work.md`](../04-plan/relay-capability-work.md).

## Why

- **For the person:** what they publish is kept on their own computer whatever the public relays drop; what they
  write offline waits there and goes when they are back online; the Zones they watch open fast and without a
  connection.
- **For the EIN:** the same component, run without a window, becomes a node anyone can stand up from Starcom's own
  code: the reference for the Node profile, as the web app is for Reader and Publisher.

## What was decided

| # | Decision |
|---|---|
| DR1 | **Stage 1 is a personal relay, reachable only from the same computer** (127.0.0.1 and ::1). Off until the person turns it on in Settings. It holds the notes the person signs, what they publish while offline until it can go, and a copy of the Zones they watch. It keeps in step with the relays the app reads and publishes to, by NIP-77 where a relay supports it, else by reading what is new since the last sync. |
| DR2 | **Its own process, holding nothing it does not need.** A new Zone 5, beside the desktop's Zones 0 to 4 (`desktop/docs/security/browsing-key-boundary.md`): no key, no capability, no browsing context. It talks to the main process (Zone 2) only to start, stop and report how much it holds. Its database lives in its own folder; Settings > This device clears it. |
| DR3 | **A proven relay, embedded, never one written here.** Candidates: nostr-rs-relay (Rust, SQLite) and khatru (Go), shipped as a helper program for each OS and signed with the app. strfry, which The Record runs, builds for Linux and macOS only. Chosen by measurement: builds for macOS, Windows and Linux, NIP-77, a write policy hook, memory and disk at rest, and a licence compatible with AGPL-3.0, checked before the choice. |
| DR4 | **Bounded.** The person sets how much disk it may use. Others' notes age out first; the person's own notes are never dropped to make room. |
| DR5 | **The app uses it as one more relay, and says so.** The publish review names it as a destination of its own ("This computer"), beside the public relays; nothing goes there unnamed. Reads ask it first. |
| DR6 | **Stages 2 and 3 wait.** A Zone mirror others can reach (as blackpi mirrors The Record), and a node that accepts others' writes (also run without a window, as "Starcom Node", on a Raspberry Pi, a server or the Jetson), wait for: the EIN node directory (plan Phase 1), a tunnel that keeps the home's IP address private, declared logging and retention, and an operator of record (open question O3 applies to every such node). |
| DR7 | **Said where it matters.** The people's data register gets an entry for what it holds; Starcom's node descriptor names it when it is on; the desktop's security document gains Zone 5. |
| DR8 | **In a browser, Uplink keeps; it does not relay.** Chrome, Brave and Firefox let an extension open connections but never accept one, and run its background only while the browser is open, so Uplink can never be a relay anyone connects to. Later, and only if people still lose publishes once the app's own outbox covers every publish (work package W1), Uplink may keep that outbox and the person's own signed notes in its storage, which survives clearing a site's data. It may also send what waits while the browser runs, even with no Starcom tab open. It sends only events already signed, after a publish review, to the relays that review named; it signs nothing for this. |
| DR9 | **Loopback is not private.** Any program on the computer, and any web page open in any browser on it, can try to connect to a relay on 127.0.0.1. Stage 1's relay refuses every connection whose `Origin` is not the desktop app's own scheme, takes a token made fresh at each start and handed to the app over IPC only, and accepts writes only on the app's connection. A program running as the person can read the relay's files anyway; the lock is against web pages, and the security document says so. |

## What stage 1 does not do

- Accept a connection from another computer.
- Sign anything, or hold a key.
- Pass anyone's notes on to anyone else.

## Open

- Which relay software (DR3), measured on all three operating systems, including whether it can refuse a connection
  by its `Origin` (DR9).
- Windows and Linux builds of the desktop app, and signing them (decision B13 in `desktop/README.md`); the relay
  helper must be signed with whatever signs the app.
- The default disk allowance (DR4).
