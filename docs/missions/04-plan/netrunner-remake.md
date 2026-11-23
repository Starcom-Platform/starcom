# NetRunner: what works, and what to fix

Written 2026-09-26 for decision D7: "can we make them work in any meaningful way?"

**The first version of this study overstated the problem.** It was written from
reading the code, and its verdict could be read as saying NetRunner as a whole
does not work. This version rests on running NetRunner in a browser against the
production build. HTTP was real, and every relay connection was answered
locally, so nothing was published (`scratchpad/ux/netlive.mjs`). NetRunner is
substantial, and much of it works. The part that fails is narrow, and its fix
is small.

## What works, verified live

**Keyless recon works in the browser** (SCANNER tab). For `example.com` it
returned:
- 10 names from certificate-transparency logs;
- mail posture (MX, SPF, DMARC);
- registration from RDAP: registered 1995, expiry date, status, nameservers;
- the same answers from two independent resolvers, Google and Cloudflare, and
  "Both resolvers agree";
- a comparison with the last look ("First look at this target — nothing to
  compare against yet");
- a "File 14 entities" action that files them as unverified, with provenance.

It sends nothing to the target itself.

**The desktop app does what a browser cannot** (Electron, the private
`starcom-desktop` submodule). Its native bridge fetches pages directly with the
target's own headers, keeps a SHA-256 evidence store, reads TLS certificates,
probes ports, browses with evidence capture, and runs a local model through
Ollama. The OSINT tab's page scan works there and shows its results in full:
- source code, title, status code and response time;
- vulnerability checks on headers, forms and mixed content;
- technologies, emails, social profiles and server information
  (`NetRunnerCenterView.tsx:340-460`).

**Shodan works with the person's own key.** This was not run live, because it
needs a key.

## What fails, verified

- **The page scan in a browser.** It ends after about 30 seconds with a clear
  message: "No route to https://example.com. All CORS proxies failed … The
  Starcom desktop host fetches directly and needs none of them." Probed today:
  - allorigins timed out (522);
  - cors-anywhere refused (403, a demo that needs manual opt-in);
  - codetabs timed out (522).

  A browser tab cannot read another site's pages unless that site allows it.
  That is the browser's rule, not a bug in NetRunner.
- **The four sidebar scripts** (email extractor, domain parser, technology-stack
  analyzer, contact harvester) receive the scanner's extracted lists instead of
  the page (`NetRunnerLeftSideBar.tsx:167-174`). Two of them read page fields
  those lists do not have. Their results go only to the browser console. **Their
  purpose is largely done already by the scanner itself on desktop,** which
  extracts technologies, emails and social profiles from the real page.
- **Two security tools never run.** Every mission sends the operation "search",
  which Censys and VirusTotal do not offer (`BotMissionExecutor.ts:609`).
  theHarvester has no endpoint configured.
- **Hard-coded status.** "Neural Commander"'s green light, and the Bot Roster's
  "All systems operational".
- **On load,** NetRunner calls two Solana RPC endpoints and Discord's widget API
  before anyone does anything.

## Fix first: small and specific

| Fix | Size |
|---|---|
| Give the scripts the page itself (HTML, text, headers, final URL) as the scanner fetched it, and show their results in the OSINT results area | S–M |
| Send each bot tool an operation it accepts (Censys, VirusTotal); retire theHarvester or configure it | S |
| Status lights that show real state: the model's actual status, and the roster's real mission state | S |
| No wallet or Discord calls until someone uses them | S |
| In the browser, say up front that page scans need the desktop app or a fetch worker, and point to recon; stop trying dead proxies | S |

## Then make page tools reach browser users

Interns use the browser, so page fetching needs a route. The options are in
question N4:

- **Desktop builds for interns:** the fetch path exists and works, but it needs
  signing and a way to distribute builds.
- **A fetch worker on the operator's node:** the browser sends an encrypted job,
  the node fetches the page and returns it with a signed digest, and results
  read "fetched by <node>". It needs a guard against requests to internal
  addresses.
- **Recon only, for now.**

**Answered 2026-10-11 by the owner: a browser extension, Starcom Uplink**
(record `01-architecture-decisions/browser-extension.md`, D-EX). The person's own
browser fetches the page through the extension's broker, under the rules below,
and NetRunner's tools move onto it in phase E1, before the cohort.

## Improvements after that

These are the earlier remakes, now improvements rather than repairs:

| Improvement | What it adds |
|---|---|
| **An organisation contact card** | For tasks like "check each listed food bank's status by phone": reads the organisation's published phone number, address, hours and official email from its structured data, `tel:` and `mailto:` links and contact page. A person's details are hidden unless they hold a public role. |
| **Official channels** | Tells role addresses (info@, press@) from named ones, and checks mail setup over DNS. No mailbox probing. |
| **A results panel with "File to case"** | Every tool's results can be filed into a case deliberately, with method and provenance, as recon already does |

## Rules every tool keeps

These come from Starcom's published refusals:

- **R-4:** never re-link pseudonyms to people.
- **R-7:** never publish a claim naming a private individual.
- **R-9:** always state weak backing.
- **A stated purpose for every run.**
- **Unfiled results last only for the session.**
- **Nothing is ever auto-published.**
- **"Could not look" is recorded differently from "found nothing".**
