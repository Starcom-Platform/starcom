/**
 * What a recorded clip of the globe is allowed to claim.
 *
 * ─── WHY THIS EXISTS BEFORE THE RECORDER DOES ──────────────────────────────
 *
 * A still has one moment. Every caveat on a share card is measured against
 * `capturedAt`, and every one of them is true or false at that instant. A clip
 * spans time, and the instant model does not survive contact with it: a feed
 * can fail at second four and recover at second seven, the analysis can add
 * marks mid-shot, and "NOAA was unreachable" is neither true nor false of a
 * clip in which it was unreachable for three seconds out of ten.
 *
 * If the recorder were written first, it would decide these questions by
 * accident — whatever was easiest to sample would become what a clip claims.
 * So the claims are settled here, as a pure function over samples, and the
 * recorder's job is reduced to supplying samples honestly.
 *
 * ─── THE ONE RULE EVERYTHING ELSE FOLLOWS FROM ─────────────────────────────
 *
 *   State may change during a clip only if a declared track drives it.
 *
 * A clip of a camera move is supposed to show one fixed state from a moving
 * viewpoint. If something else changes underneath it, the viewer sees change
 * and cannot tell whether the camera caused it or the world did. So every
 * piece of state falls into exactly one of three classes:
 *
 *   DRIVEN      A track changes it on purpose — that is the content. v1 has
 *               exactly one track, `camera`.
 *
 *   OPERATOR    The operator controls it and no track drives it: which layers
 *               are on. If it changes mid-clip the clip is REFUSED, because the
 *               change was avoidable and the result conflates two stories.
 *
 *   WORLD       Nobody controls it: feed health, what the analysis produced.
 *               It cannot be held still, so it is sampled and every change is
 *               DISCLOSED with when it happened.
 *
 * The build is a fourth thing and simply must not move — a page is one build.
 *
 * This is also what makes the model ready for data over time. When a
 * time-scrubbing track arrives, it declares itself, and the feed and mark
 * changes it drives move from "disclosed as incidental" to "the content" —
 * without the rule changing, because the rule was never about cameras.
 *
 * ─── HOW A CAVEAT THAT WAS TRUE FOR PART OF A CLIP IS STATED ───────────────
 *
 * A condition true throughout is stated plainly, in the same words a still
 * would use. A condition true for part of the clip is stated WITH its time
 * ranges, because "unreachable" over the whole clip and "unreachable from 0:04"
 * are different claims about what the footage shows, and collapsing them in
 * either direction misleads: the first overstates the gap, the second hides
 * which seconds are affected.
 *
 * Staleness reports the WORST age seen across the clip, not the first or the
 * last. It is the most conservative true statement available.
 */
import {
  CAPTURE_ORIGIN,
  EMPTY_REASON_CAVEAT,
  COUNTRY_NAMES_CAVEAT,
  STALE_AFTER_MS,
  AHEAD_AFTER_MS,
  humanAge,
  standingNotes,
  type AnalysisEmptyReason,
  type BuildProvenance,
  type CameraProvenance,
  type FeedProvenance,
  type LayerProvenance,
  type MarkProvenance,
  type FeaturedProvenance,
} from './shareCardProvenance';
import { creditsShown } from './sourceCredits';
import type { MarkerStyle } from '../../../components/Globe/markerStyles';

export const GLOBE_CLIP_SCHEMA = 'starcom.globe.clip' as const;
/**
 * 13: `compare.labels` — one layer at two moments (D-CM, CM4; contract v79): each half's name with its window.
 * 12: `compare` — two layers side by side (D-CM, CM3; contract v78): `left` and `right`, the layer ids each half drew,
 *    each half without the other's; each frame names its halves, and a caveat says it.
 * 11: `replay.quakes` and `replay.quakeDecaySeconds` (D-EQ, EQ21; contract v77): the quakes drawn were replayed with
 *    the reports, each rising and bursting as the replay reached it and fading over these seconds of the clip.
 * 10: `sweep.stepSeconds` — a stepped sweep (D-PW, PW62; contract v65): the moment jumped by this step and held
 *    between, and the caveat says so. A sweep with no forecast layer drawn may span to 400 days.
 * 9: `markStyle` — one mark style drawn on every layer that takes one, as the clip
 *    asked, whatever the page's person picked (plan H4). Absent, each layer drew its own.
 * 8: the `tour` track and `tour` — a briefing playlist as a clip (briefing-playlists.md,
 *    BP14–BP21): the playlist, how many of its stops the clip shows of how many in
 *    all, and each caption burned into the footage with when it shows: the opening's,
 *    then each stop's item through its flight and its hold. Nothing is featured.
 * 7: `countryNames` — the clip drew Natural Earth's country names, frame by
 *    frame, as a card that asks does (decision K5, TS10), with their caveat; the
 *    end card credits "Names: Natural Earth" (TS14).
 * 6: `imagery` — who made the images drawn at any moment of the clip, after the
 *    end card's data (decisions TX8–TX10), as each sample read it from the globe.
 * 5: the `moment` track and `sweep` (decision D-W, step 5c): a clip that moves
 *    the shared moment, every layer drawn for each frame's. A feed may then be
 *    drawn for part of the footage only, its other runs `absent`, and each
 *    feed is judged against the moment a frame shows.
 * 4: `credits` — each source whose data was drawn at any moment of the clip,
 *    as the end card's "Data:" line names it (record D-L, decision L5).
 * 3: `replay.basis` and `replay.outside` — where a replay's span came from,
 *    named, the timeline's window or the reports' own (BA2), and how many
 *    reports drawn outside it were hidden while it played.
 * 2: `featured` — the report a clip is about, constant across it (decision D-F,
 *    section 18, item 5).
 * 1: first version. Independent of GLOBE_CAPTURE_SCHEMA_VERSION — a clip is a
 *    different artefact with a different claim structure, not a still with
 *    extra fields.
 */
export const GLOBE_CLIP_SCHEMA_VERSION = 14 as const;

/** What a clip's origin line says. Parallels CAPTURE_ORIGIN for stills. */
export const CLIP_ORIGIN = CAPTURE_ORIGIN.replace('capture', 'recording');

/**
 * Tracks — the state a clip changes ON PURPOSE.
 *
 * `camera`, and `time`: a replay revealing reports as a clock sweeps a window
 * (decision D-F, section 18, item 5). The union anticipated this member.
 * `moment`: the shared moment swept, so every layer is drawn for each frame's,
 * Earth Weather's forecast hours among them (decision D-W, step 5c).
 * `tour`: a briefing playlist's captions, burned into the footage stop by stop (schema 8).
 */
export type ClipTrack = 'camera' | 'time' | 'moment' | 'tour' | 'story';

/**
 * A story recorded as one clip (schema 14; D-ST, ST8): each step it shows, with when it shows, its layers and window,
 * and its caption as its author wrote it. The story drives the layers: they change at each step, on purpose.
 */
export interface ClipStory {
  title: string;
  /** The steps shown, of the story's: a clip holds a minute, and says when steps were left out. */
  shown: number;
  total: number;
  partial: boolean;
  steps: Array<{
    index: number;
    fromMs: number;
    toMs: number;
    layer: string;
    pins: string[];
    window: { from: number; until: number } | null;
    caption: string;
  }>;
}

/** A briefing playlist toured by a clip, and each caption with when it shows (schema 8; BP15, BP18). */
export interface ClipTour {
  /** The playlist: `war`, `raves`, `heat` or `heroes`. */
  playlist: string;
  title: string;
  /** The stops the clip shows, in the playlist's order, of how many the playlist held. */
  shown: number;
  total: number;
  /** Planned before The Record was read whole: it stops at what had arrived (BP21). */
  partial: boolean;
  opening: { why: string; fromMs: number; toMs: number };
  /** Each stop's item and caption, shown from its flight's start to its hold's end. */
  stops: Array<{ id: string; title: string; progress: string; why: string; lines: string[]; fromMs: number; toMs: number }>;
}

/** The span a sweep moved the shared moment across (schema 5). */
export interface ClipSweep {
  fromIso: string;
  toIso: string;
  /** A stepped sweep's step, seconds (schema 10): the moment jumped by it and held between. */
  stepSeconds?: number;
}

/** A step in words: "a day", "6 hours", "30 minutes". */
const stepWords = (s: number): string => {
  const [n, unit] = s % 86_400 === 0 ? [s / 86_400, 'day'] : s % 3_600 === 0 ? [s / 3_600, 'hour'] : [Math.round(s / 60), 'minute'];
  return n === 1 ? `a${unit === 'hour' ? 'n' : ''} ${unit}` : `${n} ${unit}s`;
};

/** The window a replay swept, and how many reports it could not place in it. */
export interface ClipReplay {
  fromIso: string;
  toIso: string;
  /** `even`: in order, evenly spaced. `time`: at the pace of the calendar. */
  pace: 'even' | 'time';
  /** Reports stating no time, shown throughout rather than given one. */
  untimed: number;
  /**
   * Where the span came from (clip schema 3; BA2): named by the caller, the
   * timeline's window, or the reports' own first and last times. Absent on
   * clips from before it, whose span was always the reports'.
   */
  basis?: 'named' | 'window' | 'reports';
  /** Reports drawn with a time outside the span, hidden while it played (schema 3). */
  outside?: number;
  /** How many quakes in the span were replayed (schema 11): each rose and burst as the replay reached it. */
  quakes?: number;
  /** Over how many seconds of the clip each replayed quake faded (schema 11): 1, 4 or 10. */
  quakeDecaySeconds?: number;
}

/** The world, as the recorder observed it at one moment of the clip. */
export interface ClipSample {
  at: Date;
  camera: CameraProvenance;
  layers: LayerProvenance[];
  feeds: FeedProvenance[];
  marks: MarkProvenance | null;
  build: BuildProvenance;
  /** The report featured when this sample was taken, or none. */
  featured?: FeaturedProvenance | null;
  /** The shared moment this frame shows, when a moment track drives it (schema 5). */
  moment?: Date;
  /** Who made the images drawn when this sample was taken, as a card names them (schema 6). */
  imagery?: string[];
}

export interface ClipWindow {
  startedAt: Date;
  endedAt: Date;
  /** What was driven. Defaults to camera — the only track there is. */
  tracks?: ClipTrack[];
  /** Required when `tracks` includes `time`: the window the replay swept. */
  replay?: ClipReplay;
  /** Required when `tracks` includes `moment`: the span the moment was swept across. */
  sweep?: ClipSweep;
  /** The clip drew country names (schema 7). */
  countryNames?: true;
  /** The one mark style the clip drew on every layer (schema 9). */
  markStyle?: MarkerStyle;
  /** Two layers side by side, by their ids (schema 12), each half's name where it has one (schema 13). */
  compare?: { left: string; right: string; labels?: { left: string; right: string } };
  /** Required when `tracks` includes `tour`: the playlist and its captions (schema 8). */
  tour?: ClipTour;
  /** Required when `tracks` includes `story`: the story and each step's span (schema 14). */
  story?: ClipStory;
  /**
   * Wall time the footage took to produce, when it was rendered frame by frame.
   *
   * The world was observed across THIS span, not the footage's. Four seconds
   * of footage rendered over forty seconds shows data from a forty-second
   * window, and a viewer's natural reading of a four-second clip is that it
   * shows four seconds of the world.
   */
  renderedOverMs?: number;
}

/** One feed's state, classified — exact ages vary every sample, states do not. */
/** `absent`: not drawn at that moment of a sweep, as radar far from its frame (schema 5). */
export type FeedState = 'fresh' | 'stale' | 'unreachable' | 'loading' | 'never-loaded' | 'unreadable' | 'unreported' | 'absent';

/** A span of the clip during which a feed held one state. Offsets from start. */
export interface FeedRun {
  state: FeedState;
  fromMs: number;
  toMs: number;
}

export interface ClipFeedHistory {
  name: string;
  runs: FeedRun[];
  /** Worst age observed, when the feed ever reported a readable timestamp. */
  maxAgeMs: number | null;
}

export interface ClipProvenance {
  schema: typeof GLOBE_CLIP_SCHEMA;
  schemaVersion: typeof GLOBE_CLIP_SCHEMA_VERSION;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  origin: string;
  build: BuildProvenance;
  /** What changed on purpose. Everything else either held still or is disclosed. */
  tracks: ClipTrack[];
  camera: { start: CameraProvenance; end: CameraProvenance };
  /** Constant across the clip — a clip in which they changed was refused. */
  layersShown: string[];
  feeds: ClipFeedHistory[];
  /** Range of analysis marks shown, or null when no analysis layer was up. */
  marks: { min: number; max: number; fabricated: number | null } | null;
  /** How many samples the claims above rest on. */
  sampleCount: number;
  /** Wall time rendering took, when frame by frame; null for real-time capture. */
  renderedOverMs: number | null;
  /** The report the clip is about, when one was featured throughout. */
  featured?: FeaturedProvenance;
  /** The window a replay swept, when the clip drove time. */
  replay?: ClipReplay;
  /** The span the moment was swept across, when the clip drove it (schema 5). */
  sweep?: ClipSweep;
  /** The end card's "Data:" line: each source drawn at any moment, once (schema 4). */
  credits: string[];
  /** Who made the images drawn at any moment, once, after the data (schema 6). */
  imagery: string[];
  /** The clip drew Natural Earth's country names (schema 7). Absent when it did not. */
  countryNames?: true;
  /** The one mark style it drew on every layer that takes one (schema 9). Absent, each layer drew its own. */
  markStyle?: MarkerStyle;
  /** Two layers side by side, by their ids, each half without the other's (schema 12); names (schema 13). Absent for one globe. */
  compare?: { left: string; right: string; labels?: { left: string; right: string } };
  /** The playlist it toured, and each caption with when it shows (schema 8). Absent when it toured none. */
  tour?: ClipTour;
  /** The story it showed, each step with when (schema 14). Absent when it showed none. */
  story?: ClipStory;
  caveats: string[];
}

export class ClipProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipProvenanceError';
  }
}

/** m:ss — how a viewer scrubbing the clip will read a position in it. */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function classifyFeed(feed: FeedProvenance, at: Date): { state: FeedState; ageMs: number | null } {
  // Same rules as a still — see FeedProvenance for why each state exists.
  if (feed.unreported) return { state: 'unreported', ageMs: null };
  if (feed.error) return { state: 'unreachable', ageMs: null };
  if (feed.lastUpdated === null) {
    if (feed.loading) return { state: 'loading', ageMs: null };
    return { state: feed.timestamped === false ? 'fresh' : 'never-loaded', ageMs: null };
  }
  const age = at.getTime() - new Date(feed.lastUpdated).getTime();
  if (Number.isNaN(age)) return { state: 'unreadable', ageMs: null };
  return { state: age >= STALE_AFTER_MS ? 'stale' : 'fresh', ageMs: age };
}

/** What each state means, in words — for a state that held the whole clip. */
function constantFeedCaveat(name: string, state: FeedState, maxAgeMs: number | null): string | null {
  switch (state) {
    case 'fresh': return null;
    case 'stale': return `${name} was up to ${humanAge(maxAgeMs ?? 0)} out of date throughout this clip.`;
    case 'unreachable': return `${name} did not load at any point in this clip — nothing from it appears, and that is not an all-clear.`;
    case 'loading': return `${name} had not finished loading at any point in this clip.`;
    case 'never-loaded': return `${name} never loaded during this clip — nothing from it appears.`;
    case 'unreadable': return `${name} reported an unreadable timestamp — its recency cannot be stated.`;
    case 'unreported': return `${name} does not report whether its data arrived — an empty result here cannot be told apart from a failed source.`;
    default: return null;
  }
}

/*
 * The words a viewer reads, which are not always the state's name. `unreachable`
 * stays the state value — clip schema v1 publishes it — but it reads as "failed",
 * because a source that answered with a refusal, or was never asked for want of a
 * key, was not unreachable, and a caption saying so would be wrong about why.
 */
const STATE_WORD: Record<FeedState, string> = {
  fresh: 'current',
  stale: 'out of date',
  unreachable: 'failed',
  loading: 'loading',
  'never-loaded': 'not loaded',
  unreadable: 'unreadable',
  unreported: 'not reporting',
  absent: 'not drawn',
};

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');

export function buildClipProvenance(samples: ClipSample[], window: ClipWindow): ClipProvenance {
  // ── refusals: the conditions under which a clip cannot honestly claim anything ──

  if (!samples.length) {
    throw new ClipProvenanceError(
      'No samples. A clip with no observations of the world during it can state nothing '
      + 'about what the footage shows, and an empty provenance would read as a clean one.',
    );
  }

  const start = window.startedAt.getTime();
  const end = window.endedAt.getTime();
  if (!(end > start)) {
    throw new ClipProvenanceError(`The clip ends (${window.endedAt.toISOString()}) at or before it starts.`);
  }

  for (let i = 0; i < samples.length; i++) {
    const t = samples[i].at.getTime();
    if (t < start || t > end) {
      throw new ClipProvenanceError(
        `Sample ${i} at ${samples[i].at.toISOString()} lies outside the clip. A claim built from `
        + 'a moment the footage does not contain is a claim about some other footage.',
      );
    }
    if (i > 0 && t < samples[i - 1].at.getTime()) {
      throw new ClipProvenanceError(`Samples are out of order at index ${i}; time ranges would be meaningless.`);
    }
  }

  const tracks = window.tracks ?? ['camera'];
  if (tracks.includes('time') && !window.replay) {
    throw new ClipProvenanceError(
      'The clip has a time track and no window to say it swept. A replay that does not say '
      + 'which days it covers reads as the present.',
    );
  }
  // A swept moment changes which sources are drawn, on purpose, and a story's steps change the layers; nothing else may.
  const storied = tracks.includes('story');
  if (storied && !window.story) {
    throw new ClipProvenanceError('The clip has a story track and no story to say what each step showed.');
  }
  const sweeping = tracks.includes('moment') || storied;
  if (tracks.includes('moment') && !window.sweep) {
    throw new ClipProvenanceError(
      'The clip has a moment track and no span to say what it swept. A clip whose hours are not '
      + 'stated reads as one moment.',
    );
  }
  if (tracks.includes('tour') && !window.tour) {
    throw new ClipProvenanceError(
      'The clip has a tour track and no stops to say what it toured. Captions that are not recorded '
      + 'cannot be checked against the footage.',
    );
  }
  const first = samples[0];

  // BUILD — a page is one build. A second one means the samples came from two.
  for (const s of samples) {
    if (s.build.sha !== first.build.sha) {
      throw new ClipProvenanceError(
        `The build changed during the clip (${first.build.sha} → ${s.build.sha}). A clip spans one `
        + 'page, and one page is one build — these samples came from two, so no single claim covers them.',
      );
    }
  }

  // OPERATOR state — must hold still unless a track drives it. Only a story's track drives layers (schema 14).
  const shownOf = (s: ClipSample) => s.layers.filter((l) => l.active && l.implemented).map((l) => l.label);
  const firstShown = storied ? [...new Set(samples.flatMap(shownOf))] : shownOf(first);
  for (const s of storied ? [] : samples) {
    if (!sameSet(shownOf(s), firstShown)) {
      throw new ClipProvenanceError(
        `The layers shown changed during the clip ([${firstShown.join(', ')}] → [${shownOf(s).join(', ')}]) `
        + 'and no track drives layers. A viewer would see the world change and could not tell whether '
        + 'the camera did it or the operator did. Record the camera move and the layer change as separate clips.',
      );
    }
  }

  /*
   * The feed SET follows from the layers, so it must be as constant as they
   * are, unless the moment is swept: radar is drawn only near its newest frame,
   * and the satellites' clouds only for hours they have seen. Then every feed
   * drawn at any moment is reported, with when it was not.
   */
  /*
   * A source is known by its short name where it has one: Raver Watch's name says what
   * it draws at that moment ("… (225 not begun)"), so its name changes as an event begins
   * or the moment is swept, and it is still the one source (raver-nights.md).
   */
  const keyOf = (f: { name: string; shortName?: string }) => f.shortName ?? f.name;
  const feedNames = sweeping
    ? [...new Set(samples.flatMap((s) => s.feeds.map(keyOf)))]
    : first.feeds.map(keyOf);
  for (const s of sweeping ? [] : samples) {
    if (!sameSet(s.feeds.map(keyOf), feedNames)) {
      throw new ClipProvenanceError(
        'The set of feeds reported changed during the clip while the layers did not. That is an '
        + 'inconsistency in how the samples were taken, not in the world, and no honest history can be '
        + 'built across it.',
      );
    }
  }

  /*
   * The featured report, as constant as the layers. An end card names one
   * subject; a clip whose subject changed halfway would be captioned with
   * whichever it ended on.
   */
  const featuredKey = (s: ClipSample) => s.featured?.id ?? null;
  for (const s of samples) {
    if (featuredKey(s) !== featuredKey(first)) {
      throw new ClipProvenanceError(
        `The featured report changed during the clip (${featuredKey(first) ?? 'none'} → ${featuredKey(s) ?? 'none'}). `
        + 'A clip is about one report or none; record each as its own clip.',
      );
    }
  }

  // ── WORLD state — sampled, and every change disclosed with when ──

  const caveats: string[] = [];
  const offsetOf = (s: ClipSample) => s.at.getTime() - start;
  const durationMs = end - start;

  const feeds: ClipFeedHistory[] = feedNames.map((key) => {
    const runs: FeedRun[] = [];
    let maxAgeMs: number | null = null;
    // Its whole name where that held still; its short name where the name changed.
    const named = new Set(samples.flatMap((s) => s.feeds.filter((f) => keyOf(f) === key).map((f) => f.name)));
    const name = named.size === 1 ? [...named][0] : key;
    samples.forEach((s, i) => {
      const feed = s.feeds.find((f) => keyOf(f) === key);
      // Judged against the moment the frame shows: an hour of a day past is that hour, not a stale reading.
      // A moment ahead of the frame's drawing is a forecast's, and a source is judged by the drawing (SW19).
      const judgedAt = s.moment && s.moment.getTime() - s.at.getTime() > AHEAD_AFTER_MS ? s.at : s.moment ?? s.at;
      const { state, ageMs } = feed ? classifyFeed(feed, judgedAt) : { state: 'absent' as const, ageMs: null };
      if (ageMs !== null) maxAgeMs = Math.max(maxAgeMs ?? 0, ageMs);
      /*
       * A run extends to the next sample that differs, and the last run to the
       * end of the clip — a sample is a reading of the world from that moment
       * until the next reading, which is the only interpretation that leaves
       * no gap and claims no overlap.
       */
      const next = i + 1 < samples.length ? offsetOf(samples[i + 1]) : durationMs;
      const last = runs[runs.length - 1];
      if (last && last.state === state) last.toMs = next;
      else runs.push({ state, fromMs: i === 0 ? 0 : offsetOf(s), toMs: next });
    });
    return { name, runs, maxAgeMs };
  });

  for (const f of feeds) {
    if (f.runs.length === 1) {
      const c = constantFeedCaveat(f.name, f.runs[0].state, f.maxAgeMs);
      if (c) caveats.push(c);
      continue;
    }
    const spans = f.runs
      .map((r) => `${STATE_WORD[r.state]} ${formatOffset(r.fromMs)}–${formatOffset(r.toMs)}`)
      .join(', ');
    caveats.push(`${f.name} changed during this clip: ${spans}. Read the footage against those times.`);
  }

  // Standing notes, by the same rule as a still — once, if the source's data was in
  // the picture at any moment of the clip.
  caveats.push(...new Set(samples.flatMap((s) => standingNotes(s.feeds))));

  // A story's captions are its author's, and a minute may not hold all its steps (D-ST).
  if (window.story) {
    caveats.push(`A story, "${window.story.title}": its captions are its author's words, as written; its layers change at each step.`);
    if (window.story.partial) caveats.push(`${window.story.shown} of its ${window.story.total} steps are shown: a story's clip holds a minute.`);
  }

  // Analysis marks.
  const markSamples = samples.map((s) => s.marks);
  const anyMarkLayer = markSamples.some((m) => m !== null);
  let marks: ClipProvenance['marks'] = null;

  if (anyMarkLayer) {
    const shown = markSamples.map((m) => m?.shown ?? 0);
    const min = Math.min(...shown);
    const max = Math.max(...shown);
    /*
     * Null if ANY sample left it unmeasured — the same rule as combining layers
     * in a still. A clip that was measured for eight seconds and not for two
     * has no number that honestly covers all ten.
     */
    const fabricated = markSamples.some((m) => m === null || m.fabricated === null)
      ? null
      : Math.max(...markSamples.map((m) => m!.fabricated as number));
    marks = { min, max, fabricated };

    if (max > 0) {
      if (min !== max) {
        caveats.push(`The analysis changed while recording: between ${min} and ${max} marks were shown at different moments.`);
      }
      if (fabricated === null) {
        caveats.push(
          'Whether any analysis marks rest on fabricated observations is not measured here — '
          + 'no fabrication flag is not the same as no fabrication.',
        );
      } else if (fabricated > 0) {
        caveats.push(`Up to ${fabricated} observations behind these marks are fabricated.`);
      }
      caveats.push(
        'Marks are drawn as exact points; the observations\' stated location precision is not '
        + 'carried onto the globe, so the footage implies more precision than the evidence may support.',
      );
    } else {
      // Empty throughout. Only stated if every sample agrees on why.
      const reasons = new Set(markSamples.map((m) => m?.emptyReason ?? null));
      const only = reasons.size === 1 ? [...reasons][0] : null;
      if (only) caveats.push(EMPTY_REASON_CAVEAT[only as AnalysisEmptyReason]);
    }
  }

  if (!firstShown.length) {
    caveats.push('No data layer was active — this is the globe itself, not a reading of anything.');
  }
  if (!first.build.sha) {
    caveats.push('This build is unidentified — the footage cannot be traced to the code that drew it.');
  }

  /*
   * Only when it matters. A render that took barely longer than the footage
   * observed the world over barely longer a span; stating it every time would
   * be a caveat that is always present and therefore never read.
   */
  const renderedOverMs = window.renderedOverMs ?? null;
  if (renderedOverMs !== null && renderedOverMs > durationMs * 1.5) {
    caveats.push(
      `Rendered frame by frame over ${formatOffset(renderedOverMs)} of real time, so these `
      + `${formatOffset(durationMs)} of footage show the world across that longer span. `
      + 'Times given for any change refer to the footage.',
    );
  }

  /*
   * Last, and unconditional, as for a still — and naming the duration, because
   * "one browser's view" of ten seconds is a different object from one moment
   * of it, and the reader should not have to infer which.
   */
  // Two layers side by side (schema 12): which half is which, so neither is read as the other's.
  if (window.compare) {
    const labelOf = (id: string) => samples[0]?.layers.find((l) => l.id === id)?.label ?? id;
    const left = window.compare.labels?.left ?? labelOf(window.compare.left);
    const right = window.compare.labels?.right ?? labelOf(window.compare.right);
    caveats.push(`Side by side: ${left} in the left half, ${right} in the right; each half draws its own of the two.`);
  }
  if (window.replay) {
    const minute = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')}Z`;
    const { fromIso, toIso, untimed, pace, basis, outside = 0, quakes = 0, quakeDecaySeconds } = window.replay;
    const spanIs = basis === 'named' ? ', the span asked for' : basis === 'window' ? ", the timeline's window" : '';
    // With quakes in it, a replay may hold no report at all: the words name both, and claim neither is there.
    const appears = quakes > 0
      ? 'each report or quake drawn appears by its event time, a report stating none by when it was written. '
      : 'each report appears by its event time, or when it was written where it states none. ';
    caveats.push(
      `A replay from ${minute(fromIso)} to ${minute(toIso)}${spanIs}: ${appears}`
      + (pace === 'even'
        ? 'They appear in the order they happened, evenly spaced; the spacing is not the time between them.'
        : 'They appear at the pace of the calendar; the footage is not those days passing in real time.')
      + (untimed > 0 ? ` ${untimed} report${untimed === 1 ? '' : 's'} state no time and are shown throughout.` : '')
      + (outside > 0 ? ` ${outside} report${outside === 1 ? '' : 's'} drawn outside it ${outside === 1 ? 'is' : 'are'} hidden while it plays.` : '')
      // The quakes replayed with them (schema 11): when each happened, and how long it stays.
      + (quakes > 0 && quakeDecaySeconds
        ? ` ${quakes} quake${quakes === 1 ? '' : 's'} rise as the replay reaches each and fade over ${quakeDecaySeconds} s of the clip.`
        : ''),
    );
  }

  if (window.sweep) {
    const minute = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')}Z`;
    const { fromIso, toIso } = window.sweep;
    const recorded = window.startedAt.toISOString();
    caveats.push(
      `The moment moves from ${minute(fromIso)} to ${minute(toIso)}${window.sweep.stepSeconds ? ` in steps of ${stepWords(window.sweep.stepSeconds)}` : ''} over the footage, and every layer is drawn for each frame's moment.`
      + (Date.parse(toIso) > window.startedAt.getTime()
        ? ` Hours after ${minute(recorded)}, when it was recorded, are a forecast: layers that forecast show theirs; the others show what they held, those that filter by time only what falls in the window.`
        : ''),
    );
  }

  if (window.countryNames) caveats.push(COUNTRY_NAMES_CAVEAT);
  if (window.tour?.partial) {
    caveats.push(`The tour was planned before The Record had been read whole for ${window.tour.title}: it stops at what had arrived.`);
  }

  caveats.push(
    `Unsigned client-side recording: one browser's view over ${formatOffset(durationMs)}, `
    + 'not an attested record.',
  );

  return {
    schema: GLOBE_CLIP_SCHEMA,
    schemaVersion: GLOBE_CLIP_SCHEMA_VERSION,
    startedAt: window.startedAt.toISOString(),
    endedAt: window.endedAt.toISOString(),
    durationMs,
    origin: CLIP_ORIGIN,
    build: first.build,
    tracks,
    camera: { start: first.camera, end: samples[samples.length - 1].camera },
    layersShown: firstShown,
    feeds,
    marks,
    sampleCount: samples.length,
    renderedOverMs,
    ...(first.featured ? { featured: first.featured } : {}),
    ...(window.replay ? { replay: window.replay } : {}),
    ...(window.sweep ? { sweep: window.sweep } : {}),
    credits: [...new Set(samples.flatMap((s) => creditsShown(s.feeds)))],
    imagery: [...new Set(samples.flatMap((s) => s.imagery ?? []))],
    ...(window.countryNames ? { countryNames: true as const } : {}),
    ...(window.markStyle ? { markStyle: window.markStyle } : {}),
    ...(window.compare ? { compare: window.compare } : {}),
    ...(window.tour ? { tour: window.tour } : {}),
    ...(window.story ? { story: window.story } : {}),
    caveats,
  };
}
