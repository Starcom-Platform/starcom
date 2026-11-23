/**
 * The Timestream under the globe (decision D-PW, PW37, PW38, PW41): Cosmic Cypher's bottom drawer, in Psi Watch. A
 * lane a body, coloured by its sign's element in the chart's frame, the time ruler over them in UTC (D-E), zoomed
 * from an hour to a century about the pointer, panned by a drag; a click puts the shared cursor there, the one the
 * globe and the panel read. Play runs the cursor forward at a chosen rate; Now returns to the live moment. The pointer
 * over a lane reads its body's sign and degree there (PW66), and a key under the lanes names their colours and marks.
 * Over the sky's lanes, the psi lanes (PW42, PW52): Busy, the notes' windows as their curves, and Psi Alerts; and the
 * field's Kp, measured behind and forecast ahead; and the graphs (PW45, PW68): Cosmic Cypher's Resonance Score, the
 * Earth-wide tide, and the elements' and modalities' shares; and the events of one of Mecha Jono's sets, counted through
 * time (PW46), with the Echoes of a window's sky event (PW47, PW69). A Shift-drag brushes a span (PW50): what falls in it stays lit here,
 * on the globe and in the panel, the rest dimmed; Shift-click or Escape clears it. N and P jump the cursor to the next
 * or previous moment that stands out, M pins a mark on the ruler, kept for the next visit (PW63).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClockNow, useTemporalStateOptional } from '../../../context/TemporalContext';
import { counted, fill, listed, numbered, useMessages } from '../../../i18n/app/i18n';
import { utcTimeTicks, formatUtcDate, formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { DEFAULT_FRAME, signOf, ZODIAC_FRAMES, type ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { columnMs, LANE_BODIES, NEVER_RETROGRADE, type LaneBody, type Observer, type SkyColumns } from '../../../services/psiWatch/timestream/skyColumns';
import { ELEMENTS, leanOf, MODALITIES } from '../../../services/psiWatch/timestream/graphColumns';
import { EVENT_SETS, type EventBar, type EventBucket, type EventSetId } from '../../../services/psiWatch/timestream/eventSets';
import { echoable } from '../../../services/psiWatch/timestream/echoReturns';
import { setEcho, updateEcho, useEcho } from '../../../services/psiWatch/timestream/echoes';
import { setEventSetChoice, useEventSetChoice } from '../../../services/psiWatch/timestream/eventSetChoice';
import { alignCounts, setAligned, useAligned } from '../../../services/psiWatch/timestream/alignment';
import { readSkyEvent, type PsiSkyEvent } from '../../../services/psiWatch/psiEvents';
import { aspectEvents, stackEvents } from '../../../services/psiWatch/timestream/aspectEvents';
import { ASTRO_BODIES } from '../../../services/psiWatch/astro/sky';
import { psiLaneItems, type PsiLaneItem } from '../../../services/psiWatch/timestream/psiLanes';
import { busyColumns, busyPartsAt, keepsPair, keepsWindow, skyLod } from '../../../services/psiWatch/timestream/busy';
import { windowWeightAt } from '../../../services/psiWatch/windowProfile';
import { anglesPlain, moonForm, type MoonMark } from '../../../services/psiWatch/timestream/moonMarks';
import { LANE_ANGLES } from '../../../services/psiWatch/timestream/skyColumns';
import { usePsiKit } from '../usePsiKit';
import { setBrush, useBrush } from '../../../services/psiWatch/timestream/brush';
import { useMissionWindowMark } from '../../../features/psi/missionWindowMark';
import { choosePsiMission } from '../../../features/psi/psiListsPanel';
import { jumpFrom, jumpTargets } from '../../../services/psiWatch/timestream/jumps';
import { busiestColumn } from '../../../services/psiWatch/timestream/busy';
import { globeCameraTelemetry } from '../../../services/globe/GlobeCameraTelemetry';
import { setObserverState, zoneAt } from '../../../services/psiWatch/timestream/observer';
import { callState, removeCall, updateCall, useCalls, windowMs, type CallText } from '../../../services/psiWatch/calls';
import { useTeamCalls } from '../../../services/psiWatch/teamCalls';
import { setSplit, useSplit } from '../../../services/psiWatch/timestream/split';
import { stormsIn, useQuakeLinks } from '../../../services/psiWatch/callLinks';
import { kpName } from '../../../services/psiWatch/timestream/kp';
import { reviewCallReveal } from '../../../services/publishing/psiCalls';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import {
  DEFAULT_SPAN_MS, follow, fractionAt, msAt, panBy, viewAround, ZOOM_PRESETS, ZOOM_STEP, zoomAbout, type TimeView,
} from '../../../services/psiWatch/timestream/timeView';
import { createSkyComputer, type SkyComputer } from './skyComputer';
import { createLaneRenderer, ELEMENT_PALETTES, type ElementPalette, type LaneBand, type LaneRenderer } from './laneRenderer';
import AspectLane, { ASPECT_ROW_CAP, aspectLaneHeight } from './AspectLane';
import SpanLane, { spanLaneHeight, type PlacedSpan } from './SpanLane';
import BusyLane, { BUSY_LANE_PX } from './BusyLane';
import KpLane, { KP_LANE_PX } from './KpLane';
import GraphLane, { GRAPH_LANE_PX } from './GraphLane';
import MixLane, { MIX_LANE_PX } from './MixLane';
import EventsLane, { EVENTS_LANE_PX, eventColour } from './EventsLane';
import { useEventSet } from './useEventSet';
import EchoesCard from './EchoesCard';
import CallCard from './CallCard';
import AlignLane, { ALIGN_LANE_PX } from './AlignLane';
import { createEchoComputer, type EchoComputer } from './echoComputer';
import MoonMarksRow, { markColour } from './MoonMarksRow';
import { useKpRecord } from './useKpRecord';
import LaneManager, { GRAPH_LANES, readLanes, readPsiLanes, saveLanes, savePsiLanes, type PsiLane } from './LaneManager';
import styles from './TimestreamDrawer.module.css';

/** The lanes on when the drawer first opens: the ten and the north node, as Cosmic Cypher's are, and the Ascendant and Midheaven over the globe's centre (PW43). */
export const DEFAULT_LANES: readonly LaneBody[] = LANE_BODIES.filter((b) => !['SouthNode', 'Lilith', 'Perigee', 'DSC', 'IC'].includes(b));

/** The globe's centre to half a degree: a drag moves the angles' lanes, not every frame of it. */
const roundedObserver = (lat: number, lon: number): Observer => ({ lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2 });

/** A place as the drawer names it: 12.5°N 3.0°E. */
export const placeName = ({ lat, lon }: Observer): string =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
export const LANE_HEIGHT_PX = 16;
/** The drawer's height when first opened: 30% of the window, between these (PW65). */
export const DEFAULT_DRAWER_SHARE = 0.3;
export const DEFAULT_DRAWER_HEIGHT_PX = 340;
export const MIN_DRAWER_HEIGHT_PX = 160;
/** Narrower than this, the drawer opens collapsed to its toolbar, a bottom sheet a tap opens. */
export const NARROW_PX = 600;
/** A recompute after the view has held still this long; meanwhile the old sky is drawn shifted into it. */
const SETTLE_MS = 150;
/** The cursor moved while playing no more often than this, so the globe is not rebuilt every frame. */
const PLAY_TICK_MS = 100;
/** The Resonance Score's lines: 50, and Cosmic Cypher's 40 and 60, where its words change; the tide's mean. */
const RESONANCE_MARKS = [50, 40, 60];
const TIDE_MARKS = [1];
/** The modalities, cardinal to mutable, in the frame's greys: the sky's colours already carry the elements. */
const MODALITY_COLOURS = [GUNMETAL[200], GUNMETAL[400], GUNMETAL[600]];
const HEIGHT_KEY = 'starcom:psi-timestream-height';
/** Echoes look back from here: the oldest the history holds (GFZ's storms, 1932). */
const ECHOES_FROM_MS = Date.UTC(1932, 0, 1);
const COLLAPSED_KEY = 'starcom:psi-timestream-collapsed';
const PALETTE_KEY = 'starcom:psi-timestream-palette';
/** Rows the notes' windows and alerts may take; the rest counted. */
export const WINDOW_ROW_CAP = 4;
export const ALERT_ROW_CAP = 2;
export const CALL_ROW_CAP = 2;
/** A notice about a call stays this long. */
const CALL_NOTICE_MS = 8000;
/** A closed call's linked events listed on its card, at most; the rest counted. */
const CALL_LINKS_SHOWN = 5;
const MOON_ASPECTS_KEY = 'starcom:psi-timestream-moon-aspects';
const MARKS_KEY = 'starcom:psi-timestream-marks';
/** The marks kept, the oldest let go past this many. */
export const MARK_CAP = 50;
const readMarks = (): number[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(MARKS_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).slice(-MARK_CAP) : [];
  } catch { return []; }
};

const HOUR = 3_600_000;
export const PLAY_RATES = { hour: HOUR, day: 24 * HOUR, week: 7 * 24 * HOUR, month: 30.44 * 24 * HOUR, year: 365.25 * 24 * HOUR } as const;
/** Play by event (PW63): a second at each moment N would jump to, then on to the next. */
export type PlayRate = keyof typeof PLAY_RATES | 'event';
const PLAY_RATE_CHOICES: readonly PlayRate[] = [...(Object.keys(PLAY_RATES) as (keyof typeof PLAY_RATES)[]), 'event'];
const PLAY_EVENT_MS = 1000;

const channelsOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const hexOf = (channels: readonly number[]): string => `#${channels.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
const GROUND = channelsOf(GUNMETAL[950]);

/** A degree within its sign as the readout writes it: 14°05′. */
export const degreeName = (degree: number): string => {
  const minutes = Math.floor(degree * 60 + 1e-9);
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, '0')}′`;
};

/** What the drawn sky says of a lane at a moment: its longitude, and whether it moves backward; null where it says nothing. */
export function laneAt(drawn: { sky: SkyColumns; view: TimeView }, body: LaneBody, ms: number): { lon: number; retrograde: boolean } | null {
  const { sky } = drawn;
  const b = sky.bodies.indexOf(body);
  const f = fractionAt(drawn.view, ms);
  if (b < 0 || f < 0 || f > 1) return null;
  const col = Math.min(sky.columns - 1, Math.floor(f * sky.columns));
  const lon = sky.longitudes[col * sky.bodies.length + b];
  return Number.isFinite(lon) ? { lon, retrograde: sky.retrograde[col * sky.bodies.length + b] === 1 } : null;
}

/** The height this browser chose last, or a share of the window. */
export const defaultHeight = (windowHeight: number): number =>
  Math.round(Math.min(DEFAULT_DRAWER_HEIGHT_PX, Math.max(MIN_DRAWER_HEIGHT_PX, windowHeight * DEFAULT_DRAWER_SHARE)));
const readHeight = (): number => {
  const fallback = defaultHeight(typeof window === 'undefined' ? 900 : window.innerHeight);
  try {
    const saved = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(saved) && saved >= MIN_DRAWER_HEIGHT_PX ? saved : fallback;
  } catch {
    return fallback;
  }
};
const readCollapsed = (): boolean => {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
  } catch { /* storage unavailable */ }
  return typeof window !== 'undefined' && window.innerWidth < NARROW_PX;
};

export interface TimestreamDrawerProps {
  frame?: ZodiacFrame;
  /** Tells the layout how tall the drawer stands, so nothing docks under it. */
  onHeight?: (px: number) => void;
}

const TimestreamDrawer: React.FC<TimestreamDrawerProps> = ({ frame: initialFrame = DEFAULT_FRAME, onHeight }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const bodyName = (body: LaneBody) => (m.psiWatch.lines.bodies as Record<string, string>)[body]
    ?? (w.lanes as Record<string, string>)[body] ?? (w.angles as Record<string, string>)[body] ?? body;
  const temporal = useTemporalStateOptional();
  const nowMs = useClockNow();
  const cursorMs = temporal && !temporal.isLive ? temporal.currentTime : nowMs;

  const [view, setView] = useState<TimeView>(() => viewAround(cursorMs, DEFAULT_SPAN_MS));
  const [height, setHeight] = useState<number>(readHeight);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const sectionRef = useRef<HTMLElement>(null);
  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
    return !c;
  });
  const [lanes, setLanes] = useState<readonly LaneBody[]>(() => readLanes(DEFAULT_LANES));
  const [frame, setFrame] = useState<ZodiacFrame>(initialFrame);
  const chooseLanes = (next: LaneBody[]) => { setLanes(next); saveLanes(next); };
  const [psiLanes, setPsiLanes] = useState<readonly PsiLane[]>(readPsiLanes);
  const choosePsiLanes = (next: PsiLane[]) => { setPsiLanes(next); savePsiLanes(next); };
  const { fixtures } = usePsiKit(true);
  const items = useMemo<PsiLaneItem[]>(() => psiLaneItems(fixtures), [fixtures]);
  // The operative's own calls (PW72), kept on this device, and teammates' once revealed (PW76).
  const calls = useCalls();
  const teamCalls = useTeamCalls(true);
  const split = useSplit();
  // A closed storm call links the storms in its window from Kp (PW74), so Kp is read for it too.
  const stormCallClosed = [...calls.map((c) => c.text), ...teamCalls.map((c) => c.text)]
    .some((t) => t.expects.kind === 'storm' && windowMs(t).untilMs < nowMs);
  const kp = useKpRecord((psiLanes.includes('kp') || stormCallClosed) && !collapsed);
  const eventSetId = useEventSetChoice();
  const echo = useEcho();
  const eventSet = useEventSet(eventSetId, (psiLanes.includes('events') || echo !== null) && !collapsed);
  // The windows whose sky event Echoes can find again: the sky events' own, and a focus window on one (PW69).
  const echoedEvent = useMemo(() => {
    const byAddress = new Map<string, PsiSkyEvent>();
    for (const f of fixtures) {
      if (f.family !== 'psi_sky_event') continue;
      const sky = readSkyEvent(f.event);
      if (sky && echoable(sky)) byAddress.set(sky.address, sky);
    }
    const out = new Map<string, PsiSkyEvent>();
    for (const item of items) {
      const sky = item.lane === 'windows' ? byAddress.get(item.onSkyEvent ?? item.address) : undefined;
      if (sky) out.set(item.address, sky);
    }
    return out;
  }, [fixtures, items]);
  const echoComputerRef = useRef<EchoComputer | null>(null);
  useEffect(() => {
    echoComputerRef.current = createEchoComputer();
    return () => { echoComputerRef.current?.dispose(); echoComputerRef.current = null; setAligned(false); setEcho(null); };
  }, []);
  const startEcho = (address: string) => {
    const item = items.find((i) => i.address === address);
    const sky = echoedEvent.get(address);
    if (!item || !sky) return;
    const peak = item.peakMs ?? sky.exact * 1000;
    setAligned(false);
    setEcho({ address, title: item.title, event: sky, beforeMs: Math.max(0, peak - item.fromMs), afterMs: Math.max(0, item.untilMs - peak), returns: null, isolated: null });
  };
  // The returns, found again when the frame changes: a lunation's or a station's sign is the drawer's frame's.
  useEffect(() => {
    if (!echo) return;
    const { address, event } = echo;
    updateEcho(address, { returns: null });
    void echoComputerRef.current?.compute({ event, fromMs: ECHOES_FROM_MS, untilMs: Date.now(), frame }).then((returns) => {
      if (returns) updateEcho(address, { returns });
    });
    // A new Echo or a new frame, not each change of the Echo shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echo?.address, frame]);
  const [fillMode, setFillMode] = useState<'gradient' | 'solid'>('gradient');
  const [palette, setPalette] = useState<ElementPalette>(() => {
    try { return localStorage.getItem(PALETTE_KEY) === 'safe' ? 'safe' : 'classic'; } catch { return 'classic'; }
  });
  const choosePalette = (next: ElementPalette) => {
    setPalette(next);
    try { localStorage.setItem(PALETTE_KEY, next); } catch { /* storage unavailable */ }
  };
  const [withMoon, setWithMoon] = useState<boolean>(() => {
    try { return localStorage.getItem(MOON_ASPECTS_KEY) !== '0'; } catch { return true; }
  });
  const toggleMoon = () => setWithMoon((was) => {
    try { localStorage.setItem(MOON_ASPECTS_KEY, was ? '0' : '1'); } catch { /* storage unavailable */ }
    return !was;
  });
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlayRate>('day');
  const nextEventRef = useRef<(from: number) => number | null>(() => null);
  const [width, setWidth] = useState(0);
  const [drawable, setDrawable] = useState(true);
  const [observer, setObserver] = useState<Observer | undefined>(() => {
    const at = globeCameraTelemetry.getCurrent();
    return at ? roundedObserver(at.lat, at.lng) : undefined;
  });
  const [pinned, setPinned] = useState(false);
  const [shapes, setShapes] = useState<AreaShapes | null>(null);
  const [drawnSky, setDrawnSky] = useState<{ sky: SkyColumns; view: TimeView; frame: ZodiacFrame } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; ms: number; body: LaneBody } | null>(null);
  const brush = useBrush();
  // An open psi mission's window (PW92): shaded across the lanes, its peak marked.
  const missionMark = useMissionWindowMark();
  const [marks, setMarks] = useState<number[]>(readMarks);
  const [openMark, setOpenMark] = useState<number | null>(null);
  const keepMarks = (next: number[]) => {
    const kept = [...new Set(next)].sort((a, b) => a - b).slice(-MARK_CAP);
    setMarks(kept);
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(kept)); } catch { /* storage unavailable */ }
  };
  // A span brushed here is the drawer's own: it goes when the drawer does.
  useEffect(() => () => setBrush(null), []);

  const lanesRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LaneRenderer | null>(null);
  const computerRef = useRef<SkyComputer | null>(null);
  const skyViewRef = useRef<TimeView | null>(null);

  // The layout is told the drawer's height as drawn, collapsed or open, so the globe and the work area stop at its edge.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    onHeight?.(collapsed ? el.offsetHeight : height);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => onHeight?.(el.offsetHeight || (collapsed ? 0 : height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [height, collapsed, onHeight]);

  // The angles are cast for the globe's centre as it turns, unless a place is pinned (PW43).
  useEffect(() => {
    if (pinned) return undefined;
    return globeCameraTelemetry.subscribe(({ lat, lng }) => {
      const next = roundedObserver(lat, lng);
      setObserver((was) => (was && was.lat === next.lat && was.lon === next.lon ? was : next));
    });
  }, [pinned]);
  useEffect(() => () => onHeight?.(0), [onHeight]);

  // The globe marks the observer (PW65); the drawer names it by its Zone, from the shapes the Psi layers read too.
  useEffect(() => { setObserverState(observer ?? null, pinned); }, [observer, pinned]);
  useEffect(() => () => setObserverState(null, false), []);
  useEffect(() => {
    if (!observer || shapes) return undefined;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setShapes(loaded); });
    return () => { live = false; };
  }, [observer, shapes]);
  const observerZone = useMemo(() => (observer && shapes ? zoneAt(shapes, observer) : null), [observer, shapes]);
  const zone = observerZone?.name ?? null;

  // The lanes' width, as the canvas draws it.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    rendererRef.current = createLaneRenderer(canvas);
    setDrawable(rendererRef.current !== null);
    computerRef.current = createSkyComputer();
    return () => {
      rendererRef.current?.dispose();
      computerRef.current?.dispose();
      rendererRef.current = null;
      computerRef.current = null;
    };
  }, []);

  // The sky is computed for every lane on and the ten bodies, so Busy and the aspects never hang on which lanes show.
  const skyBodies = useMemo<LaneBody[]>(() => [...lanes, ...ASTRO_BODIES.filter((b) => !lanes.includes(b))], [lanes]);
  // Past a few months the Moon's lane becomes its marks, and past two the angles are drawn plain (PW51).
  const moon = moonForm(view.spanMs);
  const plainAngles = anglesPlain(view.spanMs);
  const drawnAsColour = useCallback((body: LaneBody) => !(body === 'Moon' && moon !== 'lane')
    && !(plainAngles && (LANE_ANGLES as readonly string[]).includes(body)), [moon, plainAngles]);
  const bands = useMemo<LaneBand[]>(() => lanes.flatMap((body, i) => (drawnAsColour(body) ? [{
    row: i, top: i * LANE_HEIGHT_PX, height: LANE_HEIGHT_PX - 1, showRetrograde: !NEVER_RETROGRADE.has(body),
  }] : [])), [lanes, drawnAsColour]);
  const lanesHeight = lanes.length * LANE_HEIGHT_PX;
  const wantGraphs = psiLanes.some((l) => GRAPH_LANES.includes(l));

  const draw = useCallback(() => {
    rendererRef.current?.draw(view, bands, { fillMode, elements: ELEMENT_PALETTES[palette], ground: GROUND });
  }, [view, bands, fillMode, palette]);

  // The canvas at the device's pixels; the old sky drawn into a new view at once, the new one once the view holds still.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return undefined;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(lanesHeight * ratio);
    draw();
    let live = true;
    const timer = setTimeout(() => {
      void computerRef.current?.compute({
        view, columns: Math.min(2048, width), bodies: skyBodies, frame, observer, moon: lanes.includes('Moon') && moon !== 'lane', graphs: wantGraphs,
      }).then((sky) => {
        if (!live || !sky) return;
        rendererRef.current?.upload(sky, view);
        skyViewRef.current = view;
        setDrawnSky({ sky, view, frame });
        draw();
      });
    }, skyViewRef.current ? SETTLE_MS : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [view, width, skyBodies, frame, observer, lanesHeight, draw, lanes, moon, wantGraphs]);
  const lod = skyLod(view.spanMs);
  const aspects = useMemo(() => (drawnSky ? aspectEvents(drawnSky.sky, drawnSky.view) : []), [drawnSky]);
  // The Moon's aspects come and go in hours and can crowd the rest out of the lane: a chip takes them away (PW65).
  // The lane shows the pairs whose lanes are on, and past a year only the slow (PW51).
  const stacked = useMemo(() => {
    const kept = aspects.filter((e) => lanes.includes(e.a) && lanes.includes(e.b) && keepsPair(lod, e.a, e.b));
    const shown = withMoon ? kept : kept.filter((e) => e.a !== 'Moon' && e.b !== 'Moon');
    const { placed, hidden } = stackEvents(shown, ASPECT_ROW_CAP);
    return { placed, hidden, rows: placed.reduce((most, p) => Math.max(most, p.row + 1), 1) };
  }, [aspects, withMoon, lanes, lod]);

  // Busy over the drawn sky: its aspects and the notes' other windows, each counting 1 at its peak (PW52, PW67).
  const busy = useMemo(() => (drawnSky ? busyColumns(drawnSky.sky, drawnSky.view, items, skyLod(drawnSky.view.spanMs)) : null), [drawnSky, items]);
  const busyPartsOf = useCallback((col: number) => (drawnSky ? busyPartsAt(drawnSky.sky, drawnSky.view, items, col, skyLod(drawnSky.view.spanMs)) : []), [drawnSky, items]);
  const spanRows = useCallback((lane: 'windows' | 'alerts', cap: number) => {
    const shown = items.filter((item) => item.lane === lane && item.untilMs >= view.startMs && item.fromMs <= view.startMs + view.spanMs
      && (lane === 'alerts' || keepsWindow(lod, item)));
    const { placed, hidden } = stackEvents(shown, cap);
    const span = (item: PsiLaneItem) => fill(lane === 'windows' ? w.windowSpan : w.alertSpan, {
      from: formatUtcDateTime(item.fromMs, { year: true }), until: formatUtcDateTime(item.untilMs, { year: true }),
    });
    const spans: PlacedSpan[] = placed.map(({ event: item, row }) => ({
      row,
      item: {
        key: item.address, fromMs: item.fromMs, untilMs: item.untilMs, label: item.title,
        ...(item.peakMs !== undefined ? { peakMs: item.peakMs } : {}),
        ...(item.window ? { weightAt: (ms: number) => windowWeightAt(item.window!, ms / 1000) } : {}),
        colour: lane === 'windows' ? DATA_SCALES.psiWatch : DATA_SCALES.psiGround,
        title: item.peakMs !== undefined ? fill(w.windowTitle, { title: item.title, time: formatUtcDateTime(item.peakMs, { year: true }) }) : item.title,
        detail: span(item),
      },
    }));
    return { placed: spans, hidden, rows: placed.reduce((most, p) => Math.max(most, p.row + 1), 1) };
    // The words follow the language, which the messages carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, view, lod, m]);
  const windowRows = useMemo(() => spanRows('windows', WINDOW_ROW_CAP), [spanRows]);
  // The calls over their windows; once a window has closed, what fell in it (PW40, PW74).
  const linkable = useMemo(() => [
    ...calls.filter((c) => c.seal).map((c) => ({ key: c.id, text: c.text })),
    ...teamCalls.map((c) => ({ key: `team:${c.key}`, text: c.text })),
  ], [calls, teamCalls]);
  const quakeLinks = useQuakeLinks(linkable, nowMs, psiLanes.includes('calls') && !collapsed);
  const callRows = useMemo(() => {
    const linesOf = (key: string, text: CallText): string[] | undefined => {
      const { fromMs, untilMs } = windowMs(text);
      if (untilMs >= nowMs) return undefined;
      const listed = (all: string[]) => (all.length ? [...all.slice(0, CALL_LINKS_SHOWN), ...(all.length > CALL_LINKS_SHOWN ? [fill(w.callLinksMore, { n: all.length - CALL_LINKS_SHOWN })] : [])] : [w.callLinksNone]);
      if (text.expects.kind === 'quakes') {
        const links = quakeLinks.get(key);
        if (!links || links.state === 'loading') return [w.callLinksLoading];
        if (links.state === 'failed') return [w.callLinksFailed];
        return listed(links.quakes.map((q) => fill(w.callQuake, { mag: q.mag.toFixed(1), time: formatUtcDateTime(q.ms, { year: true }), place: q.place })));
      }
      if (text.expects.kind === 'storm') {
        if (!kp) return [w.callLinksLoading];
        return listed(stormsIn(kp, fromMs, untilMs).map((st) => fill(w.callStorm, {
          kp: kpName(st.kp), from: formatUtcDateTime(st.fromMs, { year: true }), until: formatUtcDateTime(st.untilMs, { year: true }),
        })));
      }
      return undefined;
    };
    const stateWords = (c: (typeof calls)[number]) => {
      const state = callState(c, nowMs);
      const time = state === 'sealed' && c.seal ? formatUtcDateTime(c.seal.at, { year: true })
        : state === 'revealed' && c.reveal ? formatUtcDateTime(c.reveal.at, { year: true }) : '';
      return fill(w.callStates[state], { time });
    };
    // A teammate's call has no actions: its key is not one of this device's calls.
    const all = [
      ...calls.map((c) => ({ key: c.id, text: c.text, detail: () => stateWords(c), lines: () => (c.seal ? linesOf(c.id, c.text) : undefined) })),
      ...teamCalls.map((c) => ({
        key: `team:${c.key}`, text: c.text, detail: () => fill(w.callFrom, { team: c.team, time: formatUtcDateTime(c.revealedAt, { year: true }) }),
        lines: () => linesOf(`team:${c.key}`, c.text),
      })),
    ];
    const shown = all.map((c) => ({ call: c, ...windowMs(c.text) }))
      .filter((c) => c.untilMs >= view.startMs && c.fromMs <= view.startMs + view.spanMs);
    const { placed, hidden } = stackEvents(shown, CALL_ROW_CAP);
    const spans: PlacedSpan[] = placed.map(({ event, row }) => ({
      row,
      item: {
        key: event.call.key, fromMs: event.fromMs, untilMs: event.untilMs, colour: DATA_SCALES.psiGround,
        label: w.callKinds[event.call.text.expects.kind],
        title: fill(w.callTitle, { kind: w.callKinds[event.call.text.expects.kind], zone: event.call.text.place.name }),
        detail: event.call.detail(),
        lines: event.call.lines(),
      },
    }));
    return { placed: spans, hidden, rows: placed.reduce((most, p) => Math.max(most, p.row + 1), 1) };
    // The words follow the language, which the messages carry; the state, the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, teamCalls, quakeLinks, kp, view, m, Math.floor(nowMs / 60_000)]);
  const [composing, setComposing] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!callNotice) return undefined;
    const timer = setTimeout(() => setCallNotice(null), CALL_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [callNotice]);
  const callActions = useMemo(() => {
    const stateOf = (id: string) => { const c = calls.find((x) => x.id === id); return c ? callState(c, nowMs) : null; };
    return [
      {
        label: w.callReveal, offers: (id: string) => stateOf(id) === 'closed',
        run: (id: string) => {
          void reviewCallReveal(id).then((o) => setCallNotice(o.status === 'sent' ? w.callRevealed : o.status === 'refused' ? o.reason : null));
        },
      },
      { label: w.callKeep, offers: (id: string) => stateOf(id) === 'closed', run: (id: string) => updateCall(id, { keptPrivate: Date.now() }) },
      { label: w.callRemove, offers: (id: string) => stateOf(id) === 'unsealed' || stateOf(id) === 'private', run: removeCall },
    ];
  }, [calls, nowMs, w]);
  // A window's card: its Echoes, and a call on it while it has not opened (PW69, PW72).
  const windowActions = [
    { label: w.echoesButton, offers: (key: string) => echoedEvent.has(key), run: startEcho },
    { label: w.callAction, offers: (key: string) => (items.find((i) => i.address === key)?.fromMs ?? 0) > nowMs, run: (key: string) => setComposing(key) },
  ];
  const alertRows = useMemo(() => spanRows('alerts', ALERT_ROW_CAP), [spanRows]);

  // The view keeps the cursor in sight as it moves, live or playing.
  useEffect(() => { setView((v) => follow(v, cursorMs)); }, [cursorMs]);

  // Play: the cursor forward at the chosen rate, a tick at a time; by event, a second at each next moment, until none.
  useEffect(() => {
    if (!playing || !temporal) return undefined;
    if (rate === 'event') {
      let from = cursorMs;
      const timer = setInterval(() => {
        const to = nextEventRef.current(from);
        if (to === null) { setPlaying(false); return; }
        from = to;
        temporal.setCurrentTime(to);
      }, PLAY_EVENT_MS);
      return () => clearInterval(timer);
    }
    let at = cursorMs;
    let last = performance.now();
    const timer = setInterval(() => {
      const t = performance.now();
      at += ((t - last) / 1000) * PLAY_RATES[rate as keyof typeof PLAY_RATES];
      last = t;
      temporal.setCurrentTime(at);
    }, PLAY_TICK_MS);
    return () => clearInterval(timer);
    // The cursor is where play starts from; it is not re-read while playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, temporal]);

  const seek = useCallback((ms: number) => {
    if (!temporal) return;
    temporal.setCurrentTime(Math.round(ms));
  }, [temporal]);

  // N and P: the next or previous moment that stands out (PW63); M: a mark at the cursor, to the minute.
  const busiestMs = useMemo(() => {
    if (!busy || !drawnSky) return null;
    const col = busiestColumn(busy);
    return col >= 0 ? drawnSky.view.startMs + ((col + 0.5) / busy.length) * drawnSky.view.spanMs : null;
  }, [busy, drawnSky]);
  const jump = (dir: 1 | -1) => {
    const to = jumpFrom(cursorMs, dir, jumpTargets({ items, drawn: drawnSky, busiestMs, marks }));
    if (to !== null) seek(to);
  };
  // Play by event reads the moments as they stand at each step, the drawn sky following the cursor.
  nextEventRef.current = (from: number) => jumpFrom(from, 1, jumpTargets({ items, drawn: drawnSky, busiestMs, marks }));
  const markCursor = () => keepMarks([...marks, Math.round(cursorMs / 60_000) * 60_000]);

  // Wheel zooms about the pointer; on the lanes only, so the globe's own wheel is never taken.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const anchor = (event.clientX - box.left) / Math.max(1, box.width);
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        setView((v) => panBy(v, (event.deltaX || event.deltaY) / Math.max(1, box.width)));
      } else {
        setView((v) => zoomAbout(v, event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // A drag pans; a press that does not move puts the cursor there. With Shift, a drag brushes a span instead (PW50).
  const drag = useRef<{ x: number; view: TimeView; moved: boolean; brushFrom?: number } | null>(null);
  const msOfEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return msAt(view, (event.clientX - box.left) / Math.max(1, box.width));
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, view, moved: false, ...(event.shiftKey ? { brushFrom: msOfEvent(event) } : {}) };
  };
  const touched = (event: React.PointerEvent) => event.pointerType === 'touch' || event.pointerType === 'pen';
  const hoverAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const body = lanes[Math.floor(y / LANE_HEIGHT_PX)];
    setHover(body ? { x, y, ms: msAt(view, x / Math.max(1, box.width)), body } : null);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) { if (!touched(event)) hoverAt(event); return; }
    setHover(null);
    const dx = event.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.brushFrom !== undefined) setBrush({ fromMs: d.brushFrom, untilMs: msOfEvent(event) });
    else setView(panBy(d.view, -dx / Math.max(1, width)));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // Shift-click clears a span.
    if (d.brushFrom !== undefined) { setBrush(null); return; }
    const box = event.currentTarget.getBoundingClientRect();
    seek(msAt(view, (event.clientX - box.left) / Math.max(1, box.width)));
    // A tap has no hover: the readout stands where it landed until the next.
    if (touched(event)) hoverAt(event);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = view.spanMs / 50;
    if (event.key === 'ArrowRight') seek(cursorMs + step);
    else if (event.key === 'ArrowLeft') seek(cursorMs - step);
    else if (event.key === '+' || event.key === '=') setView((v) => zoomAbout(v, 1 / ZOOM_STEP, fractionAt(v, cursorMs)));
    else if (event.key === '-') setView((v) => zoomAbout(v, ZOOM_STEP, fractionAt(v, cursorMs)));
    else if (event.key === 'Escape' && brush) setBrush(null);
    else if (event.key === 'n' || event.key === 'N') jump(1);
    else if (event.key === 'p' || event.key === 'P') jump(-1);
    else if (event.key === 'm' || event.key === 'M') markCursor();
    else return;
    event.preventDefault();
  };

  // The drawer's top edge resizes it.
  const onResizeDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const startY = event.clientY;
    const startH = height;
    const move = (e: PointerEvent) => setHeight(Math.max(MIN_DRAWER_HEIGHT_PX, Math.min(window.innerHeight * 0.85, startH + startY - e.clientY)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setHeight((h) => { try { localStorage.setItem(HEIGHT_KEY, String(Math.round(h))); } catch { /* storage unavailable */ } return h; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ticks = useMemo(() => utcTimeTicks(view.startMs, view.startMs + view.spanMs, Math.max(2, Math.floor(width / 110))), [view, width]);
  const at = (ms: number) => `${(fractionAt(view, ms) * 100).toFixed(3)}%`;
  const inView = (ms: number) => fractionAt(view, ms) >= 0 && fractionAt(view, ms) <= 1;
  const preset = ZOOM_PRESETS.reduce((best, p) => (Math.abs(Math.log(p.spanMs / view.spanMs)) < Math.abs(Math.log(best.spanMs / view.spanMs)) ? p : best));
  const nearPreset = Math.abs(Math.log(preset.spanMs / view.spanMs)) < 0.05;
  const lunarMarks = moon !== 'lane' ? drawnSky?.sky.moonMarks ?? [] : [];
  const markName = (mark: MoonMark) => (mark.kind === 'new' || mark.kind === 'full' ? w.moonMarks[mark.kind]
    : fill(w.moonMarks[mark.kind], { kind: (w.eclipseKinds as Record<string, string>)[mark.sub ?? ''] ?? mark.sub ?? '' }));
  const nearMark = hover?.body === 'Moon' && moon !== 'lane' ? lunarMarks.reduce<MoonMark | null>((best, mark) => {
    const px = Math.abs(fractionAt(view, mark.ms) - hover.x / Math.max(1, width)) * width;
    return px <= 6 && (!best || px < Math.abs(fractionAt(view, best.ms) - hover.x / Math.max(1, width)) * width) ? mark : best;
  }, null) : null;
  const read = hover && drawnSky && !(hover.body === 'Moon' && moon !== 'lane') ? laneAt(drawnSky, hover.body, hover.ms) : null;
  // A mark is read at its own moment, not the pointer's.
  const readoutMs = nearMark?.ms ?? hover?.ms ?? 0;
  const readout = nearMark ? markName(nearMark) : hover && read ? (() => {
    const { sign, degree } = signOf(read.lon);
    const showRetrograde = read.retrograde && !NEVER_RETROGRADE.has(hover.body);
    return fill(showRetrograde ? w.readoutRetrograde : w.readout, {
      body: bodyName(hover.body), degree: degreeName(degree), sign: (w.signs as Record<string, string>)[sign] ?? sign,
    });
  })() : null;
  const colours = ELEMENT_PALETTES[palette];

  // The graph lanes' readouts (PW45, PW68): the column under the pointer, a wide view's as its mean and range.
  const graphs = drawnSky?.sky.graphs ?? null;
  const graphTime = (col: number) => (drawnSky && graphs ? formatUtcDateTime(columnMs(drawnSky.view, graphs.columns, col), { year: true }) : '');
  const frameLine = drawnSky ? fill(w.inFrame, { frame: (w.frames as Record<string, string>)[drawnSky.frame] ?? drawnSky.frame }) : '';
  const two = (v: number) => numbered(Math.round(v * 100) / 100);
  const resonanceReadout = (col: number): string[] => {
    if (!graphs) return [];
    const r = graphs.resonance;
    const score = Math.round(r.mean[col]);
    const lean = w.resonanceLeans[leanOf(score)];
    return [
      graphs.samples > 1
        ? fill(w.resonanceSpan, { min: numbered(Math.round(r.min[col])), max: numbered(Math.round(r.max[col])), score: numbered(score), lean })
        : fill(w.resonanceAt, { score: numbered(score), lean }),
      fill(w.resonanceParts, { harmony: two(graphs.harmony[col]), coherence: two(graphs.coherence[col]) }),
      ...(graphs.samples === 1 ? [fill(w.resonanceInOrb, { resonant: numbered(graphs.resonantCount[col]), dissonant: numbered(graphs.dissonantCount[col]) })] : []),
      frameLine, graphTime(col),
    ];
  };
  const tideReadout = (col: number): string[] => {
    if (!graphs) return [];
    const t = graphs.tide;
    return [graphs.samples > 1 ? fill(w.tideSpan, { min: two(t.min[col]), max: two(t.max[col]) }) : fill(w.tideAt, { ratio: two(t.mean[col]) }), graphTime(col)];
  };
  const shares = (values: Float32Array, parts: readonly string[], names: Record<string, string>, col: number) =>
    listed(parts.map((p, i) => fill(w.shareOf, { name: names[p], pct: numbered(Math.round(values[col * parts.length + i] * 100)) })));
  const elementsReadout = (col: number): string[] => (graphs ? [shares(graphs.elements, ELEMENTS, w.elements, col), frameLine, graphTime(col)] : []);
  const modalitiesReadout = (col: number): string[] => (graphs ? [shares(graphs.modalities, MODALITIES, w.modalityNames, col), frameLine, graphTime(col)] : []);
  const elementColours = ELEMENTS.map((e) => hexOf(colours[e]));
  // The alignment lane (PW55, PW71): the Echo's returns stacked on their exact moments, under the events lane.
  const aligned = useAligned();
  const alignment = useMemo(() => (aligned && echo?.returns && eventSet ? alignCounts(echo, eventSet) : null), [aligned, echo, eventSet]);
  const eventsReadout = (bar: EventBar, bucket: EventBucket): string[] => [
    counted(w.eventsCount[eventSetId], bar.count),
    w.eventsSource[eventSetId],
    bucket === 'year' ? String(new Date(bar.fromMs).getUTCFullYear())
      : bucket === 'week' ? fill(w.eventsWeek, { date: formatUtcDate(bar.fromMs, { year: true }) }) : formatUtcDate(bar.fromMs, { year: true }),
  ];

  return (
    <section ref={sectionRef} className={styles.drawer} style={collapsed ? undefined : { height }} aria-label={w.label} data-testid="psi-timestream">
      {collapsed ? null : <div className={styles.resize} role="separator" aria-orientation="horizontal" aria-label={w.resize} onPointerDown={onResizeDown} />}
      <header className={styles.toolbar}>
        <button type="button" className={styles.chip} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? w.showLanes : w.hideLanes}</button>
        <span className={`${styles.title} ${styles.wideOnly}`}>{w.label}</span>
        {collapsed ? null : <>
        <select className={styles.select} aria-label={w.frameLabel} value={frame} onChange={(e) => setFrame(e.target.value as ZodiacFrame)}>
          {ZODIAC_FRAMES.map((f) => <option key={f} value={f}>{(w.frames as Record<string, string>)[f]}</option>)}
        </select>
        <LaneManager lanes={lanes} nameOf={bodyName} onChange={chooseLanes} fillMode={fillMode} onFill={setFillMode} palette={palette} onPalette={choosePalette}
          psiLanes={psiLanes} onPsiLanes={choosePsiLanes} />
        <select className={styles.select} aria-label={w.zoom} value={nearPreset ? preset.id : ''}
          onChange={(e) => { const p = ZOOM_PRESETS.find((z) => z.id === e.target.value); if (p) setView(viewAround(cursorMs, p.spanMs)); }}>
          {nearPreset ? null : <option value="">{w.zoomCustom}</option>}
          {ZOOM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
        </select>
        </>}
        <div className={styles.group}>
          <button type="button" className={styles.chip} aria-label={w.jumpPrev} title={w.jumpPrev} disabled={!temporal} onClick={() => jump(-1)}>‹</button>
          <button type="button" className={styles.chip} aria-label={w.jumpNext} title={w.jumpNext} disabled={!temporal} onClick={() => jump(1)}>›</button>
          <button type="button" className={styles.chip} aria-pressed={playing} disabled={!temporal}
            onClick={() => { if (!playing) temporal?.setIsLive(false); setPlaying(!playing); }}>{playing ? w.pause : w.play}</button>
          {collapsed ? null : (
            <select className={`${styles.select} ${styles.wideOnly}`} aria-label={w.rate} value={rate} onChange={(e) => setRate(e.target.value as PlayRate)}>
              {PLAY_RATE_CHOICES.map((r) => <option key={r} value={r}>{(w.rates as Record<string, string>)[r]}</option>)}
            </select>
          )}
          <button type="button" className={`${styles.chip} ${temporal?.isLive ? styles.live : ''}`} disabled={!temporal} aria-pressed={temporal?.isLive ?? false}
            onClick={() => { setPlaying(false); temporal?.setIsLive(true); setView((v) => viewAround(Date.now(), v.spanMs)); }}>{temporal?.isLive ? w.live : w.now}</button>
          {/* Side by side (PW73): the Psi layers at now and at the cursor, the globe split down the middle. */}
          <button type="button" className={`${styles.chip} ${styles.wideOnly}`} aria-pressed={split} data-testid="psi-timestream-split"
            onClick={() => setSplit(!split)}>{w.sideBySide}</button>
        </div>
        {collapsed ? null : <>
        <span className={`${styles.frame} ${styles.wideOnly}`} data-testid="psi-timestream-observer">{observer ? (zone ? fill(w.skyOverZone, { zone, place: placeName(observer) }) : fill(w.skyOver, { place: placeName(observer) })) : null}</span>
        <button type="button" className={styles.chip} aria-pressed={pinned} disabled={!observer} onClick={() => setPinned(!pinned)}>
          {pinned ? w.unpin : w.pin}
        </button>
        </>}
        {collapsed ? null : (
          <button type="button" className={styles.chip} title={w.markTitle} disabled={!temporal} onClick={markCursor} data-testid="psi-timestream-mark">{w.mark}</button>
        )}
        {brush && !collapsed ? (
          <button type="button" className={styles.chip} data-testid="psi-timestream-brush-clear" onClick={() => setBrush(null)}
            title={fill(w.brushed, { from: formatUtcDateTime(brush.fromMs, { year: true }), until: formatUtcDateTime(brush.untilMs, { year: true }) })}>
            {w.brushClear}
          </button>
        ) : null}
        {missionMark && !collapsed ? (
          <button type="button" className={styles.chip} data-testid="psi-timestream-mission-clear" onClick={() => choosePsiMission(null)}
            title={fill(m.psiWatch.missions.band, {
              title: missionMark.title, from: formatUtcDateTime(missionMark.fromMs, { year: true }),
              until: formatUtcDateTime(missionMark.untilMs, { year: true }), peak: formatUtcDateTime(missionMark.peakMs, { year: true }),
            })}>
            {m.psiWatch.missions.clearBand}
          </button>
        ) : null}
        <span className={styles.cursorTime} data-testid="psi-timestream-cursor">{formatUtcDateTime(cursorMs, { year: true })}</span>
      </header>
      <div className={styles.body} hidden={collapsed}>
        <div className={styles.gutter}>
          <div className={styles.rulerGap} aria-hidden="true" />
          {psiLanes.includes('busy') ? <div className={styles.laneName} style={{ height: BUSY_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.busy}</div> : null}
          {psiLanes.includes('windows') ? <div className={styles.laneName} style={{ height: spanLaneHeight(windowRows.rows) + 1 }} aria-hidden="true">{w.psiLaneNames.windows}</div> : null}
          {psiLanes.includes('alerts') ? <div className={styles.laneName} style={{ height: spanLaneHeight(alertRows.rows) + 1 }} aria-hidden="true">{w.psiLaneNames.alerts}</div> : null}
          {psiLanes.includes('calls') ? <div className={styles.laneName} style={{ height: spanLaneHeight(callRows.rows) + 1 }} aria-hidden="true">{w.psiLaneNames.calls}</div> : null}
          {psiLanes.includes('kp') ? <div className={styles.laneName} style={{ height: KP_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.kp}</div> : null}
          {psiLanes.includes('events') ? (
            <div className={styles.laneName} style={{ height: EVENTS_LANE_PX + 1 }}>
              <select className={styles.laneSelect} aria-label={w.eventsShown} value={eventSetId} onChange={(e) => setEventSetChoice(e.target.value as EventSetId)}>
                {EVENT_SETS.map((id) => <option key={id} value={id}>{w.eventSets[id]}</option>)}
              </select>
            </div>
          ) : null}
          {alignment ? <div className={`${styles.laneName} ${styles.laneNameTall}`} style={{ height: ALIGN_LANE_PX + 1 }} aria-hidden="true">{w.alignLane}</div> : null}
          {psiLanes.includes('resonance') ? <div className={`${styles.laneName} ${styles.laneNameTall}`} style={{ height: GRAPH_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.resonance}</div> : null}
          {psiLanes.includes('tide') ? <div className={`${styles.laneName} ${styles.laneNameTall}`} style={{ height: GRAPH_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.tide}</div> : null}
          {psiLanes.includes('elements') ? <div className={styles.laneName} style={{ height: MIX_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.elements}</div> : null}
          {psiLanes.includes('modalities') ? <div className={styles.laneName} style={{ height: MIX_LANE_PX + 1 }} aria-hidden="true">{w.psiLaneNames.modalities}</div> : null}
          {lanes.map((body) => <div key={body} className={styles.laneName} style={{ height: LANE_HEIGHT_PX }} aria-hidden="true">{bodyName(body)}</div>)}
          <div className={`${styles.laneName} ${styles.aspectsName}`} style={{ height: aspectLaneHeight(stacked.rows) }}>
            <span aria-hidden="true">{w.aspectsLane}</span>
            <button type="button" className={styles.chip} aria-pressed={withMoon} aria-label={w.aspectsMoon} title={w.aspectsMoon} onClick={toggleMoon}>
              {bodyName('Moon')}
            </button>
          </div>
        </div>
        <div className={styles.track}>
          <div className={styles.stack}>
          <div className={styles.ruler}>
            {ticks.filter((t) => inView(t.at)).map((t) => <span key={t.at} className={styles.tick} style={{ left: at(t.at) }}>{t.label}</span>)}
            {marks.filter(inView).map((t) => (
              <button key={t} type="button" className={styles.flag} style={{ left: at(t) }} data-testid="psi-timestream-flag"
                aria-label={fill(w.markAt, { time: formatUtcDateTime(t, { year: true }) })} title={formatUtcDateTime(t, { year: true })}
                onClick={() => { seek(t); setOpenMark(openMark === t ? null : t); }} />
            ))}
          </div>
          {echo ? <EchoesCard echo={echo} set={eventSet} setId={eventSetId} onSeek={seek} /> : null}
          {composing ? (() => {
            const item = items.find((i) => i.address === composing);
            return item ? (
              <CallCard window={{ address: item.address, title: item.title, fromMs: item.fromMs, untilMs: item.untilMs }} zone={observerZone} now={nowMs}
                onDone={(notice) => { setComposing(null); setCallNotice(notice); }} />
            ) : null;
          })() : null}
          {callNotice ? <p className={styles.callNotice} role="status" data-testid="psi-timestream-call-notice">{callNotice}</p> : null}
          {openMark !== null && inView(openMark) ? (
            <div className={styles.markCard} role="dialog" aria-label={fill(w.markAt, { time: formatUtcDateTime(openMark, { year: true }) })}
              style={fractionAt(view, openMark) > 0.7 ? { right: `${(1 - fractionAt(view, openMark)) * 100}%` } : { left: at(openMark) }} data-testid="psi-timestream-mark-card">
              <span>{fill(w.markAt, { time: formatUtcDateTime(openMark, { year: true }) })}</span>
              <span className={styles.group}>
                <button type="button" className={styles.chip} onClick={() => { keepMarks(marks.filter((t) => t !== openMark)); setOpenMark(null); }}>{w.markRemove}</button>
                <button type="button" className={styles.chip} onClick={() => setOpenMark(null)}>{w.aspectClose}</button>
              </span>
            </div>
          ) : null}
          {psiLanes.includes('busy') ? (
            <BusyLane values={busy} drawnView={drawnSky?.view ?? null} view={view} width={width} partsAt={busyPartsOf} onSeek={seek} />
          ) : null}
          {psiLanes.includes('windows') ? (
            <SpanLane placed={windowRows.placed} hidden={windowRows.hidden} rows={windowRows.rows} view={view} width={width} onSeek={seek} opensBelow
              testId="psi-timestream-windows" cardTestId="psi-timestream-window-card" moreLabel={(n) => fill(w.aspectsMore, { n })}
              actions={windowActions} />
          ) : null}
          {psiLanes.includes('alerts') ? (
            <SpanLane placed={alertRows.placed} hidden={alertRows.hidden} rows={alertRows.rows} view={view} width={width} onSeek={seek} opensBelow
              testId="psi-timestream-alerts" cardTestId="psi-timestream-alert-card" moreLabel={(n) => fill(w.aspectsMore, { n })} />
          ) : null}
          {psiLanes.includes('calls') ? (
            <SpanLane placed={callRows.placed} hidden={callRows.hidden} rows={callRows.rows} view={view} width={width} onSeek={seek} opensBelow
              testId="psi-timestream-calls" cardTestId="psi-timestream-call-span" moreLabel={(n) => fill(w.aspectsMore, { n })} actions={callActions} />
          ) : null}
          {psiLanes.includes('kp') ? <KpLane record={kp} view={view} width={width} onSeek={seek} /> : null}
          {psiLanes.includes('events') ? (
            <EventsLane set={eventSet} view={view} width={width} readout={eventsReadout} onSeek={seek}
              ticks={echo?.returns ?? []} isolated={echo?.isolated ?? null}
              onTick={echo ? (ms) => { updateEcho(echo.address, { isolated: ms }); seek(ms); } : undefined}
              endLabel={eventSet ? fill(w.eventsRecordEnds, { date: formatUtcDate(eventSet.untilMs, { year: true }) }) : undefined}
              heldWords={(years) => fill(w.echoesWithheld, { years })} />
          ) : null}
          {alignment && echo ? (
            <AlignLane alignment={alignment} colour={eventColour(eventSetId)} beforeMs={echo.beforeMs} afterMs={echo.afterMs} width={width}
              label={fill(w.alignLabel, { n: alignment.returns, title: echo.title })}
              read={(day, count) => fill(w.alignDay, { day: day > 0 ? `+${day}` : `${day}`, count: numbered(count), usual: numbered(Math.round(alignment.usual * 10) / 10) })} />
          ) : null}
          {psiLanes.includes('resonance') ? (
            <GraphLane series={graphs?.resonance ?? null} samples={graphs?.samples ?? 1} drawnView={drawnSky?.view ?? null} view={view} width={width}
              floor={0} ceiling={100} leastSpan={12} marks={RESONANCE_MARKS} colour={DATA_SCALES.psiWatch} readout={resonanceReadout} onSeek={seek} testId="psi-timestream-resonance" />
          ) : null}
          {psiLanes.includes('tide') ? (
            <GraphLane series={graphs?.tide ?? null} samples={graphs?.samples ?? 1} drawnView={drawnSky?.view ?? null} view={view} width={width}
              floor={0.5} ceiling={1.5} leastSpan={0.2} marks={TIDE_MARKS} colour={DATA_SCALES.psiWatch} readout={tideReadout} onSeek={seek} testId="psi-timestream-tide" />
          ) : null}
          {psiLanes.includes('elements') ? (
            <MixLane shares={graphs?.elements ?? null} parts={4} colours={elementColours} drawnView={drawnSky?.view ?? null} view={view} width={width}
              readout={elementsReadout} onSeek={seek} testId="psi-timestream-elements" />
          ) : null}
          {psiLanes.includes('modalities') ? (
            <MixLane shares={graphs?.modalities ?? null} parts={3} colours={MODALITY_COLOURS} drawnView={drawnSky?.view ?? null} view={view} width={width}
              readout={modalitiesReadout} onSeek={seek} testId="psi-timestream-modalities" />
          ) : null}
          <div
            ref={lanesRef}
            className={styles.lanes}
            style={{ height: lanesHeight }}
            tabIndex={0}
            role="slider"
            aria-label={w.lanesLabel}
            aria-valuetext={formatUtcDateTime(cursorMs, { year: true })}
            aria-valuemin={view.startMs}
            aria-valuemax={view.startMs + view.spanMs}
            aria-valuenow={Math.round(cursorMs)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={(event) => { if (!touched(event)) setHover(null); }}
            onKeyDown={onKeyDown}
            data-testid="psi-timestream-lanes"
          >
            <canvas ref={canvasRef} className={styles.canvas} style={{ height: lanesHeight }} />
            {lanes.includes('Moon') && moon !== 'lane' ? (
              <MoonMarksRow marks={lunarMarks} view={view} width={width} top={lanes.indexOf('Moon') * LANE_HEIGHT_PX} height={LANE_HEIGHT_PX - 1} />
            ) : null}
            {!drawable ? <p className={styles.unavailable}>{w.noLanes}</p> : null}
            {inView(nowMs) ? <span className={styles.now} style={{ left: at(nowMs) }} aria-hidden="true" /> : null}
            {inView(cursorMs) ? (
              <span className={styles.cursor} style={{ left: at(cursorMs), background: DATA_SCALES.psiWatch }} aria-hidden="true" data-testid="psi-timestream-cursor-line" />
            ) : null}
            {hover && readout ? (
              <div className={styles.readout} data-testid="psi-timestream-readout" aria-hidden="true"
                style={hover.x > width - 200 ? { right: width - hover.x + 12, top: hover.y + 12 } : { left: hover.x + 12, top: hover.y + 12 }}>
                <span>{readout}</span>
                <span className={styles.readoutTime}>{formatUtcDateTime(readoutMs, { year: true })}</span>
              </div>
            ) : null}
          </div>
          <AspectLane placed={stacked.placed} hidden={stacked.hidden} rows={stacked.rows} view={view} width={width} onSeek={seek} />
          {missionMark ? (() => {
            // Clipped to the view; nothing when the window is wholly outside it.
            const f0 = Math.max(0, fractionAt(view, missionMark.fromMs));
            const f1 = Math.min(1, fractionAt(view, missionMark.untilMs));
            if (!(f1 > f0)) return null;
            return (
              <>
                <span className={styles.missionBand} data-testid="psi-timestream-mission-window" aria-hidden="true"
                  style={{ left: `${f0 * 100}%`, width: `${(f1 - f0) * 100}%`, background: DATA_SCALES.psiWatch, borderColor: DATA_SCALES.psiWatch }} />
                {inView(missionMark.peakMs) ? (
                  <span className={styles.missionPeak} style={{ left: at(missionMark.peakMs), background: DATA_SCALES.psiWatch }} aria-hidden="true" />
                ) : null}
              </>
            );
          })() : null}
          {brush ? (() => {
            // The shades stop at the view's edges; a span wholly outside the view leaves it all shaded.
            const f0 = Math.min(1, Math.max(0, fractionAt(view, brush.fromMs)));
            const f1 = Math.min(1, Math.max(0, fractionAt(view, brush.untilMs)));
            return (
              <>
                <span className={styles.brushShade} style={{ left: 0, width: `${f0 * 100}%` }} aria-hidden="true" />
                <span className={styles.brushShade} style={{ left: `${f1 * 100}%`, right: 0 }} aria-hidden="true" data-testid="psi-timestream-brush" />
                {inView(brush.fromMs) ? <span className={styles.brushEdge} style={{ left: at(brush.fromMs) }} aria-hidden="true" /> : null}
                {inView(brush.untilMs) ? <span className={styles.brushEdge} style={{ left: at(brush.untilMs) }} aria-hidden="true" /> : null}
              </>
            );
          })() : null}
          </div>
          <ul className={styles.key} aria-label={w.key} data-testid="psi-timestream-key">
            {(['fire', 'earth', 'air', 'water'] as const).map((e) => (
              <li key={e}><span className={styles.swatch} style={{ background: hexOf(colours[e]) }} />{w.elements[e]}</li>
            ))}
            <li><span className={`${styles.swatch} ${styles.swatchRetrograde}`} />{w.keyRetrograde}</li>
            <li><span className={`${styles.swatch} ${styles.swatchIngress}`} />{w.keyIngress}</li>
            {psiLanes.includes('busy') || psiLanes.includes('windows') ? <li><span className={styles.swatch} style={{ background: DATA_SCALES.psiWatch }} />{w.keyWindow}</li> : null}
            {psiLanes.includes('alerts') ? <li><span className={styles.swatch} style={{ background: DATA_SCALES.psiGround }} />{w.keyAlert}</li> : null}
            {psiLanes.includes('events') ? <li><span className={styles.swatch} style={{ background: eventColour(eventSetId) }} />{w.eventSets[eventSetId]}</li> : null}
            {lanes.includes('Moon') && moon === 'phases' ? (['new', 'full'] as const).map((kind) => (
              <li key={kind}><span className={styles.swatch} style={{ background: markColour({ ms: 0, kind }) }} />{w.moonMarks[kind]}</li>
            )) : null}
            {lanes.includes('Moon') && moon === 'eclipses' ? (['solar', 'lunar'] as const).map((kind) => (
              <li key={kind}><span className={styles.swatch} style={{ background: markColour({ ms: 0, kind }) }} />{w.eclipsesKey[kind]}</li>
            )) : null}
            {psiLanes.includes('kp') ? <>
              <li><span className={styles.swatch} style={{ background: DATA_SCALES.kpLevels[2] }} />{w.keyMeasured}</li>
              <li><span className={`${styles.swatch} ${styles.swatchForecast}`} style={{ borderColor: DATA_SCALES.kpLevels[2] }} />{w.keyForecast}</li>
            </> : null}
          </ul>
        </div>
      </div>
      <p className={styles.srOnly} aria-live="polite">{fill(w.showing, { from: formatUtcDateTime(view.startMs, { year: true }), until: formatUtcDateTime(view.startMs + view.spanMs, { year: true }) })}</p>
    </section>
  );
};

export default TimestreamDrawer;
