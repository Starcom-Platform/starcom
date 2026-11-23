/**
 * A card's alt text (block I, item 5; the shot's `output.alt`): what a screen
 * reader says for the image, written from the same facts the card states and
 * never by its caller.
 *
 * The badge and the whole headline first, which the card itself may shorten;
 * then the facts; what the picture shows; every caveat that applies, in its
 * short form; and when Starcom made it. Kept within ALT_TEXT_MAX by dropping
 * facts from the end. A caveat is never dropped, here as on the card.
 */
import type { GlobeViewProvenance, InsetProvenance } from './shareCardProvenance';
import type { CardFit } from './shareCardLayout';

/** Mastodon's limit, the most generous of the places Mecha Jono posts to; Discord and X take the text as given. */
export const ALT_TEXT_MAX = 1500;

/** A line as a sentence a screen reader says well: separators as commas, and a full stop unless it ends already. */
const sentence = (text: string) => {
  const said = text.trim().replace(/\s·\s/g, ', ');
  // An ellipsis ends it too: a title the source cut, as Mecha Jono's long ones come.
  return /[.!?…]$/.test(said) ? said : `${said}.`;
};
const place = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
const list = (items: readonly string[]) =>
  (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** What a close-up inset shows (IM34), from what the card states of it. */
function insetSentence(inset: InsetProvenance): string {
  const others = inset.shown - 1;
  return inset.kind === 'venues'
    ? `An inset shows the featured venue among ${others} other public ${others === 1 ? 'venue' : 'venues'} open the same night `
      + `${inset.within}, placed to ${inset.placedTo}${inset.gridKm !== null ? `, on a ${inset.gridKm} km grid` : ''}, with a ${inset.scale} scale bar.`
    : `An inset shows ${inset.shown} heat ${inset.shown === 1 ? 'town' : 'towns'} of ${inset.within} the same day by level, `
      + `the featured one ringed, placed to ${inset.placedTo}, with a ${inset.scale} scale bar.`;
}

/** What the card features, as the picture shows it: an area or a theatre is lit, an item marked (BA22; theatre-lens.md, TL3). */
const featuredInPicture = (id: string) => (id.startsWith('area:') ? 'the area lit and labelled'
  : id.startsWith('theatre:') ? 'the theatre\'s countries lit and labelled'
    : 'the item marked and labelled');

/** The strip in one sentence: its span, and what its lanes are. */
function stripSentence(t: NonNullable<GlobeViewProvenance['timestream']>): string {
  const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const lanes = [
    ...(t.lanes.includes('windows') && t.windows ? ['the windows'] : []),
    ...(t.lanes.includes('kp') ? ['Kp'] : []),
    ...(t.bodies.length ? [`${list(t.bodies)}${t.frame === 'galactic' ? ' in the Galactic Centre frame' : ''}`] : []),
  ];
  return `Under it, the Timestream from ${day(t.fromS)}Z to ${day(t.untilS)}Z${lanes.length ? `: ${list(lanes)}` : ''}, the card's moment marked.`;
}

export function altTextFor(
  provenance: GlobeViewProvenance,
  options: { fit: CardFit; keyLayers: readonly string[] | null },
): string {
  const p = provenance;
  const subject = p.featured?.title
    ?? p.frontPage?.title
    ?? (p.layersShown.length ? `${list(p.layersShown)} on the globe` : 'The globe');
  const head = `${p.card?.badge ? `${p.card.badge}: ` : ''}${sentence(subject)}`;
  const facts = (p.featured?.lines ?? p.frontPage?.lines ?? []).map(sentence);
  const shown = options.keyLayers ?? p.layersShown;
  const picture = `The picture: ${options.fit === 'planet' ? 'the whole planet' : 'the globe'} centred near `
    + `${place(p.camera.lat, p.camera.lon)}${p.featured ? `, ${featuredInPicture(p.featured.id)}` : ''}`
    + `${shown.length ? `, showing ${list(shown)}` : ''}`
    // The country names, when the shot asked for them (decision K5, TS10).
    + `${p.appearance?.countryNames ? ', with country names' : ''}.`;
  const caveats = p.caveatsShort?.length === p.caveats.length ? p.caveatsShort : p.caveats;
  const said = caveats.length ? `Caveats: ${caveats.map(sentence).join(' ')}` : '';
  const made = `Made by Starcom, ${p.capturedAt.slice(0, 16).replace('T', ' ')}Z.`;
  // A code a reader cannot see is still on the card (IM13): say it is there, and what it opens.
  const code = p.qr ? 'A QR code opens this view on Starcom.' : '';
  const inset = p.inset ? insetSentence(p.inset) : '';
  // The Timestream strip under the picture, when there is one (D-PW, PW62).
  const strip = p.timestream ? stripSentence(p.timestream) : '';

  const compose = (kept: readonly string[]) => [head, ...kept, picture, strip, inset, said, code, made].filter(Boolean).join(' ');
  let kept = facts;
  let text = compose(kept);
  while (text.length > ALT_TEXT_MAX && kept.length) {
    kept = kept.slice(0, -1);
    text = compose(kept);
  }
  return text;
}
