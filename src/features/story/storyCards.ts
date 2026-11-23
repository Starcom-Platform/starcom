/**
 * A card of every step of a story, as one zip (D-ST, ST5; OR34). Each step is set as it is played and its card made
 * as the Share button makes one; its caption is drawn over the picture as a clip's captions are (layoutTourCaption),
 * its record written back into the file with a caveat that the caption is the story's author's words, and the cards
 * zipped as step-01.png … with story.txt, which lists each step's caption and the story's link. What it set is put
 * back after, every layer's choices given back.
 */
import { fill } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import { applyStep, captureStep, releaseChoices, type Story, type StoryHandle } from './story';
import { layoutTourCaption, drawTourCaption } from '../globe/capture/tourCaptionCard';
import { canvasMeasurer } from '../globe/capture/drawShareCard';
import { withCardRecord } from '../globe/capture/cardFileRecord';
import { dataUrlToBlob } from '../globe/capture/dataUrlToBlob';
import type { TourCaption } from '../globe/tour/tourPlayer';
import type { GlobeViewProvenance } from '../globe/capture/shareCardProvenance';

type Rect = { x: number; y: number; width: number; height: number };

/** What the cards need of the share handle besides a step's own: a card of the view as it is. */
export interface StoryCardHandle extends StoryHandle {
  compose(options?: { preset?: string; scale?: number }): Promise<{
    dataUrl: string; mimeType: string; width: number; height: number; provenance: GlobeViewProvenance; alt?: string; regions: { picture: Rect };
  }>;
}

type StoryWords = Messages['story'];

/** A step's caption as a clip's are laid out: the story and the step above, the caption as its title. */
export const stepCaption = (story: Story, index: number, w: StoryWords): TourCaption => ({
  playlist: story.title || w.untitled,
  progress: fill(w.step, { i: index + 1, n: story.steps.length }),
  title: story.steps[index]?.caption ?? '',
  why: '',
  lines: [],
});

/** The caveat a step's card carries: whose words its caption is. */
export const captionCaveat = (story: Story, index: number, w: StoryWords): string =>
  `${story.title || w.untitled}, ${fill(w.step, { i: index + 1, n: story.steps.length })}: the caption is the story's author's words, as written.`;

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The card could not be read back to caption it.'));
  image.src = src;
});

/** A card with its step's caption drawn over its picture, and its record written back in. */
export async function captionedCard(
  card: Awaited<ReturnType<StoryCardHandle['compose']>>, caption: TourCaption, caveat: string,
): Promise<Blob> {
  const provenance: GlobeViewProvenance = { ...card.provenance, caveats: [...card.provenance.caveats, caveat] };
  if (!caption.title.trim()) return dataUrlToBlob(withCardRecord(card.dataUrl, { ...card, provenance }).dataUrl);
  const image = await loadImage(card.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = card.width;
  canvas.height = card.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas to caption the card on.');
  ctx.drawImage(image, 0, 0);
  const { picture } = card.regions;
  ctx.save();
  ctx.translate(picture.x, picture.y);
  drawTourCaption(ctx, layoutTourCaption({ width: picture.width, height: picture.height, caption, measure: canvasMeasurer(ctx) }));
  ctx.restore();
  const drawn = canvas.toDataURL(card.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png');
  const mimeType = drawn.slice(5, drawn.indexOf(';'));
  return dataUrlToBlob(withCardRecord(drawn, { ...card, mimeType, provenance }).dataUrl);
}

/** Every step's card in one zip, step-01.png on, and story.txt; told of each card as it is made. */
export async function storyCardsZip(
  handle: StoryCardHandle, story: Story, w: StoryWords, link: string, told: (index: number) => void = () => undefined,
): Promise<Blob> {
  let before: ReturnType<typeof captureStep> | null = null;
  try { before = captureStep(handle); } catch { /* nothing drawn to put back */ }
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  try {
    for (let i = 0; i < story.steps.length; i += 1) {
      told(i);
      await applyStep(handle, story.steps[i], { transitionMs: 0 });
      const card = await handle.compose({ preset: 'wide' });
      const ext = card.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      zip.file(`step-${String(i + 1).padStart(2, '0')}.${ext}`, await captionedCard(card, stepCaption(story, i, w), captionCaveat(story, i, w)));
    }
    const text = [
      story.title || w.untitled,
      '',
      ...story.steps.map((step, i) => `${fill(w.step, { i: i + 1, n: story.steps.length })}: ${step.caption}`),
      '',
      link,
      '',
    ].join('\n');
    zip.file('story.txt', text);
    return await zip.generateAsync({ type: 'blob' });
  } finally {
    releaseChoices(handle, story.steps);
    if (before) await applyStep(handle, before, { transitionMs: 0, ready: false }).catch(() => undefined);
  }
}
