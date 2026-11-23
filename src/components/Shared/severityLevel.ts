import { normalizeReportPriority } from '../../services/intel/reportPriority';

/** A level on the Cases' scale, or nobody having said (SeverityBadge). */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical' | 'unset';

/** Any stored value onto the scale (a case's LOW, a report's old IMMEDIATE); nothing is not assessed. */
export function severityLevel(raw: unknown): SeverityLevel {
  const level = normalizeReportPriority(raw);
  return level ? (level.toLowerCase() as SeverityLevel) : 'unset';
}
