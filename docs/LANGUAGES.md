# Languages

Starcom's screens come in six languages. English is the source, and the only one checked by a native speaker; the
other five are machine-drafted, and the app says so. The decision record is D-ML,
[`missions/01-architecture-decisions/multilingual.md`](missions/01-architecture-decisions/multilingual.md).

This page is about the interface's own words. Translating what people write, such as reports and messages, is a
separate system: see [Content translation](#content-translation).

## The six languages

| Id | Shown as | Page `lang` | Checked by a native speaker |
|---|---|---|---|
| `en` | English | `en` | yes |
| `de` | Deutsch | `de` | no |
| `pt-BR` | Português (Brasil) | `pt-BR` | no |
| `sw` | Kiswahili | `sw` | no |
| `hi` | हिन्दी | `hi` | no |
| `uk` | Українська | `uk` | no |

A seventh choice, `pt-BR-bahia` ("Português (Bahia)"), is a layer over Brazilian Portuguese. It holds only the words
that differ in Bahia and inherits the rest (D-ML, ML4); today it changes only the notice about review. A browser's
language never selects it: a person has to choose it.

The list is `LANGUAGES` in `src/i18n/app/languages.ts`.

## Where the words live

| Path | What it holds |
|---|---|
| `src/i18n/app/en.ts` | Every English word of the app, in about 40 sections (`settings`, `cases`, `missions` and so on). The source the others follow. |
| `src/i18n/app/locales/<id>.ts` | One file per other language, in the same shape as `en.ts`. `pt-BR-bahia.ts` holds only its differences. |
| `src/i18n/app/types.ts` | `Catalog`, which gives every language the shape of English; `PluralForms`; `Overlay`, for the Bahia layer. |
| `src/i18n/app/languages.ts` | The list of languages, and the choice of which one a person sees. |
| `src/i18n/app/i18n.ts` | The store and its helpers: `useMessages()`, `fill()`, `counted()`, `listed()`, `numbered()`, `amounted()`, `setLanguage()`. |
| `src/i18n/app/plain.ts`, `dates.ts`, `fillNodes.ts` | Counts, lists, numbers and dates by each language's rules, and messages with elements inside them. |
| `src/i18n/uplink/` | Starcom Uplink's own words (`en.ts`, `locales/`), and `uplinkWords.ts`, which picks Uplink's language. |
| `src/i18n/messages.ts`, `src/i18n/locales/` | An older, separate catalogue for the static public claim pages, in English and Spanish, built by `scripts/build-commons.mjs`. |

There is no i18n library. `src/i18n/messages.ts` gives the reason: the weight of a first visit is a tracked defect.
It also names what is given up, such as ICU message syntax and gender selection.

## Which language a person sees

1. The one they chose in Settings > Language, kept in this browser under the key `starcom-language`.
2. Otherwise, the first of the browser's languages that Starcom has. Any Portuguese becomes `pt-BR`.
3. Otherwise, English.

`startLanguage()` makes this choice at start (`src/main.tsx`), and `setLanguage()` switches without a reload. Both set
the page's `lang` attribute. English is in the main bundle; each other language is its own chunk, loaded only when
chosen. In a language not yet reviewed, Settings says so, and says that parts of Starcom still show in English
(`src/components/Settings/LanguageSettings.tsx`).

## How a component gets its words

A component calls `useMessages()`. It returns the language id and the words, and the component re-renders when the
language changes. From `src/components/Intel/Bundles/SendBundleButton.tsx`:

```tsx
import { counted, fill, useMessages } from '../../../i18n/app/i18n';

const { m: { bundles: t, reasons } } = useMessages();

counted(t.reviewAndSend, chosen.length);   // "Review and send to 3 people"
fill(t.sentPartly, { reached: reached.length, missed: notReached.length, reasons: … });
                                           // "Sent to {reached}. Not sent to {missed}: {reasons}"
```

- `fill(template, values)` puts named values into `{name}` placeholders, wherever the language puts them. A
  placeholder given no value stays on screen as `{name}`.
- `fillNodes(template, nodes)` does the same with React elements, such as a link
  (`src/components/Extension/EvidenceViewer.tsx`).
- `counted(forms, n)` picks the plural form for `n`, and writes `n` as the language writes numbers.
- `listed(items)` joins a list as the language does ("A, B and C"). `numbered(n)` and `amounted(n)` write numbers.
- `dates.ts` writes dates in the language, always in UTC, with the time marked Z. Anything published keeps the English
  house form (D-E).

Code outside React reads `messagesNow()` and `languageNow()`, and can listen with `onLanguageChange()`. A service that
builds sentences takes the words as an argument, English by default: see `chatConnection()` in
`src/components/SecureChat/chatConnection.ts`.

## Counts

A word with a count is an object of plural forms, with `{n}` where the count goes. From `en.ts`:

```ts
sent: { one: 'Sent to {n} person.', other: 'Sent to {n} people.' },
```

Each language gives exactly the forms its own plural rules use, no more and no fewer, and a test holds it to that.
These are the forms `Intl.PluralRules` reports in Node 22:

| Language | Forms |
|---|---|
| `en`, `de`, `sw`, `hi` | `one`, `other` |
| `pt-BR` | `one`, `many`, `other` |
| `uk` | `one`, `few`, `many`, `other` |

Hindi counts 0 as `one`. Portuguese uses `many` for whole millions ("1.000.000 de casos").

## Adding a word

1. Add it to the right section of `src/i18n/app/en.ts`. Keep each sentence to 20 words or fewer:
   `scripts/guard-copy-length.mjs` reads this file.
2. Add the same key to `de.ts`, `pt-BR.ts`, `sw.ts`, `hi.ts` and `uk.ts` in `src/i18n/app/locales/`. Each is typed
   against English, so a missing key fails `npm run typecheck`. A machine draft is accepted (ML3); keep every
   `{placeholder}` exactly as in English.
3. Add it to `pt-BR-bahia.ts` only if Bahia says it differently.
4. Read it in the component through `useMessages()`, never as a string written in the component.
5. Run `npx vitest run src/i18n`, `npm run typecheck` and `npm run guards`.

Where the grammar depends on a noun, write a whole sentence for each noun rather than putting a noun into one shared
sentence. German and Ukrainian need the noun's gender, so D-ML gave case, mission, report and review a sentence each
("Diese Mission ist privat: …").

Words on Uplink's pages follow the same steps, in `src/i18n/uplink/en.ts` and `src/i18n/uplink/locales/`.

## Adding a language

1. Add an entry to `LANGUAGES` in `src/i18n/app/languages.ts`: its id, its name in itself, its HTML `lang` tag, and
   `reviewed: false`.
2. Write `src/i18n/app/locales/<id>.ts`, typed `Messages` and exported as default. Say in its header if it is
   machine-drafted, as the others do.
3. Add a loader for it to `LOADERS` in `src/i18n/app/i18n.ts`. Write `src/i18n/uplink/locales/<id>.ts`, and add it to
   `LOADERS` in `src/i18n/uplink/uplinkWords.ts`. Both maps are typed over every language id, so a missing loader
   fails the typecheck.
4. Update `src/i18n/app/__tests__/i18n.test.ts`. Its list of language ids fails until the new one is added. Its `all`
   and `uplinks` maps must be extended by hand, or the new catalogues go unchecked: test files are not typechecked.
5. Check `chooseLanguage()` in `languages.ts`. It matches a browser's language by its first part (`de-AT` to `de`), so
   an id with a region, like `pt-BR`, needs its own rule.
6. Check the font. IBM Plex Sans covers Latin and Cyrillic. Hindi needed IBM Plex Sans Devanagari, added to the stacks
   in `src/styles/tokens.ts` (D-ML, L2). The display face, Oxanium, has no Cyrillic or Devanagari, so headings in
   those scripts fall back to Plex.
7. If the language needs more than `Intl.PluralRules` gives, such as grammatical gender, read the note in
   `src/i18n/messages.ts` first: it says to adopt a library then.
8. Record the change in D-ML.

## Checks

| Check | What it catches | Where it runs |
|---|---|---|
| `npm run typecheck` | A language missing a key English has, or holding a key English lacks | `npm run verify`, with or without `--quick` |
| `src/i18n/app/__tests__/i18n.test.ts` | Every language has every word English has, and no other; each count has exactly its language's plural forms; the same for Uplink's catalogues; Uplink's capabilities all have words; only English is marked reviewed | `npm test`, `npm run verify`, or `npx vitest run src/i18n` |
| `*.language.test.tsx` beside components | A screen shown in another language, for example `src/components/Intel/__tests__/ReportEditPanel.language.test.tsx` | The unit tests |
| `scripts/guard-copy-length.mjs` | An English sentence over 20 words, in the app's and Uplink's `en.ts` | `npm run guards` |
| `npm run check:i18n` | For the claim pages only (`src/i18n/locales/*.json`): missing or unknown keys, changed placeholders, and strings left identical to English | Nothing runs it; run it by hand |

No check catches these today:

- a translation in the app's catalogues that drops or renames a `{placeholder}`, which then shows on screen as
  `{name}`;
- a word copied across in English and never translated;
- a wrong translation. Only a native speaker can catch that, and none has reviewed a language yet.

Some of the app still shows in English. D-ML's step notes list what, among them NetRunner, the in-app glossary and the
errors that services throw.

## Starcom Uplink's language

- Uplink follows Starcom. A Starcom page tells Uplink the language it shows, and Uplink keeps it; before any page has,
  Uplink uses the browser's language (ML8). The Bahia layer reads Brazilian Portuguese there.
- In a language not yet reviewed, Uplink's grant, sign and key windows show the English beneath each sentence (ML9).
  A mistranslation then cannot silently change what someone agrees to.
- Uplink's pages carry no React and none of the app's words: only `src/i18n/uplink/`.

## Content translation

Translating what people write is separate from the catalogues above. Beneath a report, a message or a capture in
another language, "Translate" uses, in order (D-ML, T1 to T3):

1. the browser's own translator, where it has the language (Chrome, Brave and Edge on desktop);
2. NLLB-200, run in a worker on this device, once the person has downloaded it;
3. otherwise, the person's choice: download NLLB-200 (about 900 MB, from Hugging Face), or, for Public content only,
   send the text to Microsoft Azure Translator or Google Cloud Translation with their own key.

The original always stays on screen, and the translation is marked as machine-made, with what made it. The code is in
`src/services/translation/` and `src/components/Translation/Translatable.tsx`.
