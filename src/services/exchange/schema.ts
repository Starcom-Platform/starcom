import { z } from 'zod';

export const LicenseTypeSchema = z.enum(['CC-BY', 'CC0', 'PROPRIETARY', 'OPEN']);

export const ReportEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  checksum: z.string().min(1),
  path: z.string().optional(),
});

export const IntelEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  checksum: z.string().min(1),
  path: z.string().optional(),
});

export const AssetEntrySchema = z.object({
  filename: z.string().min(1),
  checksum: z.string().min(1),
  size: z.number().int().nonnegative(),
});

/** A country's code, or a state's as ISO 3166-2 writes it, lower case: never finer (D-MX, MX11). */
export const REGION_CODE = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;

/** What NavCom reads of a package (interchange rev 11). Its tags must say the same; the verifier holds them to it. */
export const PackageProfileSchema = z.object({
  missionState: z.enum(['open', 'closed', 'claimed']),
  claims: z.enum(['one', 'many']).optional(),
  fieldWork: z.object({
    jurisdiction: z.string().regex(REGION_CODE, 'a country or a state, as its code, never finer'),
    validUntil: z.number().int().positive(),
  }).optional(),
  agent: z.string().trim().min(1).optional(),
}).refine((p) => p.missionState !== 'claimed' || p.claims === 'one', {
  message: 'claimed only when one person takes it (claims: one)',
});

export const PackageManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  visibility: z.enum(['public', 'limited', 'private']).optional(),
  /*
   * READ-TOLERANT, deliberately. A package produced by an older build carries
   * `classification` and no `visibility`, and must still validate — refusing
   * it would break interchange for the sake of a label that never constrained
   * anything. Accepted as a loose string rather than the old enum, because the
   * point is to tolerate it, not to police it.
   */
  classification: z.string().optional(),
  /*
   * With Z or an offset, as the spec says. zod's bare `.datetime()` refuses
   * every offset but Z, so Mecha Jono's first signed packages — Python's
   * isoformat, `…33.840987+00:00` — were refused as malformed by a receiver
   * whose own spec called them correct (2026-09-25). Zod 4 (2026-11-20) moved
   * the check to z.iso.datetime with the same option.
   */
  createdAt: z.iso.datetime({ offset: true }),
  author: z.string().min(1),
  license: LicenseTypeSchema,
  reports: z.array(ReportEntrySchema),
  intel: z.array(IntelEntrySchema),
  assets: z.array(AssetEntrySchema),
  profile: PackageProfileSchema.optional(),
  metadata: z.record(z.string(), z.unknown()),
});

export type PackageManifestInput = z.infer<typeof PackageManifestSchema>;

export function validateManifest(manifest: unknown): { valid: true } | { valid: false; errors: string[] } {
  const res = PackageManifestSchema.safeParse(manifest);
  if (res.success) return { valid: true };
  return { valid: false, errors: res.error.issues.map(e => `${e.path.join('.')}: ${e.message}`) };
}
