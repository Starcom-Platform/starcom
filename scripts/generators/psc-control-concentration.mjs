/**
 * Corporate control concentration, from the Companies House PSC snapshot.
 *
 * ONE claim per corporate controller: how many UK companies it is registered as
 * a person with significant control over. That is a countable fact drawn from a
 * primary government record, not an inference about intent, and it is the kind
 * of thing the register exists to make knowable.
 *
 * SUBJECTS ARE COMPANIES, NEVER PEOPLE. The PSC register contains natural
 * persons — that is most of what it holds — and this generator never sees them:
 * the upstream fetch keeps only controllers identified by company registration
 * number, and reduces their names to a COUNT of spelling variants, so no name
 * reaches this file. A control-concentration claim about a corporate services
 * firm is public-interest reporting on a company. The same claim about a named
 * individual is a dossier on a private person, and this project already refused
 * to publish those.
 *
 * The threshold is a judgement and is stated as one: below it, a claim is not a
 * finding, it is a row of a public database restated with a signature on it.
 */
import fs from 'node:fs';

const INPUT = 'public/data/psc-control.json';
const MIN_COMPANIES = 100;

export default {
  criteria:
    `Corporate entity is recorded in the Companies House PSC snapshot as a person ` +
    `with significant control over at least ${MIN_COMPANIES} UK companies; the count is ` +
    `the number of distinct company numbers listed for it in that snapshot.`,

  inputs: [INPUT],

  run() {
    const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
    const claims = [];
    const refusals = {};
    const refuse = (r) => { refusals[r] = (refusals[r] ?? 0) + 1; };

    // The snapshot's own retrieval date. observedTo drives weight decay, so
    // taking "now" here would make every claim permanently fresh — a lie that a
    // rerun would tell louder every time it ran.
    const observed = new Date(data.retrievedAt).toISOString();

    for (const c of data.controllers) {
      if (!/^[A-Z0-9]{6,10}$/i.test(String(c.registrationNumber ?? ''))) {
        refuse('registrationNumber is not a well-formed company number — the subject cannot be identified');
        continue;
      }

      const n = Array.isArray(c.companyNumbers) ? new Set(c.companyNumbers).size : 0;
      if (n < MIN_COMPANIES) {
        refuse(`controls fewer than ${MIN_COMPANIES} companies — below the reporting threshold`);
        continue;
      }
      if (n !== c.companyCount) {
        // The two disagreeing means the snapshot is internally inconsistent for
        // this row. Publishing either number would assert something the source
        // does not actually say.
        refuse('companyCount disagrees with the distinct company numbers listed — the source is inconsistent for this row');
        continue;
      }

      const weakBacking = [];
      if (c.nameVariants > 1) {
        weakBacking.push(
          `${c.nameVariants} name spellings are filed against this registration number: ` +
          `the register does not hold one canonical name for this controller`,
        );
      }

      claims.push({
        schemaVersion: 2,
        claim: {
          subjectRef: String(c.registrationNumber).toUpperCase(),
          subjectKind: 'organization',
          attribute: 'ukCompaniesControlled',
          value: n,
        },
        method: {
          algorithm: 'psc-control-concentration',
          algorithmVersion: 1,
          // matchedBy 'equality' because a company number either appears against
          // this controller or it does not — there is no proximity or time
          // window to be imprecise about, so the precision term is 1 and
          // windowHours is 0 rather than absent. Omitting it entirely is what
          // made the first run of this generator derive NaN for all 191 claims.
          parameters: {
            minCompanies: MIN_COMPANIES,
            matchedBy: 'equality',
            windowHours: 0,
            distanceThresholdKm: 0,
          },
          sourceCount: 1,
          observedFrom: observed,
          observedTo: observed,
          timePrecisionMs: 86_400_000,
          // A government filing read directly. Not an inference, and not
          // corroboration — one source, which is what sourceCount already says.
          modality: 'primary_record',
          weakBacking,
          criteria:
            `Counted distinct company numbers where this registration number appears as a PSC ` +
            `in the Companies House snapshot ${data.snapshot}; emitted only at ${MIN_COMPANIES}+.`,
          inputFingerprints: [String(data.snapshot ?? 'unknown-snapshot')],
        },
        publishedAt: observed,
      });
    }

    return {
      claims: claims.sort((a, b) => a.claim.subjectRef.localeCompare(b.claim.subjectRef)),
      refusals: Object.entries(refusals).map(([reason, count]) => ({ reason, count })),
    };
  },
};
