# Agreement between GLEIF and a national register

**Measured 2026-08-22.** Plan item 8 — re-measure agreement and discrepancy on an
unfiltered population.

## What was measured

Every record in the Global LEI Index (3,409,898, GLEIF golden copy of
2026-08-22 16:00, CC0) joined to the complete Norwegian Enhetsregisteret
(1,171,149 units, snapshot 2026-08-22, NLOD) on the **organisation number** —
an exact identifier, no fuzzy matching — and compared on **postcode only**.

Postcode because it is exact. Street lines are free text in both sources, and
comparing them means fuzzy matching, which reports differences of punctuation
as disagreements about the world.

| | |
|---|---|
| LEI records scanned | 3,409,898 |
| Norwegian (Brønnøysund, RA000472 + RA000473) | 64,782 |
| Matched in the register | 57,187 |
| Unmatched | 7,595 |
| Postcode agreement | 52,006 (91.06%) |
| Postcode disagreement | 5,107 (8.94%) |

## The result that matters

Disagreement is not distributed evenly. It tracks whether the LEI record is
still being revalidated:

| LEI registration status | Matched | Disagree | Rate |
|---|---|---|---|
| ISSUED | 40,535 | 1,199 | **2.96%** |
| LAPSED | 16,526 | 3,866 | **23.50%** |
| RETIRED | 48 | 14 | 29.17% |
| DUPLICATE | 51 | 23 | 46.94% |

**A LAPSED record disagrees 7.9x more often than an ISSUED one.**

## What that means, and it is not what it looks like

The naive reading of 91% agreement is "two sources independently corroborate
each other". That reading is wrong, and the status breakdown is why.

To issue an LEI, an LOU validates the entity against its home register and
records the registration number it found there; an ISSUED record is
revalidated annually. So agreement among ISSUED records is **maintained by
copying** — it is echo, one source restating another, not two observers
independently arriving at the same answer. When revalidation stops, the copy
stops being refreshed and drifts: nearly a quarter of LAPSED records now
disagree.

Counting this as corroboration would manufacture confidence out of a copy.
That is exactly what the derivation rules and the relay discount exist to
prevent, and this is measured evidence for a rule that was previously a
judgement.

**The informative number here is the disagreement rate, not the agreement
rate.** Agreement is what a copy produces by construction.

## Against the measurement it replaces

The earlier attempt compared **64 companies and found zero discrepancies**. Its
GLEIF seed came from Wikidata items carrying both an LEI and a headquarters, so
it selected for notability, and notable entities keep tidy records. The
unfiltered population has 57,187 comparable entities and 5,107 discrepancies.

**Full-coverage data contains the phenomenon; the filtered sample structurally
could not.** That was the premise of Phase 1, and this is the measurement that
settles it.

## Two errors in getting here, both of which produced confident wrong numbers

- **The join was broken by formatting and still looked fine.** GLEIF stores
  organisation numbers as filed, and Norwegian convention writes them in three
  groups of three — "924 329 327". Comparing raw strings dropped 53,815 of
  64,782 records (83%) and returned 9,572 matches with an agreement rate quoted
  to two decimal places. The surviving subset was exactly those whose issuing
  LOU happened not to use spaces, which is not a random sample of anything.
- **Norway has two registration-authority codes**, RA000472 and RA000473, both
  the Brønnøysund Register Centre. Filtering on one drops 1,922 records and
  leaves a smaller population that still looks complete.

Neither would have been caught by a test. Both were found by asking why a
number was the size it was.

## Reproducing

```
node scripts/measure-register-agreement.mjs \
  --gleif $STARCOM_ARCHIVE/gleif-lei2/2026-08-22.csv.zip \
  --brreg $STARCOM_ARCHIVE/brreg-enheter/2026-08-22.json.gz
```

Both snapshots are archived with manifests and digests. The GLEIF golden copy
is published at a dated URL and remains retrievable upstream; the Norwegian
bulk file is served at one undated URL and regenerated nightly, so the archived
copy is the only way this measurement stays reproducible.
