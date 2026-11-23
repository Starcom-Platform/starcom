/**
 * Turning address clusters into publishable claims.
 *
 * A cluster is a COUNT from a census, not an agreement between observers, so
 * it is attested as `matchedBy: 'enumeration'` and weighed on the completeness
 * of its stated boundary rather than on corroboration. See the NIP's
 * enumeration section for why the corroboration term is inapplicable here.
 *
 * The whole safety of that weighting rests on one string — `enumeratedBoundary`
 * — being TRUE. A consumer cannot check it; they can only read it. So this
 * module refuses to build a claim from a source that does not attest its own
 * completeness, and it never composes that sentence itself: it copies the one
 * the acquisition step computed from what it actually scanned.
 */
import { weakBackingFor } from './assetRetention';
import type { FindingAttestation } from '../findings/attestation';
import { FINDING_SCHEMA_VERSION_V2 } from '../findings/attestation';
import type { AddressCluster } from './addressClustering';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { formatCount } from '@utils/formatCount';

/**
 * Commit to the members of an enumeration without publishing them.
 *
 * Sorted before hashing so the digest is a property of the SET, not of the
 * order the register happened to return it in — two implementations reading
 * the same register in different orders must agree.
 */
function enumeratedSetDigest(members: readonly string[]): string {
  return bytesToHex(sha256(utf8ToBytes([...members].sort().join('\n'))));
}

export const STRUCTURAL_ALGORITHM_VERSION = 1;

/**
 * The acquisition step's own account of what it collected, minus the rows.
 *
 * Split from the rows because the two travel differently: the boundary and the
 * completeness verdict must accompany every claim, while the 165,000 raw
 * register rows they describe are a build input. See registerSource.
 */
export interface SnapshotProvenance {
  /** Computed by the fetcher from the parts it actually scanned — never hand-written. */
  bounding: string;
  /** The fetcher's own verdict on whether it covered its whole boundary. */
  complete: boolean;
  /** ISO date of the upstream register snapshot. */
  snapshot: string;
  source: string;
  /**
   * Whether the bytes behind this snapshot can still be obtained. Drives
   * `method.weakBacking`, so an asset that becomes unreproducible makes every
   * claim built from it say so, without anyone editing a claim.
   */
  retention?: import('./assetRetention').RetentionState;
  /**
   * The register's own term for the address it holds — "registered office"
   * (Companies House), "registered business address" (Enhetsregisteret).
   * Borrowing one jurisdiction's term for another's record would describe a
   * filing that does not exist there.
   */
  addressTerm?: string;
}

export class IncompleteRegisterError extends Error {
  constructor(bounding: string) {
    super(
      'Refusing to build enumeration findings from an incomplete register. '
      + 'A count is the entire claim, so a partial scan does not yield a weaker '
      + `count — it yields a false one. Source says: ${bounding}`,
    );
    this.name = 'IncompleteRegisterError';
  }
}

/**
 * Build one attested claim per address cluster.
 *
 * The app ships the CLUSTERS, not the register: the full slice is ~38MB of
 * rows whose only use is to be counted, and committing it would put that in
 * every clone and every bundle forever. The completeness guarantee is
 * unaffected — it was always the acquisition step's to make, since only the
 * thing that read the register parts knows whether it read all of them.
 *
 * Throws rather than degrading when the snapshot is incomplete. It has to
 * throw: a silent skip would produce an empty result indistinguishable from
 * "no clusters found", and that is the reading under which a wrong number
 * gets published.
 */
export function buildEnumerationFindingsFromClusters(
  clusters: AddressCluster[],
  provenance: SnapshotProvenance,
  options: { now?: () => Date } = {},
): FindingAttestation[] {
  if (!provenance.complete) throw new IncompleteRegisterError(provenance.bounding);
  if (!provenance.bounding?.trim()) {
    throw new IncompleteRegisterError('(no boundary stated — an unattributable count cannot be published)');
  }

  const now = options.now ?? (() => new Date());
  return clusters.map(c => attestCluster(c, provenance, now));
}

function attestCluster(
  cluster: AddressCluster,
  snapshot: SnapshotProvenance,
  now: () => Date,
): FindingAttestation {
  const address = `${cluster.addressLine1}, ${cluster.postcode}`;
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: address,
      subjectKind: 'place',
      /**
       * `companiesAtRegisteredAddress`, deliberately, and not anything about
       * operating there. The register records what was FILED as a registered
       * office — a legal correspondence address that thousands of ordinary
       * businesses lawfully share with a formation agent. Naming the attribute
       * after the filing keeps the claim to what the source can support; a
       * name like `companiesOperatingAt` would smuggle in an inference the
       * data cannot carry, and no weight term would catch it.
       */
      attribute: 'companiesAtRegisteredAddress',
      value: cluster.companyCount,
    },
    method: {
      algorithm: 'address-enumeration',
      modality: 'primary_record',
      weakBacking: weakBackingFor(snapshot.source, snapshot.retention ?? 'UNREPRODUCIBLE'),
      algorithmVersion: STRUCTURAL_ALGORITHM_VERSION,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
      // One register, counted once. Not a weakness to be compensated for —
      // see the module header.
      sourceCount: 1,
      // Copied, never composed here. The fetcher computed it from the parts it
      // actually read; rewording it in this module would let the claim drift
      // from the collection that justifies it.
      enumeratedBoundary: snapshot.bounding,
      enumeratedSetDigest: enumeratedSetDigest(cluster.companyNumbers),
      // A register snapshot describes one instant, not an interval.
      observedFrom: `${snapshot.snapshot}T00:00:00.000Z`,
      observedTo: `${snapshot.snapshot}T00:00:00.000Z`,
      // The snapshot is dated to the day and no finer.
      timePrecisionMs: 24 * 60 * 60 * 1000,
      criteria:
        `${cluster.companyCount} companies (${cluster.activeCount} active) filed ${address} as their `
        + `${snapshot.addressTerm ?? 'registered office'} in the ${snapshot.source} snapshot of ${snapshot.snapshot}, counted from a `
        + `complete enumeration. A shared ${snapshot.addressTerm ?? 'registered office'} is a filing fact, not evidence of wrongdoing: `
        // Deliberately not naming one country's version of the mundane cause.
        // In the UK register the largest clusters are company-formation agents;
        // in the Norwegian one they are housing-cooperative umbrellas, where
        // each borettslag is its own legal entity registered care-of its
        // parent. Citing UK formation agents beside a Norwegian address would
        // explain the concentration with the wrong institution.
        + 'company-formation agents, corporate service firms and housing or property associations all lawfully '
        + 'hold large numbers of ordinary organisations at one address.',
    },
    publishedAt: now().toISOString(),
  };
}

/** One address's largest same-day incorporation batch, from a complete register. */
export interface IncorporationBatch {
  addressLine1: string;
  postcode: string;
  /** ISO date of the batch. */
  date: string;
  count: number;
  /** Every company at that address within the boundary, batch or not. */
  addressTotal: number;
  activeCount: number;
  companyNumbers: string[];
  /** Other days at this address that also met the bounds; 0 is the usual case. */
  otherQualifyingDays: number;
}

/**
 * Attest same-day incorporation batches.
 *
 * Same weighing as an address count and for the same reason: this is a census
 * of one authoritative register, so completeness of the stated boundary
 * replaces corroboration and the claim ages from the snapshot.
 *
 * One claim per ADDRESS, carrying that address's largest batch — not one per
 * qualifying day. Under a parameterized-replaceable kind, (author, subject,
 * attribute) is a single slot, so per-day claims at one address would
 * overwrite each other and the survivor would look like the only batch there.
 */
export function buildBatchFindings(
  batches: IncorporationBatch[],
  provenance: SnapshotProvenance,
  options: { now?: () => Date } = {},
): FindingAttestation[] {
  if (!provenance.complete) throw new IncompleteRegisterError(provenance.bounding);
  if (!provenance.bounding?.trim()) {
    throw new IncompleteRegisterError('(no boundary stated — an unattributable count cannot be published)');
  }

  const now = options.now ?? (() => new Date());
  return batches.map(b => attestBatch(b, provenance, now));
}

function attestBatch(
  batch: IncorporationBatch,
  snapshot: SnapshotProvenance,
  now: () => Date,
): FindingAttestation {
  const address = `${batch.addressLine1}, ${batch.postcode}`;
  const share = Math.round((batch.count / batch.addressTotal) * 100);
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: address,
      subjectKind: 'place',
      /**
       * Named for the filing event, like `companiesAtRegisteredAddress`. The
       * register records the incorporation date and the address filed with it,
       * and nothing about whether those companies ever traded, shared owners,
       * or had anything to do with each other beyond the paperwork.
       */
      attribute: 'largestSameDayIncorporationBatch',
      value: { date: batch.date, count: batch.count },
    },
    method: {
      algorithm: 'incorporation-batch',
      modality: 'primary_record',
      weakBacking: weakBackingFor(snapshot.source, snapshot.retention ?? 'UNREPRODUCIBLE'),
      algorithmVersion: STRUCTURAL_ALGORITHM_VERSION,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
      sourceCount: 1,
      enumeratedBoundary: snapshot.bounding,
      enumeratedSetDigest: enumeratedSetDigest(batch.companyNumbers),
      observedFrom: `${snapshot.snapshot}T00:00:00.000Z`,
      observedTo: `${snapshot.snapshot}T00:00:00.000Z`,
      timePrecisionMs: 24 * 60 * 60 * 1000,
      criteria:
        `${batch.count} of the ${batch.addressTotal} companies (${share}%) filing ${address} as their `
        + `${snapshot.addressTerm ?? 'registered office'} were incorporated on ${batch.date}, counted from a complete enumeration of `
        + `the ${snapshot.source} snapshot of ${snapshot.snapshot}. ${batch.activeCount} of the batch `
        + `remain active`
        + (batch.otherQualifyingDays > 0
          ? `, and ${batch.otherQualifyingDays} other day(s) at this address met the same bounds`
          : '')
        + '. A same-day batch is a filing fact, not evidence of wrongdoing: incorporating one company per '
        + 'property, per contract or per fund on a single day is ordinary practice.',
    },
    publishedAt: now().toISOString(),
  };
}

/** One corporate entity named as PSC of many companies, from a complete register. */
export interface CorporateController {
  /** Normalised UK company number of the controlling entity — the join key. */
  registrationNumber: string;
  /**
   * How many distinct name forms it was filed under — a COUNT, never the names.
   * The PSC name field routinely holds a person's name rather than the entity's
   * (5.2% of controllers), and publishing those would associate named private
   * individuals with control of thousands of companies. See pscOverlap.mjs.
   */
  nameVariants: number;
  companyCount: number;
  companyNumbers: string[];
}

/**
 * Attest corporate control overlap.
 *
 * Weighed as a census, like every other count from a complete register.
 *
 * The subject is the REGISTRATION NUMBER, and no name is published at all.
 * 2.11% of numbers are filed under more than one name — LTD vs PLC vs LIMITED,
 * "&" vs "AND", typos, genuine renames — so a name is not an identity here and
 * using one as the subject would split one controller across several slots.
 * Worse, the field frequently holds a PERSON's name, so publishing it would
 * name private individuals as controlling thousands of companies. Only the
 * count of variants travels.
 */
export function buildControlFindings(
  controllers: CorporateController[],
  provenance: SnapshotProvenance,
  options: { now?: () => Date } = {},
): FindingAttestation[] {
  if (!provenance.complete) throw new IncompleteRegisterError(provenance.bounding);
  if (!provenance.bounding?.trim()) {
    throw new IncompleteRegisterError('(no boundary stated — an unattributable count cannot be published)');
  }

  const now = options.now ?? (() => new Date());
  return controllers.map(c => attestController(c, provenance, now));
}

function attestController(
  controller: CorporateController,
  snapshot: SnapshotProvenance,
  now: () => Date,
): FindingAttestation {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: controller.registrationNumber,
      subjectKind: 'organization',
      /**
       * Named for the filing, like the address attributes. The PSC register
       * records who was DECLARED as controlling a company. It does not
       * establish that the control is real, current, or the whole picture —
       * only that this is what was filed.
       */
      attribute: 'companiesControlledAsCorporatePsc',
      value: controller.companyCount,
    },
    method: {
      algorithm: 'psc-control-enumeration',
      modality: 'primary_record',
      weakBacking: weakBackingFor(snapshot.source, snapshot.retention ?? 'UNREPRODUCIBLE'),
      algorithmVersion: STRUCTURAL_ALGORITHM_VERSION,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
      sourceCount: 1,
      enumeratedBoundary: snapshot.bounding,
      enumeratedSetDigest: enumeratedSetDigest(controller.companyNumbers),
      observedFrom: `${snapshot.snapshot}T00:00:00.000Z`,
      observedTo: `${snapshot.snapshot}T00:00:00.000Z`,
      timePrecisionMs: 24 * 60 * 60 * 1000,
      criteria:
        `${controller.companyCount} companies name registration number ${controller.registrationNumber} as a `
        + `corporate person with significant control, counted from a complete enumeration of the `
        + `${snapshot.source} snapshot of ${snapshot.snapshot}. `
        + (controller.nameVariants > 1
          ? `Filed under ${controller.nameVariants} different name forms, joined on the registration number rather than the name. `
          : '')
        + 'Holding one company that controls many is ordinary corporate structure, not evidence of '
        + 'wrongdoing. This counts what was declared to the register, which is not the same as who '
        + 'ultimately benefits.',
    },
    publishedAt: now().toISOString(),
  };
}

/** LEI holders among the companies at one shared registered address. */
export interface LeiCoverageEntry {
  addressLine1: string;
  postcode: string;
  register: string;
  registerSnapshot: string;
  companyCount: number;
  leiHolderCount: number;
  /** The registration numbers that matched — the evidence behind the count. */
  leiHolders: string[];
  /** LEI holders here declaring a parent in another jurisdiction. */
  foreignParentedCount?: number;
  foreignParented?: string[];
  /** The parent jurisdictions seen, ISO-3166 alpha-2, sorted. */
  parentJurisdictions?: string[];
}

/**
 * Attest LEI coverage at a shared registered address.
 *
 * A count over the intersection of two complete enumerations, so it is weighed
 * as a census like the others. What makes it worth counting is that it
 * separates two things a register cannot tell apart: a concentration of
 * entities active enough to need a Legal Entity Identifier, and a
 * concentration of dormant ones. Measured, UK formation-agent addresses run
 * about 1% while central-Oslo addresses reach 17-37%.
 *
 * The claim is the count and nothing more. Holding an LEI means an entity with
 * that registration number appears in the LEI index; it does not mean the
 * company trades, is regulated, or is doing anything at all.
 */
export function buildLeiCoverageFindings(
  entries: LeiCoverageEntry[],
  provenance: SnapshotProvenance,
  options: { now?: () => Date } = {},
): FindingAttestation[] {
  if (!provenance.complete) throw new IncompleteRegisterError(provenance.bounding);
  if (!provenance.bounding?.trim()) {
    throw new IncompleteRegisterError('(no boundary stated — an unattributable count cannot be published)');
  }

  const now = options.now ?? (() => new Date());
  return entries.map(e => attestLeiCoverage(e, provenance, now));
}

function attestLeiCoverage(
  entry: LeiCoverageEntry,
  snapshot: SnapshotProvenance,
  now: () => Date,
): FindingAttestation {
  const address = `${entry.addressLine1}, ${entry.postcode}`;
  const share = entry.companyCount > 0
    ? Math.round((entry.leiHolderCount / entry.companyCount) * 1000) / 10
    : 0;
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: address,
      subjectKind: 'place',
      attribute: 'companiesHoldingLeiAtRegisteredAddress',
      value: entry.leiHolderCount,
    },
    method: {
      algorithm: 'lei-coverage-enumeration',
      modality: 'inference',
      weakBacking: [
        'gleif-golden-copy: republishes national registers; not an independent observation',
        ...weakBackingFor(snapshot.source, snapshot.retention ?? 'UNREPRODUCIBLE'),
      ],
      algorithmVersion: STRUCTURAL_ALGORITHM_VERSION,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
      // One join of two registers, counted once. Not two independent sources:
      // an LEI issuer validates against the very register being joined here,
      // so agreement between them would be echo, not corroboration.
      sourceCount: 1,
      enumeratedBoundary: snapshot.bounding,
      enumeratedSetDigest: enumeratedSetDigest(entry.leiHolders),
      /**
       * Both instants are the STALER snapshot, not the register's own.
       *
       * A joined count is only as current as its oldest input, so ageing from
       * the fresher one would publish a claim as newer than the evidence
       * behind it.
       */
      observedFrom: `${snapshot.snapshot}T00:00:00.000Z`,
      observedTo: `${snapshot.snapshot}T00:00:00.000Z`,
      timePrecisionMs: 24 * 60 * 60 * 1000,
      criteria:
        `${entry.leiHolderCount} of the ${entry.companyCount} companies (${share}%) at ${address} hold a Legal `
        + `Entity Identifier, counted by intersecting two complete enumerations: the ${entry.register} `
        + `snapshot of ${entry.registerSnapshot} and the GLEIF Global LEI Index. Holding an LEI means an entity `
        + 'with that registration number appears in the LEI index — it does not mean the company trades, is '
        + 'regulated, or is active at all. A shared registered address is a filing fact, not evidence of wrongdoing.',
    },
    publishedAt: now().toISOString(),
  };
}

/**
 * Attest foreign parentage among the LEI holders at a shared address.
 *
 * The one thing no national register can express. A register stops at its own
 * jurisdiction, so a company's foreign parent is invisible to it — measured,
 * 40% of the active consolidation links whose child sits in these registers
 * point at another country, with Bermuda, Jersey and the Marshall Islands
 * among the commonest.
 *
 * THE DENOMINATOR IS THE LEI HOLDERS, NEVER EVERY COMPANY AT THE ADDRESS, and
 * this is the whole honesty of the claim. About 1% of companies at a UK
 * formation-agent address hold an LEI, so "12 of 86,035 have a foreign parent"
 * would tell a reader the other 86,023 do not — when the truth is that nothing
 * is known about them at all. Absence from the LEI system is not absence of a
 * foreign parent, and the criteria says so rather than leaving a reader to
 * work it out.
 *
 * The counts are small and that is not noise: 17 of 56 LEI holders at one
 * Norwegian address declare Marshall Islands parents. What makes a finding
 * here is the concentration, not the volume.
 */
export function buildForeignParentageFindings(
  entries: LeiCoverageEntry[],
  provenance: SnapshotProvenance,
  options: { now?: () => Date } = {},
): FindingAttestation[] {
  if (!provenance.complete) throw new IncompleteRegisterError(provenance.bounding);
  if (!provenance.bounding?.trim()) {
    throw new IncompleteRegisterError('(no boundary stated — an unattributable count cannot be published)');
  }
  const now = options.now ?? (() => new Date());
  return entries
    // An address with no foreign-parented holder yields no claim. Publishing a
    // zero here would assert something the data cannot support: with most
    // companies outside the LEI system, "none" and "none visible" differ.
    .filter(e => (e.foreignParentedCount ?? 0) > 0)
    .map(e => attestForeignParentage(e, provenance, now));
}

function attestForeignParentage(
  entry: LeiCoverageEntry,
  snapshot: SnapshotProvenance,
  now: () => Date,
): FindingAttestation {
  const address = `${entry.addressLine1}, ${entry.postcode}`;
  const count = entry.foreignParentedCount ?? 0;
  const jurisdictions = entry.parentJurisdictions ?? [];
  const notInLei = entry.companyCount - entry.leiHolderCount;
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: address,
      subjectKind: 'place',
      attribute: 'foreignParentedLeiHoldersAtRegisteredAddress',
      value: { count, jurisdictions },
    },
    method: {
      algorithm: 'foreign-parentage-enumeration',
      modality: 'inference',
      weakBacking: [
        'gleif-relationship-records: parentage as self-reported to GLEIF, not verified against the parent register',
        ...weakBackingFor(snapshot.source, snapshot.retention ?? 'UNREPRODUCIBLE'),
      ],
      algorithmVersion: STRUCTURAL_ALGORITHM_VERSION,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
      sourceCount: 1,
      enumeratedBoundary: snapshot.bounding,
      enumeratedSetDigest: enumeratedSetDigest(entry.foreignParented ?? []),
      observedFrom: `${snapshot.snapshot}T00:00:00.000Z`,
      observedTo: `${snapshot.snapshot}T00:00:00.000Z`,
      timePrecisionMs: 24 * 60 * 60 * 1000,
      criteria:
        `${count} of the ${entry.leiHolderCount} companies at ${address} that hold a Legal Entity Identifier `
        + `declare a parent in another jurisdiction (${jurisdictions.join(', ')}), counted from ACTIVE direct and `
        + `ultimate consolidation links in the GLEIF relationship records. `
        + `The other ${formatCount(notInLei)} companies at this address hold no LEI, so nothing is known about `
        + 'their ownership in either direction — this is not a statement that they have no foreign parent. '
        + 'A foreign parent is ordinary corporate structure, not evidence of wrongdoing: multinationals '
        + 'consolidate their subsidiaries, and that is what consolidation records are for.',
    },
    publishedAt: now().toISOString(),
  };
}
