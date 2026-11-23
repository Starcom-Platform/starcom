import type { Messages } from '../messages';
import data from './en.json';

/**
 * The source locale.
 *
 * JSON rather than a TypeScript literal, so the SAME file is readable by the
 * static commons builder, which is plain Node and cannot import TypeScript.
 * A catalogue the build pipeline cannot read is one that quietly stops being
 * applied — the translation would exist and the published pages would stay
 * English, with nothing reporting the discrepancy.
 *
 * The type annotation is the gate: a locale JSON missing a key fails the
 * build here, even though JSON itself enforces nothing.
 */
export const en: Messages = data;
