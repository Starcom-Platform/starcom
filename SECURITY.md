# Security

Report a vulnerability privately, never in a public issue.

**Where:** the Nostr key in [`/.well-known/security.txt`](https://starcom.app/.well-known/security.txt). Starcom runs
no server, so a Nostr key is the channel that provably exists. Anyone can send to it over the relays listed in
[`/.well-known/starcom-node.json`](https://starcom.app/.well-known/starcom-node.json).

**What to include:**
- what you found and where;
- how to reproduce it;
- what it would let someone do;
- whether you have told anyone else.

**In scope:**
- the web app in this repository;
- Starcom Uplink, the browser extension in `extension/`;
- the protocol and its vectors in `docs/spec/`;
- what the app publishes and signs.

**What a report can and cannot achieve:** Starcom has no account to suspend and no database to delete from. The
[security policy](https://starcom.app/.well-known/security-policy.md) says plainly what can be done about a report,
rather than implying more.
