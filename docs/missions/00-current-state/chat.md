# Chat

> **What this audit found was repaired by plan item 2.7 (2026-09-27).**
> Direct and team messages are sealed to each recipient and received; see
> the plan's 2.7 entry for how. It is kept as the record of what was wrong.
> For what holds now, run `npm run check:chat` against a build, which is
> the two-profile check below made a committed test.

Audited 2026-09-26. **The first version of this audit was wrong in two places.**
It had read the code without running it, and concluded that contacts could not
be added and direct messages could not be opened. Both work. This version rests
on running the production build with **two browser profiles, talking through an
in-memory Nostr relay inside the test harness.** Every WebSocket was answered
there, so nothing reached a real relay (`scratchpad/ux/chatlive.mjs`,
`chatdm.mjs`).

## Verdict

**The post-quantum core is real, and it runs:**

- Each profile publishes an ML-KEM-768 prekey bundle with 50 one-time prekeys.
- Contacts can be added, and the direct-message window opens.
- Team channels are named so that every member arrives at the same one.
- The X3DH exchange itself is proven by unit tests that check both sides reach
  the same session key (`ad5d34a5`), and one-time prekeys are replenished to
  shrink a known race (`171e8bf4`).

**Three wiring gaps stop it from encrypting or delivering, and group encryption
was never built.** The fix is to **repair and complete** it, keeping the
post-quantum design. The earlier recommendation to rebuild on standard NIP-17 is
withdrawn: NIP-17's encryption (NIP-44) is not post-quantum, and a rebuild would
throw away the ML-KEM layer that works.

## What was verified live

| Check | Result |
|---|---|
| A team message on the wire | Plain text: kind 42 to 5 public relays, reading "Two of the five sites look closed. Checking by phone at 10." |
| The post-quantum prekey bundle | Published: kind 30078, `algorithm=ML-KEM-768`, `prekey-count=50` |
| Adding a contact | Works. The contact shows "Trust 60%". |
| Opening a direct message | Works |
| A → B direct message, both with bundles on the relay | **Plain text:** kind 42 tagged `e=dm-<B's key>`, to 5 relays. Not encrypted, although B's bundle was there to use. |
| Does B receive it? | **No.** Neither side subscribes to direct messages. B → A failed the same way. |
| What the window claims | A lock and "PQC-NIST-3" beside the plain-text message |
| Your own team message | Appears twice: "Unknown User", then "Anonymous" when the relay echoes it |

## Why

1. **Direct messages are addressed to `dm-<key>`.** That prefix was a routing fix
   for the Nostr adapter (`ad5d34a5`). The same commit made the post-quantum
   provider win provider selection, and that service expects the bare key. It
   looks up the recipient's bundle under `dm-<key>`, which is nobody's key, and
   falls back to plain text (`SecureChatIntegrationService.ts:319-347`). The two
   fixes collided.
2. **Nothing listens for direct messages.** Only the team tab subscribes
   (`TeamWorkspaceApplication.tsx:381`), and only to its own channel.
3. **Group encryption was never built.**
   - X3DH is between two people, and team channels were designed to meet at a
     hashed name, not to be encrypted (`80d3e1ad`). So team messages go out in
     plain text.
   - Anyone who knows the team id, which the team broadcast publishes, can work
     out the channel.
4. **Every message is labelled encrypted, whatever happened.** The adapter stamps
   `encrypted: true` in eight places (`SecureChatAdapter.ts:520`, …).
5. **A trust score appears on every contact** ("Trust 60%"). It is a scoring idea
   that Starcom's refusal R-6 (no trust or scoring) rules out, though in practice
   it does not block adding a contact.

## The repair, keeping post-quantum

| Repair | Size |
|---|---|
| **Address:** direct messages go to the recipient's key, without the `dm-` prefix. They are sent as a direct-message event tagged for that recipient, not as a message on a public channel. | S–M |
| **Receive:** subscribe to messages addressed to me, decrypt them with the stored prekey secrets, and thread them by the other person | M |
| **Groups:** encrypt each team message to every member's bundle, reusing the tested X3DH per member; or give each member a sender key, distributed over those sessions | M–L |
| **Honest labels:** "End-to-end encrypted (ML-KEM-768)" only when an envelope was actually produced; otherwise "Not encrypted" | S |
| **Private channels:** team channel ids derive from a secret carried in the invite, not from the public team id; the team broadcast stops | S |
| **Names:** people show by name, not "Unknown User" or "Anonymous", and your own echo appears once | S |
| **Metadata, optional:** wrap the post-quantum envelope in a NIP-59 gift wrap, so relays cannot see who talks to whom. The content stays post-quantum; the wrapper is not. | M |
| **The relay:** the internal team relay, with sign-in required (NIP-42), or any team's own relay (see the registration study) | with plan item 0.3 |

About two weeks in all, and the post-quantum layer survives.

## Tests to add

The two-profile check becomes a committed test with an in-memory relay:

- A and B exchange direct messages, and each sees the other's.
- What crosses the wire is an envelope, not the text.
- A third key cannot read it.
- Labels match what actually happened.

The existing chat tests mock the paths that failed here, which is why none of
this was caught.

## The surfaces

| Surface | How it is reached | State |
|---|---|---|
| **Team Chat tab** (OpsCenter) | OpsCenter → Chat | Delivers within a team channel; plain text; names wrong |
| **Direct messages** (floating window) | Header chat button, or Ctrl+Shift+C, then a contact | Opens and sends; plain text; never received |
| **Case discussion** | None | Deleted 2026-09-12 (`a37cea75`). Comments still refer to it (`TeamWorkspaceApplication.tsx:334`, `645-649`). |
| **Mission comments** | Mission detail | Saved in this browser only; the author shows as a hex key |
| **Header button** | Always visible | Opens direct messages. Its badge counts open windows, not unread messages. |

## Stories for chat

Not yet walked in full. They go into the stories file once walked.

1. An intern creates a team and sends a code. A teammate redeems it on their
   own machine, and both see one channel and one roster.
2. A lead adds a member. The member can read from the point they joined, and the
   app says whether earlier history is visible to them.
3. A member leaves or is removed. Later messages are unreadable to them, and the
   roster records who left and when.
4. An intern messages one teammate privately. Only those two can read it,
   replies stay in the same thread, and it survives a reload.
5. Every message says whether it was end-to-end encrypted. A plain-text channel
   says so.
6. An intern who signs in with their key on a second device sees their teams
   and history. *(Narrowed by decision G2, 2026-09-29, and built as plan item
   9.11: the key is brought to the device through "Your key", and messages
   sent from then on reach every device post-quantum. Teams, names and
   history stay on the device that has them.)*
7. An intern attaches evidence. It is encrypted to the members, and recipients
   see its name, size and hash before opening it.
8. An intern outside OpsCenter is told once about each new message, with the
   sender's name and an unread count, never about their own messages or old
   history.
9. Every message shows a stable name tied to the sender's key, and messages
   from non-members are flagged.
