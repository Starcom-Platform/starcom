/**
 * Turning collected text into entities a Case can link to.
 *
 * ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 *
 * NetRunner has produced Intel Reports for a long time and none of them could
 * ever reach a Case. `linkEntitiesToCase(caseId, entityIds)` links ENTITIES,
 * and NetRunner extracted none — the subdomains, addresses and technologies it
 * found were flattened into a markdown blob and lost their structure on the way
 * in. The data existed; the conversion did not.
 *
 * ─── TWO METHODS, DELIBERATELY UNEQUAL ─────────────────────────────────────
 *
 * `pattern` is deterministic: an address either matches the grammar of an email
 * or it does not. It has narrow recall and it needs nothing — no model, no
 * runtime, no money. That matters, because the analyst this has to serve may
 * have none of those.
 *
 * `model` is a local model reading the same text. Broader, and weaker: it is a
 * DERIVATION, not an observation — a reading of evidence rather than evidence
 * of the world. Under this node's rules, weight comes from method rather than
 * assertion, and a model asserting something is the weakest method there is. So
 * every model-derived entity carries the model and the prompt digest that
 * produced it, and can be re-run and disputed instead of believed.
 *
 * Nothing here marks an entity `verified`. Extraction is not verification, and
 * a machine saying it found something is not a second opinion.
 */
import { nativeHost } from '../../native/nativeHost';

export type ExtractionMethod = 'pattern' | 'model';

export type ExtractedKind =
  | 'email'
  | 'domain'
  | 'ipv4'
  | 'url'
  | 'organization'
  | 'person'
  | 'other';

export interface ExtractedEntity {
  kind: ExtractedKind;
  value: string;
  method: ExtractionMethod;
  /**
   * Present for model extraction only. Enough to re-run the reading — a
   * derivation that cannot be reproduced is an assertion.
   */
  derivation?: { model: string; promptDigest: string };
}

/**
 * Grammar-matched extraction. No network, no model, no host required.
 *
 * Ordered so that longer, more specific forms are consumed first: a URL
 * contains a domain, and an email contains one too, so extracting domains first
 * would shred the others into fragments.
 */
export function extractByPattern(text: string): ExtractedEntity[] {
  const found = new Map<string, ExtractedEntity>();
  const add = (kind: ExtractedKind, value: string) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (!found.has(key)) found.set(key, { kind, value, method: 'pattern' });
  };

  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/gi)) {
    const url = match[0].replace(/[.,;:]+$/, '');
    add('url', url);
    try {
      add('domain', new URL(url).hostname);
    } catch {
      // A string that looks like a URL and will not parse is not one.
    }
  }

  for (const match of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    add('email', match[0]);
    const domain = match[0].split('@')[1];
    if (domain) add('domain', domain);
  }

  // Octets validated rather than merely counted: "1.2.3.4" is an address and
  // "127.0.0.256" is not, and neither is a version number like 10.15.7.1999.
  for (const match of text.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)) {
    const octets = match.slice(1, 5).map(Number);
    if (octets.every((n) => n >= 0 && n <= 255)) add('ipv4', match[0]);
  }

  return [...found.values()];
}

const EXTRACTION_SYSTEM =
  'You extract named entities from text for an intelligence analyst. '
  + 'Return ONLY JSON of the form {"entities":[{"kind":"organization|person|domain|email|ipv4|url|other","value":"..."}]}. '
  + 'Include only entities that appear verbatim in the text. Invent nothing. '
  + 'If you find none, return {"entities":[]}.';

export interface ModelExtractionOutcome {
  entities: ExtractedEntity[];
  /** Why nothing came back, when nothing did. Never silently empty. */
  unavailable?: string;
}

/**
 * Model extraction, which requires a native host and a local runtime.
 *
 * Returns a REASON rather than an empty list when it cannot run. An empty
 * result and an unattempted one are different statements about the text, and
 * conflating them would let "we could not look" be recorded as "there was
 * nothing there" — the same error this codebase already made once with security
 * headers.
 */
export async function extractByModel(
  text: string,
  options: { model?: string; maxChars?: number } = {},
): Promise<ModelExtractionOutcome> {
  const host = nativeHost();
  if (!host) {
    return { entities: [], unavailable: 'Model extraction needs the Starcom desktop host.' };
  }

  const status = await host.inference.status();
  if (!status.available) {
    return { entities: [], unavailable: status.detail ?? 'No local runtime answered.' };
  }
  const model = options.model ?? status.models[0];
  if (!model) {
    return { entities: [], unavailable: 'A local runtime is present but holds no models.' };
  }

  const excerpt = text.slice(0, options.maxChars ?? 12_000);
  const result = await host.inference.generate({
    model,
    system: EXTRACTION_SYSTEM,
    prompt: excerpt,
    json: true,
    temperature: 0,
  });

  if (result.jsonParseError) {
    return { entities: [], unavailable: `Model did not return JSON: ${result.jsonParseError}` };
  }

  let parsed: { entities?: Array<{ kind?: string; value?: string }> };
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch (error) {
    return { entities: [], unavailable: `Model output did not parse: ${String(error)}` };
  }

  const kinds: ExtractedKind[] = ['email', 'domain', 'ipv4', 'url', 'organization', 'person', 'other'];
  const derivation = { model: result.model, promptDigest: result.derivation.promptDigest };

  const entities = (parsed.entities ?? [])
    .filter((e): e is { kind?: string; value: string } => typeof e.value === 'string' && e.value.trim().length > 0)
    // A model asked for verbatim entities may still produce ones that are not
    // in the text. Dropping those is cheap and is the difference between an
    // extraction and a fabrication.
    .filter((e) => excerpt.toLowerCase().includes(e.value.trim().toLowerCase()))
    .map((e) => ({
      kind: (kinds.includes(e.kind as ExtractedKind) ? e.kind : 'other') as ExtractedKind,
      value: e.value.trim(),
      method: 'model' as const,
      derivation,
    }));

  const deduped = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    deduped.set(`${entity.kind}:${entity.value.toLowerCase()}`, entity);
  }
  return { entities: [...deduped.values()] };
}

/**
 * Both methods, with the deterministic one taking precedence on collision.
 *
 * When a pattern match and a model reading name the same thing, the pattern
 * wins — not because it is more useful, but because it rests on a grammar
 * rather than on a reading, and recording the stronger method for a fact known
 * both ways is what keeps weight honest.
 */
export async function extractEntities(
  text: string,
  options: { useModel?: boolean; model?: string } = {},
): Promise<{ entities: ExtractedEntity[]; modelUnavailable?: string }> {
  const byPattern = extractByPattern(text);
  if (options.useModel !== true) return { entities: byPattern };

  /**
   * The model may THROW, not merely be unavailable.
   *
   * extractByModel returns a reason when a runtime is absent, but the host's
   * IPC rejects on a bad response from the runtime — so a live-but-unhappy
   * model produced a rejection that escaped this function and took the
   * pattern-matched entities with it. That contradicts this module's own
   * contract: pattern extraction always runs, because it is the half that
   * works for someone with no model at all.
   *
   * A model that fails must cost the model's results and nothing else.
   */
  const modelOutcome = await extractByModel(text, { model: options.model })
    .catch((error: unknown) => ({
      entities: [] as ExtractedEntity[],
      unavailable: error instanceof Error ? error.message : 'the local model failed',
    }));
  const merged = new Map<string, ExtractedEntity>();
  for (const entity of modelOutcome.entities) merged.set(`${entity.kind}:${entity.value.toLowerCase()}`, entity);
  for (const entity of byPattern) merged.set(`${entity.kind}:${entity.value.toLowerCase()}`, entity);

  return { entities: [...merged.values()], modelUnavailable: modelOutcome.unavailable };
}
