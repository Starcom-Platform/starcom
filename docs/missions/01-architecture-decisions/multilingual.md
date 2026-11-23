# Decision D-ML — Starcom in many languages

## The ask (the owner, 2026-10-11, taken up early 2026-10-12)

"Advanced language-conversion and multi-lingual support systems. Priorities
include [Swahili, German, Portuguese (specifically Baiana), India-languages,
Ukraine]." Taken up while the extension's first wave waits on the owner (D-EX,
EX36).

And, when asked what to cover first: "We're going to need something powerful
and capable of auto-translation too: some people abroad will be writing intel
reports in languages native to their zone… that's not in-app code we control.
How can we handle this? If we can do something client-side, that is
preferred. No APIs, unless that's the only option; if so, it's likely going
to need to be a BYOK scenario."

## What was found (2026-10-12)

- **The interface has no translation layer.** One typed catalogue,
  `src/i18n/messages.ts`, translates the static public claim pages (English
  and Spanish), built by `scripts/build-commons.mjs` and checked by
  `scripts/check-i18n.mjs`. It deliberately has no i18n library: the first
  visit's weight is a tracked defect. A locale missing a key does not
  compile.
- **Browsers translate on the device.** Chrome's built-in Translator and
  LanguageDetector are offered to web pages from Chrome 138, desktop only.
  **Brave 155 offers both too**, measured 2026-10-12. German, Hindi,
  Ukrainian and Portuguese to English are "downloadable"; Swahili is
  "unavailable". Not yet seen: a language pack actually downloading in
  Brave.
- **The gaps.** Firefox offers web pages no translator, phones get none,
  and no browser has Swahili.
  - OPUS-MT, CC BY 4.0, has no Swahili-to-English model of its own. Its
    Bantu group model scores BLEU 4.6 on Swahili, which is unusable.
  - NLLB-200 (distilled, 600M) covers all five languages in one model, and
    runs in a browser through ONNX (transformers.js). Its licence is CC
    BY-NC 4.0.
- **Scripts and fonts.** IBM Plex Sans and JetBrains Mono cover Latin and
  Cyrillic. Hindi needs Devanagari: IBM Plex Sans Devanagari, under the
  same licence. Oxanium, the display face, has no Cyrillic or Devanagari,
  so headings fall back to Plex for those.
- **Read before T1 and T2 (2026-10-12).** Chrome's Translator and
  Language Detector run on the device, on desktop Chrome, Brave and Edge;
  Google's Generative AI Prohibited Use Policy applies, and its rule
  against passing machine output off as a person's is met by marking every
  translation. NLLB-200's card says "not released for production
  deployment" and "not intended to be used for document translation",
  inputs to 512 tokens, and it is about 900 MB quantized, not the 600 MB
  first recorded. M2M-100 418M is MIT-licensed, has no such limits, covers
  all five languages, and is about 630 MB quantized; it is generally
  weaker on low-resource languages. Hence ML12.
- **"Bahian" and "Baiana" are the same thing.** "Bahian" is the English
  adjective for Bahia; *baiano/baiana* is the Portuguese. The owner has an
  exceptional reason to support it.

## Decisions (the owner, 2026-10-12)

| # | Question | Decided |
|---|---|---|
| ML1 | What comes first | **The interface,** starting with what interns touch: cases, captures, evidence, Your key, Uplink. Content translation follows. |
| ML2 | Which Indian languages | **Hindi** first. |
| ML3 | Who writes the translations | **AI-drafted, shipped and marked as machine-drafted** until someone reviews a language. |
| ML4 | Portuguese | **Baiana:** Brazilian Portuguese as the base, with a Baiana layer wherever the words or tone differ. |
| ML5 | What translates content the browser cannot (Swahili; Firefox; phones) | **Starcom's own model:** NLLB-200 run in the browser, downloaded once (about 600 MB) when the person chooses. Its non-commercial licence is fine while Starcom is unmonetized (D-L, L1), and is revisited if that changes. |
| ML6 | A cloud service, with the person's own key | **Opt-in, for Public content only:** a last resort the person turns on; refused for anything not marked Public, and said so. |
| ML7 | Sharing translations | **Device first, sharing next:** on-device translation first; then signed, marked translations of public intel are published so others need not redo them. |
| ML8 | Where Starcom Uplink takes its language (2026-10-12) | **Follows Starcom:** when a Starcom page connects, Uplink learns the language chosen there, the Bahia layer included, and keeps it; before any page has connected, the browser's language. |
| ML9 | Consent in Uplink's windows (grant, sign, key) | **The language, with the English beneath** each consent sentence, in small type, until a native speaker has reviewed that language. A mistranslation cannot silently change what someone agrees to. |
| ML10 | The store listing and the manifest's name and description | **English until Chrome's review;** localized listing and manifest strings follow once the store item exists and the owner has read the listing. |
| ML11 | Order | **L5, then T1:** Uplink's own pages first, finishing the interface (ML1); then the browser's translator, after its policy and NLLB-200's licence are read against the licensing record. |
| ML12 | Starcom's own model, now that NLLB-200's card is read (2026-10-12) | **Measure both, then choose:** NLLB-200 and M2M-100 run on the same real Swahili, Hindi and Ukrainian sentences on this machine, their outputs shown side by side, and the owner picks. After T1. ML5's engine waits on it. |
| ML13 | Where the model is downloaded from | **Hugging Face directly:** the person's browser fetches the weights from Hugging Face's CDN, which sees the download and never any text; the download prompt says where it comes from, and the CSP allows that host only for it. |
| ML14 | Content whose source forbids translation (the owner, recorded in D-ZS, 2026-10-12) | **Read on the device, never published:** a note tagged `["translate", "reader-only", "<why>"]` (Interchange 3.9), or whose `license` allows no derivatives (ND), may be translated for its reader like any other (T1, T2), but its translation is never published or shared (T4), and the tag's reason is said where sharing would be offered. |
| ML15 | Starcom's own model, measured (2026-10-12) | **NLLB-200** (distilled 600M), as ML5 first chose: clearly better than M2M-100 in every language measured, most of all Swahili. Each translation says it is a research model's, made on this device; text goes in sentence by sentence, within its 512-token limit; the ~900 MB download is the person's choice, from Hugging Face (ML13). Its non-commercial licence is read again before Starcom earns money in any way (D-L, S1–S5). |
| ML16 | When T3 (2026-10-12) | **Now:** with NLLB-200 covering desktops, the cloud helps phones and speed; built and tested once, with the Public-only rule. |
| ML17 | Which providers | **Both, the person picks:** Microsoft Azure Translator ("no trace": the text is never stored) and Google Cloud Translation (not used for training; its key can be restricted to starcom.app). Both answer a page directly; DeepL does not. |
| ML18 | Where the person's key is kept | **In this browser, on this device, said plainly:** sent only to the provider chosen, removable in Settings. The person is told to restrict the key where the provider allows it. |

## Rules every translation keeps

- **The original is kept, and shown.** A translation never replaces it, and
  a signed record keeps the words it was signed with.
- **Marked as machine-made,** with the engine that made it and the
  language it was read as.
- **Nothing leaves the device** unless the person turned on the cloud
  service, and then only Public content (ML6).
- **A translation grades nothing.** A report's reliability is unchanged by
  being read in another language.
- **A translation of words their source forbids translating is never
  published** (ML14): read on the device, yes; shared, no, and why is said.

## The plan

### Interface (ML1–ML4)

| # | Step | Days |
|---|---|---|
| L1 | The foundation: the typed catalogue grown to the app, a `t()` with named placeholders and plurals by `Intl.PluralRules` (Ukrainian has four forms), the person's language chosen in settings or from the browser, `lang` set on the page, a draft notice for machine-drafted languages | 1.5 |
| L2 | Fonts: Plex Sans Devanagari, loaded only when Hindi is chosen; the display face falling back for Cyrillic and Devanagari | 0.5 |
| L3 | The intern path's words into the catalogue: header, Your key, the Captures inbox, cases, the evidence viewer, the Uplink panel | 3 |
| L4 | Drafts in German, Brazilian Portuguese with its Baiana layer, Swahili, Hindi and Ukrainian, marked machine-drafted (ML3) | 1.5 |
| L5 | Uplink's own pages, in the same catalogue form | 1 |

### Content (ML5–ML7)

| # | Step | Days |
|---|---|---|
| T1 | The browser's own translator: a report, capture or message read in its language, a "Translate" beside it, the original kept, the translation marked; language packs downloaded at the person's click | 1.5 |
| T2 | Starcom's own model for the gaps (ML5): NLLB-200 in a worker, WebGPU where there is one, downloaded once at the person's choice and kept | 2.5 |
| T3 | The cloud with the person's own key (ML6): Google or Azure, Public content only, each provider's terms read first | 1 |
| T4 | Sharing (ML7): signed, marked translations of public intel, linked to their originals | later |

Before T1 and T2: the Chrome built-in AI policies, and NLLB-200's licence
text, are read against the licensing record (D-L).

## Step notes

### L1: the foundation (2026-10-12)

- **One store, no library** (`src/i18n/app/`). English (`en.ts`) is the
  source; each other language is typed against it, so a language missing a
  word does not compile, and a test checks every language holds every word
  and no other. Components read `useMessages()`; a count is said by
  `counted()` with `Intl.PluralRules`, so Ukrainian's one, few and many each
  have their form, and Hindi's zero is "one".
- **The first visit carries no language but English.** Each other language
  is its own chunk, loaded when chosen: measured in the build, none of their
  words are in the main bundle.
- **Which language:** the person's choice in Settings > Language, kept in
  this browser; else the browser's first language Starcom has; else
  English. Any Portuguese is offered as Brazilian; the Bahia layer is only
  ever chosen. The page's `lang` follows it.
- **Said plainly:** a language not yet checked by a native speaker says so
  (ML3), and that parts of Starcom still show in English. The Bahia layer
  says it waits for someone from Bahia.
- **The house style holds:** `en.ts` is read by the copy-length guard.
  Other languages are not held to an English sentence's length.
- **Translated so far:** the Settings panel and the language picker, in all
  six. Checked in a real browser in Ukrainian, Hindi and the Bahia layer:
  the page's language set, Settings in it, no page errors.

### L2: Hindi's script (2026-10-12)

- **IBM Plex Sans Devanagari** (OFL-1.1, the same version as Plex Sans)
  joins the text and display stacks right after Plex Sans. Its faces are
  declared at load, and fetched only when Devanagari is drawn.
- **Measured in a real browser:** an English visit fetched no Devanagari
  file. In Hindi, two were fetched, and Settings was drawn in Plex
  Devanagari. Ukrainian already had Plex's own Cyrillic, fetched the same
  way.

### L3, first part: the Uplink path (2026-10-12)

- **Translated, in all six:** the Captures inbox, the evidence viewer,
  the Uplink chip in the header (with each capability Uplink names, a test
  holding it to the protocol's list), and the side panel's page.
- **Words with elements in them** ("From {page}, captured {when}.") are
  filled by `fillNodes`, so each language puts the link and the time where
  its word order wants them. Lists ("picture, page HTML and page text")
  are joined by `Intl.ListFormat`, and numbers written as the language
  writes them.
- **Still English, and said to be:** messages that come from services and
  from Uplink (a failure's reason, Uplink's notes), and the browser menu's
  "Send to Starcom", quoted as it is until Uplink's own pages are
  translated (L5).

### L3, second part: Your key (2026-10-12)

- **Translated, in all six:** the Your key panel and its header button,
  from who you are and who holds the key, through moving it into Uplink,
  backing it up and bringing it from another device, to the work copy and
  the portfolio.
- **Counts are said in each language's own forms.** A test holds each
  count to exactly the forms that language's plural rules use: Ukrainian
  has one, few and many ("1 справа, 3 справи, 5 справ"), and Portuguese
  a form for whole millions ("1.000.000 de casos"). Numbers inside a count
  are written as the language writes them.
- **English is unchanged,** checked by the panel's existing tests. Its
  lists keep the house style, with no comma before "and". Quoted titles
  take each language's own quotation marks: „…“, «…», “…”.
- **Checked in a real browser** in Ukrainian, Hindi, German, Swahili and
  the Bahia layer: the panel in each, no page errors.
- **Still English:** reasons that come from services ("No copy was made:"
  is translated, the reason after it is not), and the "?" help beside the
  heading.

### L3, third part: the header (2026-10-12)

- **Translated, in all six:** the search box, what each result is
  ("Case", "Zone of 8 Sectors · opens it on the globe"), the commands'
  descriptions, and the buttons beside it: the Store, community, sound,
  chat and Settings.
- **Counts here follow the language's plural forms too.** A Zone with one
  Sector now says "1 Sector" in English, where it said "1 Sectors"; a test
  holds it. The chat's relay count is said as Ukrainian says 3, 5 and 21.
- **Checked in a real browser** in Ukrainian and Hindi: the search box,
  a search's results with their kind, the sound button, no page errors.
- **Still English:** the applications' names and descriptions, which the
  navigation shares and translates with it; the glossary; layer names
  ("Resource Zones"), quoted as they appear on the globe; place names.

### L3, fourth part: the words every screen shares (2026-10-12)

- **Translated, in all six:** each status of a report, case and mission,
  with what it means and the moves between them; how serious something
  is; who may receive a record, its three choices and what each does; and
  how sensitive a description is. Cases, missions and reports all draw
  these, so each screen gains them before its own words are done.
- **One question, not a phrase dropped into one.** "Who may receive
  {what}?" took an English phrase, "this case", which no other language
  could use. Callers now name what it is (a case, a report, a package), and
  each language asks its own whole question.
- **One English source.** The status words and the distribution and
  sensitivity labels moved from their modules into the catalogue, and the
  modules read them from it.
- **Checked in a real browser** in Ukrainian: the new-case dialog's
  question and choices, nothing chosen, and the saved case's chips.

### L3, fifth part: the cases list (2026-10-12)

- **Translated, in all six:** the cases list, its tabs, columns and counts,
  the empty states, a row's actions, the pages under the table, and the
  new-case dialog.
- **A priority is named as its badge names it:** "Medium", where the menu
  showed the stored code "MEDIUM".
- **Checked in a real browser** in Hindi: the empty state, a case made
  through the dialog, and the list with its chips. No page errors.
- **Still English:** where a case's position would be published, which
  the publishing services word; and "encrypted" notes from the epistemic
  vocabulary.

### L3, sixth part: dates on screen (2026-10-12)

- **A date on screen is written as the language writes it,** still in UTC:
  "12 अक्टू॰ 2026", "14 вер. 2026 р.", "14. Sept. 2026". The time stays
  "19:33Z" in every language (D-E), and the local time on hover is
  introduced in the language ("Місцевий час: …").
- **Only the screen changes.** Cards, captions and anything published keep
  the house form ("14 Sep 2026"), so a published image never carries the
  language of whoever made it. English on screen is unchanged.
- **Checked in a real browser** in Hindi: a case's start date.

### L3, seventh part: a case's page (2026-10-12)

- **Translated, in all six:** a case's page: its two parts, linked and
  contradicting evidence, the position with its verdicts and what it rests
  on, publishing it, what is still needed and each requirement's state,
  and the missions built from it.
- **Three things now read as words in English too:** a verdict
  ("Substantiated", where it showed "substantiated"), a requirement's
  state ("Waiting on evidence", where it showed "pending-evidence"), and a
  report's stage ("Draft", where it showed "DRAFT").
- **Checked in a real browser** in German: a case made, opened, and a
  requirement raised. No page errors.
- **Still English on the page:** the Export and Send buttons, the reviews
  under a published position, and the From line of a received case: shared
  parts that reports and missions draw too, translated next.

### L3, eighth part: sending, exporting, reviews (2026-10-12)

- **Translated, in all six:** Export as file and Send to… with their
  dialog, what stays out of a file, a received record's From line, and the
  reviews panel under anything published. Cases, missions and reports all
  draw them.
- **A From line keeps its sender and time where each language puts
  them,** and counts what the sender kept Private by its plural forms; a
  test holds it in Ukrainian, and English as it was.
- **Checked in a real browser** in Swahili: a case's Export and Send.
- **Still English:** why a record cannot be sent or exported ("This case
  is Private: …"), which the bundle services word. That and the other
  reasons services give are the next piece: the screens are translated,
  and their explanations should be too.

### L3, ninth part: the reasons behind a distribution (2026-10-12)

- **Translated, in all six:** why a record cannot be sent or exported,
  where it would be published or why nowhere, and what choosing each
  distribution lets happen. On the case path these are now said in the
  language shown.
- **A whole sentence for each kind of record.** "This {what} is Private"
  cannot be said in German or Ukrainian without the noun's gender, so each
  of case, mission, report and review has its own sentence ("Diese Mission
  ist privat: sie bleibt…", "Цей звіт обмежений…").
- **The services take the words they are handed,** English by default, as
  the header's search and the status words do. Screens not yet translated
  (reports, missions) and errors a service throws still say them in
  English, until those screens are done.
- **Checked in a real browser** in Ukrainian: the new-case dialog
  explaining each distribution.

### L5, first part: Uplink's own pages (2026-10-12)

- **Uplink follows Starcom (ML8).** Each hello from a Starcom page now
  carries the language it shows, and a change of language is told at
  once. Uplink keeps it only from Starcom's own pages, and only a language
  Starcom has. Before any page has told it, Uplink reads the browser's
  language; the Bahia layer reads Brazilian Portuguese here.
- **Translated, in all six:** the popup, the options page with its
  activity log, the grant, key and sign windows, the right-click menu
  (renamed when the language changes), the icon's title, and the
  activity log's own entries.
- **Consent carries the English beneath (ML9).** In a language not yet
  reviewed, each sentence and button in the grant, key and sign windows
  shows its English in small type underneath.
- **A catalogue of its own** (`src/i18n/uplink/`), typed like the app's and
  held by the same tests: every language holds every word, and each count
  has its language's plural forms. Uplink's pages carry no React and none
  of the app's words.
- **The sources zip carries each language,** now that the shared-file
  closure follows `import()` too. Rebuilt from the zip alone, all 31 files
  of the Firefox package matched byte for byte.
- **Checked in Brave** with the development build: Starcom in Ukrainian
  told Uplink, its popup and options were in Ukrainian, and the grant and
  key windows showed the English beneath. Back in English, Uplink followed.
- **Still English in Uplink's windows:** the purpose Starcom gives with
  each request ("Read the registry record for …"), which is the app's text.
  That is the next part: Starcom sends it in the language shown, with its
  English beside it, for the English beneath.

### L5, second part: why Starcom asks (2026-10-12)

- **Starcom says why in the language shown, with the English beside it.**
  A request carries its purpose and, when that is not English, the English
  too; Uplink's windows show it beneath, as ML9 asks of every sentence
  that asks. The purposes on the intern path are in the catalogue: signing,
  sealing and opening messages, moving the key and checking it, the
  inbox count, which sites Uplink may reach, and taking captures.
- **What is signed is named in Uplink's own words** for it, loaded only
  when Uplink signs ("Von Starcom aus einen Lagebericht veröffentlichen").
- **Uplink's own purpose** for timestamping evidence is in its catalogue.
- **Checked in Brave,** through the app's own "Move my key into Uplink" in
  Ukrainian: the key window showed Starcom's purpose in Ukrainian with the
  English beneath; cancelled, Uplink kept no key.
- **Still English:** a refusal's words and reason as Starcom shows them
  ("Ключ не перенесено: You declined: you did not set a passphrase"), the
  reasons Uplink gives, and NetRunner's purposes, which come with
  NetRunner's screens.

### L5, third part: when Uplink says no (2026-10-12)

- **Uplink gives its reasons in its language:** not allowed, not signed,
  no passphrase set, the key not unlocked or not opened, another key held,
  a site not among those allowed, a message not sealed for the person.
  Reasons that only a malformed request from Starcom could meet stay as
  they are: no person reads them.
- **Starcom says the refusal in the language shown,** then Uplink's
  reason: "Ключ не перенесено: Ви відмовили: ви не задали парольну фразу".
  Its refusal words are copied from Uplink's drafts, so both say the same.
- **Checked in Brave** through the same key move in Ukrainian: the whole
  sentence in Ukrainian.
- **The privacy page** says Uplink keeps the language, told only by
  Starcom's page.

### T1: the browser's own translator (2026-10-12)

- **"Translate into {language}" beneath a report's words,** in the globe's
  report popup (reports others published) and the report panel's summary
  and content. Offered only where the words seem to be in another
  language, and only in a browser that translates for pages: Chrome,
  Brave and Edge on a desktop.
- **On this device, at a click.** The browser fetches its translator for
  the language once, at the person's click, and says how far it has come;
  then the words are translated where they are, paragraph by paragraph.
  Nothing is sent anywhere.
- **The rules hold:** the original stays above, untouched; the
  translation beneath is marked "Machine translation from German, by your
  browser on this device"; a browser that cannot translate a language
  says so (Swahili, in Chrome and Brave today).
- **Which language it is in:** the browser's detector, when it has its
  model (Brave and a fresh Chrome have none); else the words' script
  (Devanagari, Cyrillic with Ukrainian's own letters) and their commonest
  short words; else the person says, from a list.
- **Checked in Brave,** with a visible window: a German report written
  through the app, opened, translated at a click; the pack fetched (0%,
  26%, 87%), then "The river rose by three meters overnight." beneath the
  original, marked. Measured first on example.com: a pack downloads at a
  click in both Brave and Chrome, and Swahili is unavailable either way.
- **Not yet:** chat messages and captures; Firefox and phones (T2, once
  the model is chosen under ML12); and a report saying the language it is
  written in when it is published, which would spare the guess (with T4).

### ML12: NLLB-200 and M2M-100 measured (2026-10-12)

The same 40 real news sentences in each language (NTREX-128, Microsoft,
CC BY-SA 4.0: one English set translated by people into 128 languages),
each model translating into English, scored by chrF against the people's
English. Quantized as a browser would fetch them; run on this Mac's CPU,
in Node, one model at a time.

| Into English from | M2M-100 418M (MIT) | NLLB-200 600M (CC BY-NC) |
|---|---|---|
| Swahili | 54.4 | **64.3** |
| Hindi | 53.7 | **61.2** |
| Ukrainian | 53.0 | **60.8** |
| German | 60.4 | **65.4** |
| Portuguese | 61.9 | **69.9** |
| Time a sentence, CPU | about 1.6 s | 3.4 to 4.6 s |
| Memory | 1.3 GB | 1.6 GB |
| Download | about 630 MB | about 900 MB |

Three of the sentences, as each model gave them:

- People: "Giles added the victim sustained traumatic injuries to his upper
  torso area." From Swahili, M2M: "the affected was injured in his top two
  parts"; NLLB: "the victim suffered injuries to the upper part of his
  body". From Ukrainian, M2M: "traumatic injury to the top of the tub";
  NLLB: "suffered traumatic upper torso injuries".
- People: "He noted that Kim is interested in a second meeting after their
  initial meeting in Singapore in June was hailed by Trump as a big step".
  From Swahili, M2M: "Kim is going to continue to attend a second
  meeting"; NLLB: "Kim would prefer a second meeting … was hailed by Trump
  as a major step".
- Both miss idiom ("open minded" became "independent" or "unbiased"):
  machine translation of a report is for understanding, never for quoting.

### T2: Starcom's own translator, NLLB-200 (2026-10-12)

- **Where the browser cannot, Starcom's own translator can.** When the
  browser has no translator for the pair (Swahili, today) or none at all
  (Firefox, phones), "Translate" offers NLLB-200: what it is, that it is
  about 900 MB, fetched once from Hugging Face, which sees the download
  but never the words. Only at the person's yes is anything fetched; once
  kept, it is used at once next time.
- **On this device, in a worker.** The model runs off the page's thread,
  bundled on its own (908 KB of code, and ONNX Runtime's 21.6 MB
  WebAssembly served from Starcom only to those who use it): nothing of it
  is in the first visit. Text goes in sentence by sentence, within the
  model's 512-token limit; the progress is said, fetching then sentence by
  sentence.
- **Marked, with its licence's credit:** "Machine translation from Swahili
  by NLLB-200 (Meta, CC BY-NC 4.0), a research model, on this device".
- **The page's policy needed no change.** It already allows WebAssembly,
  workers from Starcom, and HTTPS connections; only ONNX Runtime's default
  of loading itself from a CDN would have been refused, so Starcom serves
  that file itself. ML13's "the CSP allows that host only for it" was not
  needed: connections to any HTTPS host were already allowed.
- **Checked in a visible Brave, under the enforced policy,** with the
  production build: a real Swahili report (NTREX-128) written through the
  app; Brave said it could not; the model came in 50 s and translated in
  about 5 to 8 s a sentence: "Giles added that the victim suffered
  injuries to the upper part of his body." No page errors, no policy
  refusals.
- **Not yet:** WebGPU, which would be faster where a browser has it (the
  model runs on WebAssembly, on one thread, as the page is not
  cross-origin isolated); a way to remove the kept model; chat messages
  and captures.

### T3: the cloud, on the person's own key, for Public content only (2026-10-12)

- **Settings > Language** now holds a key for Microsoft Azure Translator
  or Google Cloud Translation (ML17), kept in this browser on this device
  and sent only to its provider (ML18), with each provider's promise said
  ("Azure keeps none of the text it translates"; "Google does not train on
  it") and how to make a Google key useless anywhere but starcom.app.
- **Only Public content is ever sent** (ML6). A report's text is offered
  the cloud only when the report is Public, or was published by someone
  else and came from the relay feed; anything else is never offered it,
  whatever key is kept.
- **On the device first.** The browser's own translator where it has the
  language; else Starcom's model when it is kept here; else the person
  chooses: fetch the model, or, for Public content, send it with their key.
  The translation is marked with its provider: "Machine translation from
  Swahili by Microsoft Azure Translator, with your key".
- **Checked in a real browser under the enforced policy:** with a
  placeholder Azure key, a report not Public was never offered the cloud;
  a Public one was, the call reached Azure from the page, and Azure's own
  refusal came back into it. No page errors, no policy refusals.

### The reports and missions screens, first part: navigation (2026-10-12)

- **The places Starcom goes are named in the language shown,** in the bar,
  the phone bar and its sheets, quick access and the header's search: one
  list (`useDestinations`), so an application is called the same
  everywhere. A name that is a word is translated ("Fälle", "Missionen",
  "Globus"); a product's name stays ("NetRunner", "IntelWeb"). Each
  description follows.
- **Settings is described for what it holds now:** "Sound, language, and
  translation with your own key".

### The reports and missions screens, second part: reports (2026-10-12)

- **A report's page, the report list and its form, and the report editor**
  are in the catalogue, help notes included. Their dates are written as the
  language writes them, the time still UTC and marked Z (D-E); English
  keeps the house form, so its lines read as before.
- **When an event happened is said in the language,** precision and all:
  Ukrainian says "з точністю до 3 днів", in the genitive "до" asks. The
  event-time helpers take the language's words, English when none are
  given, as every service here does.
- **Distances are the language's own:** "Auf 1.000 km genau". Counts follow
  each language's plural rules, so English says "(1 result)" now where it
  said "(1 results)".
- **Two help notes were split** into sentences of twenty words or fewer: as
  one catalogue string each, the copy-length guard reads them whole.

### The reports and missions screens, third part: Missions (2026-10-12)

- **The Missions list, its dialogs, a mission's page and its sub-panels**
  (objectives, the NavCom profile, claims, replies, packages received) are
  in the catalogue. So are the sentences its services build: where a
  package goes and why it goes nowhere, its locks, field work's problems, a
  relay's reach, and the line beneath Publish, whose kinds agree with their
  counts and join as the language joins a list: "Geht an Navcom: 3 Relays,
  2 öffentliche und 1 lokales".
- **The activity log says what happened in words,** in every language,
  English included ("Report linked"), where it showed the code.
- **With this, every screen chosen for this step is in the catalogue:**
  reports, the report editor and list, Missions, and the places named in
  navigation. What stays English: errors the services throw, NetRunner,
  and the glossary.

### Chat, comments and captures (2026-10-12)

- **Translate where people's words arrive:** beneath a message someone sent in
  the chat window and in a team's chat, beneath someone's comment on a mission,
  and beneath a capture's own words (a selection's text, or a page's title).
- **Only on this device:** chat is sealed, and comments and captures carry no
  distribution, so none is Public and the cloud is never offered (ML6). Never
  beneath your own words, a message that could not be opened, or a link's or an
  image's title, which are Starcom's words.
- **A known language:** `Translatable` takes `sourceLanguage` where the writer
  says what it is (AI Watch's English titles), so short words are not guessed
  wrong and a reader in that language is offered nothing.
