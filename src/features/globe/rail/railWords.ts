/**
 * A rail control's and its options' names in the language shown (plan A2): the rail says them, and the command
 * palette says them too (D-CP), so the two never name one control two ways.
 */
import type { Messages } from '../../../i18n/app/en';

/** A control's name. */
export const controlName = (w: Messages, id: string): string => (w.rail.controls as Record<string, string>)[id] ?? id;

/** An option's name: its own, or a diplomatic category's; else its value. */
export function optionName(w: Messages, controlId: string, value: string): string {
  const own = (w.rail.options as Record<string, Record<string, string>>)[controlId]?.[value];
  if (own) return own;
  if (controlId === 'diplomacy:categories') return (w.diplomacy.categories as unknown as Record<string, { one: string } | undefined>)[value]?.one ?? value;
  return value;
}
