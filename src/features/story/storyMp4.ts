/**
 * A story's clip as an mp4, made in the browser (D-ST, ST8): the same frames the share handle's recordStory makes,
 * each drawn onto a canvas as it comes and encoded with WebCodecs through Mediabunny (MPL-2.0), loaded only when a
 * clip is made. Not real time: each frame is stamped at its own moment (i / fps), so the timing is exact however long
 * the globe took to draw it, and no frame is held after it is encoded, so a minute of footage is never in memory.
 * H.264 where the browser can encode it, as the platforms a clip is posted to want; where it cannot, the reason.
 */
import type { CaptureResult } from '../globe/capture/captureGlobeFrame';

/** The page's recorder of a story's clip (useGlobeShareCard's recordStory), each frame streamed; set while a globe is up. */
export type StoryClipRecorder = (
  story: unknown,
  options: { fps?: number; quality?: number },
  stream: (frame: CaptureResult, index: number) => Promise<void>,
) => Promise<{ fps: number; stats: { frames: number; footageFrames: number } }>;

let recorder: StoryClipRecorder | null = null;
export const setStoryClipRecorder = (next: StoryClipRecorder | null): void => { recorder = next; };

/**
 * A story's clip as an mp4 file (ST8): recorded as the handle's recordStory records it, each frame encoded as it
 * comes; `told` hears each frame made. Refused, with the reason, where the browser cannot encode it.
 */
export async function recordStoryMp4(story: unknown, told: (frame: number) => void = () => undefined, fps = 30): Promise<Blob> {
  if (!recorder) throw new Error('The globe is not ready to record yet.');
  const refused = await mp4Refusal();
  if (refused) throw new Error(refused);
  const sink = await mp4Sink(fps);
  try {
    await recorder(story, { fps, quality: 0.92 }, async (frame, index) => {
      await sink.frame(frame, index);
      told(index);
    });
    return await sink.finish();
  } catch (e) {
    await sink.cancel();
    throw e;
  }
}

export interface Mp4Sink {
  /** Each frame, in order: footage, then the end card. */
  frame(frame: CaptureResult, index: number): Promise<void>;
  /** The finished file. */
  finish(): Promise<Blob>;
  /** Given up: nothing is written. */
  cancel(): Promise<void>;
}

/** Why this browser cannot make the mp4, or null when it can (checked before anything is drawn). */
export async function mp4Refusal(width = 1280, height = 720): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return 'This browser cannot encode video (no WebCodecs): the link and the cards still work.';
  try {
    const { canEncodeVideo } = await import('mediabunny');
    return (await canEncodeVideo('avc', { width, height })) ? null : 'This browser cannot encode H.264 video: the link and the cards still work.';
  } catch (e) {
    return `The video encoder could not be loaded: ${String((e as Error).message ?? e)}`;
  }
}

const decode = async (frame: CaptureResult): Promise<ImageBitmap> => {
  const comma = frame.dataUrl.indexOf(',');
  const bin = atob(frame.dataUrl.slice(comma + 1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: frame.mimeType }));
};

/** An encoder for frames of `width` × `height` at `fps`, writing an mp4 in memory. */
export async function mp4Sink(fps: number): Promise<Mp4Sink> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  let source: InstanceType<typeof CanvasSource> | null = null;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  let started = false;

  const begin = async (width: number, height: number) => {
    // Even sides: H.264 at 4:2:0 wants them.
    const w = width - (width % 2);
    const h = height - (height % 2);
    canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('No canvas to draw the clip\'s frames on.');
    source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    started = true;
  };

  return {
    async frame(frame, index) {
      if (!started) await begin(frame.width, frame.height);
      const image = await decode(frame);
      try {
        ctx!.drawImage(image, 0, 0, canvas!.width, canvas!.height);
      } finally {
        image.close();
      }
      await source!.add(index / fps, 1 / fps);
    },
    async finish() {
      if (!started) throw new Error('No frames were made.');
      source!.close();
      await output.finalize();
      const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
      if (!buffer) throw new Error('The mp4 was not written.');
      return new Blob([buffer], { type: 'video/mp4' });
    },
    async cancel() {
      if (started) await output.cancel().catch(() => undefined);
    },
  };
}
