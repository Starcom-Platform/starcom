# Starcom Uplink: the store listing

What goes into the Chrome Web Store's developer dashboard for Starcom Uplink
(decision D-EX, E0 item 7), field by field, and what Firefox's add-on site
asks beyond it. Brave installs from the Chrome Web Store.

The reasons below are `extension/permissions.json`'s, word for word, and
`scripts/guard-uplink-permissions.mjs` holds them to it: change a reason
there, and this file and the privacy page with it.

**Before each upload:** the description says what the version uploaded does,
no more. The text here is for 0.1.0; each feature that ships adds its line.

## Store listing tab

**Name** (from the manifest): Starcom Uplink

**Summary** (from the manifest, 132 characters at most): Connects your
Starcom investigations to your browser. Asks before it touches any site, says
why, and logs what it does.

**Description:**

> Starcom Uplink is the browser extension for Starcom (starcom.app):
> decentralized OSINT on Nostr. It connects Starcom to your browser, so your
> investigations can reach the sites you allow, one at a time.
>
> What it does now:
>
> - Tells Starcom it is here, and what it can do, so Starcom's features that
>   use it light up.
> - Asks you before it reaches any site: for that one site, in its own
>   window, with the feature that wants it and why.
> - Keeps an activity log of everything it is asked to do, the purpose given,
>   and what came of it, refusals included. You read it under its icon.
> - Lets you take back any site you allowed, at any time.
> - Never reaches an address on a private or local network.
>
> It collects nothing about you, runs no code from anywhere but its own
> package, and changes no page you visit.
>
> Starcom adds features to Uplink one at a time; each asks for what it needs
> when you first use it.
>
> Privacy: https://starcom.app/uplink/privacy.html

**Category:** Productivity, then Tools.

**Language:** English.

**Graphic assets:**

- Icon, 128 × 128: `extension/public/icon/128.png`, Starcom's emblem.
- Screenshots, 1280 × 800: still to make, from the popup, the grant window and
  the activity log.
- Small promo tile, 440 × 280: still to make.

**Official URL / homepage:** https://starcom.app

## Privacy practices tab

**Single purpose:**

> Starcom Uplink connects Starcom (starcom.app) to your browser, so your
> Starcom investigations can reach the sites you allow, one site at a time,
> each asked for with its reason, and everything it does logged where you can
> read it.

**Permission justifications:**

- `storage`:

  > Keeps Uplink's activity log and your settings in this browser. Nothing
  > stored is sent anywhere; Starcom's page, open in this browser, reads the
  > log only to show it to you.

- `scripting`:

  > Adds Uplink's bridge to Starcom tabs already open when Uplink was
  > installed or updated, and, when you capture a page as evidence, reads that
  > page's HTML and text at your click. It runs nowhere else.

- `contextMenus`:

  > Adds "Send to Starcom" to the menu you get by right-clicking a selection, a link, an image or a web page. Nothing is captured until you choose it.

- `activeTab`:

  > When you send a page to Starcom or capture it as evidence, lets Uplink
  > read that one tab, at that moment only: its address and title, and for
  > evidence a picture of it, its HTML and its text. It reaches no other tab,
  > and nothing after.

- `unlimitedStorage`:

  > Lets Uplink hold an evidence capture's picture and page copy, which can pass the browser's usual 10 MB, until Starcom takes them in. They leave Uplink's storage once Starcom has kept them.

- `sidePanel`:

  > Shows Starcom beside the page you are reading, in the browser's side panel, when you open it. It is Starcom's own page, holding the case your captures go to.

**Host permission justification** (the dashboard has one field; both paragraphs
go in it):

> Runs Uplink's bridge on Starcom's own pages, and adds it to Starcom tabs
> already open when Uplink is installed or updated, so Starcom can ask Uplink
> what it can do and ask it to act, always with a stated purpose. The bridge
> passes only those messages and reads nothing else on the page.
>
> Optional, and never granted at install. When a feature needs a site, Uplink
> asks you for that one site in its own window, saying which feature wants it
> and why, and you can take any site back in Uplink's options. Power mode,
> which only you can turn on, asks for all sites at once. Uplink never asks
> for an address on a private or local network.

**Remote code:** No, I am not using remote code.

> None. Everything Uplink runs is in its package; it loads no code from
> anywhere and evaluates nothing it receives.

**Data usage:** tick none of the kinds of data; Uplink collects none.

> None. Uplink sends nothing about you or your browsing off your device: no
> analytics, no telemetry, no tracking. If you turn on timestamps, each
> evidence capture sends one blinded hash, from which nothing about the page
> can be learned, to two public OpenTimestamps calendars. When NetRunner
> reads a site you allowed, Uplink fetches it without your cookies. That
> answer, and what you capture, go to Starcom's page in this same browser,
> and leave it only when you publish or send them.

Then tick all three statements: no selling to third parties, no use or
transfer for purposes unrelated to the single purpose, and no use or transfer
to decide creditworthiness or for lending.

**Privacy policy URL:** https://starcom.app/uplink/privacy.html

## Distribution

**Visibility:** Unlisted first, for the interns and testers (EX7); public
after the cohort's first weeks.

**Broad access:** the optional `https://*/*` and `http://*/*` patterns mean a
longer review, 1–3 weeks rather than about a day (EX3).

## Firefox (E8, later)

- Its manifest declares `data_collection_permissions: { required: ["none"] }`,
  which Firefox's add-on site requires of every new add-on, and so it needs
  Firefox 140 or later.
- The listing's text above serves there too.
