/**
 * The share handle's side of the rail (contract v68; critique-2026-11-01, OR12): a layer's choices as in force, and
 * an agent's choices checked before they are set for its page. Only a layer choice can be set (railSpecs.ts); one a
 * layer keeps in its own settings is refused by name, as setting it would change the person's setting.
 */
import { RAIL_SPECS } from './railSpecs';
import { layerChoice, pageSetLayerChoices, type ChoiceValue } from './layerChoices';

export interface ShareLayerChoices {
  layer: string;
  /** Each choosable control's value in force. */
  choices: Record<string, ChoiceValue>;
  /** Whether this page's handle set any of them, or all are the person's. */
  from: 'handle' | 'person';
}

/** Every layer with choices the handle can set, and their keys, as the contract publishes them. */
export function choosableLayerChoices(): Record<string, string[]> {
  return Object.fromEntries(Object.values(RAIL_SPECS)
    .map((spec) => [spec.layer, spec.controls.filter((c) => !c.bound).map((c) => c.id)] as const)
    .filter(([, keys]) => keys.length > 0)
    .map(([layer, keys]) => [layer, [...keys]]));
}

export function layerChoicesInForce(layer: string): ShareLayerChoices {
  const spec = RAIL_SPECS[layer];
  const choices: Record<string, ChoiceValue> = {};
  for (const c of spec?.controls ?? []) if (!c.bound) choices[c.id] = layerChoice(layer, c.id, c.default as ChoiceValue);
  return { layer, choices, from: pageSetLayerChoices(layer) ? 'handle' : 'person' };
}

/** An agent's choices for a layer, checked: each key one of its choosable controls, each value one it takes. */
export function readLayerChoices(layer: string, given: unknown): { choices: Record<string, ChoiceValue> } | { refused: string } {
  const spec = RAIL_SPECS[layer];
  const keys = choosableLayerChoices()[layer];
  if (!spec || !keys) return { refused: `${layer} has no choices to set. getLayerChoices() and the contract's layerChoices name those that do.` };
  if (!given || typeof given !== 'object' || Array.isArray(given)) return { refused: 'Give the choices as an object, e.g. { "war:arcs": false }, or null to return to the person\'s.' };
  const out: Record<string, ChoiceValue> = {};
  for (const [key, value] of Object.entries(given as Record<string, unknown>)) {
    const c = spec.controls.find((x) => x.id === key);
    if (!c) return { refused: `${layer} has no choice "${key}": it has ${keys.join(', ')}.` };
    if (c.bound) return { refused: `${layer}'s "${key}" is kept in the person's own settings, which an agent never changes.` };
    if (c.kind === 'toggle') {
      if (typeof value !== 'boolean') return { refused: `${layer}'s "${key}" is on or off: true or false.` };
      out[key] = value;
    } else if (c.kind === 'select') {
      if (typeof value !== 'string' || !c.options.some((o) => o.value === value)) return { refused: `${layer}'s "${key}" is one of ${c.options.map((o) => o.value).join(', ')}.` };
      out[key] = value;
    } else {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && c.options.some((o) => o.value === v))) {
        return { refused: `${layer}'s "${key}" is a list of ${c.options.map((o) => o.value).join(', ')}.` };
      }
      out[key] = [...new Set(value as string[])];
    }
  }
  return { choices: out };
}
