import React, { useEffect, useMemo, useState } from 'react';
import { usePhone } from '../../hooks/usePhone';
import { Docked } from '../Dock/Docked';
import { subscribeLegends, type LayerLegend, type LegendSwatch } from '../../services/globe/globeLegendStore';
import { feedState, humanAge, noteApplies, type FeedProvenance, type FeedState } from '../../features/globe/capture/shareCardProvenance';
import { formatUtcTime, formatUtcDateTime } from '../../utils/utcTime';
import { SymbolIcon } from '../../symbols/SymbolIcon';
import { symbolById } from '../../symbols/symbolRegistry';
import { ForecastStrip } from './ForecastStrip';
import { useTemporalStateOptional } from '../../context/TemporalContext';

/**
 * The key to what is on the globe (decision D-F).
 *
 * ─── WHY THIS WAS MISSING ──────────────────────────────────────────────────
 *
 * globeLegendStore was written so that a layer states its own encoding as it
 * draws, from the very marks it is drawing, rather than from a table beside the
 * code that can go stale. Fourteen sources publish into it. Until now exactly
 * one thing read it — composeShareCard — so all of that was visible only in an
 * exported image, and a person looking at the live globe had no key at all.
 * `subscribeLegends` had been sitting there unused since the store was written.
 *
 * Nothing here decides what anything means. It renders what the layers said,
 * which is the whole point of the store: a key that cannot disagree with the
 * picture beside it, because it is derived from the same array.
 *
 * ─── WHY A SWATCH IS DRAWN AS A SHAPE ──────────────────────────────────────
 *
 * The share card draws every swatch as a filled dot, which was true enough when
 * every layer drew discs. Since step 6.3 a person can put a layer on rings, and
 * a round dot beside a globe full of rings is a key that does not match its own
 * picture. Drawing the swatch in the shape the layer drew is also what makes a
 * shape collision legible: two layers both on rings show two rings here, and
 * the note below says which is which.
 */

/** What the shader draws for each style, at legend scale. */
const SHAPE_GLYPH: Record<string, (color: string) => React.CSSProperties> = {
  disc: (color) => ({ backgroundColor: color, borderRadius: '50%' }),
  ring: (color) => ({ border: `2px solid ${color}`, borderRadius: '50%' }),
  // A quake's ring from its magnitude alone, where USGS made no ShakeMap: an indication (D-EQ, EQ11).
  'dashed ring': (color) => ({ border: `2px dashed ${color}`, borderRadius: '50%' }),
  // Diplomacy's place GDELT put only at a country, under the Ring style (D-DP, DP13).
  dashedRing: (color) => ({ border: `2px dashed ${color}`, borderRadius: '50%' }),
  /*
   * A filled core with light falling off around it — the same two parts the
   * shader draws in one object (GLOW_QUAD_SCALE). A box-shadow is the closest
   * CSS has to additive falloff; it is a key, not a rendering.
   */
  glow: (color) => ({ backgroundColor: color, borderRadius: '50%', boxShadow: `0 0 4px 1px ${color}` }),
  /*
   * Lines, for the borders (decision D-F, 2026-09-19). A settled boundary is
   * solid and a provisional one dashed, which is the distinction the border key
   * exists to show — so the dash is drawn, not described.
   */
  line: (color) => ({ borderTop: `2px solid ${color}` }),
  dashed: (color) => ({ borderTop: `2px dashed ${color}` }),
  // A country's fill (War & Conflict's war map): neither a mark nor a line.
  area: (color) => ({ backgroundColor: color, borderRadius: 2 }),
  // A country hatched and outlined (War & Conflict's outer countries, theatre-lens.md, TL5), rising to the right as the globe draws it.
  hatch: (color) => ({ border: `1px solid ${color}`, backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 3px)` }),
  // A state force's arc (War & Conflict, theatre-lens.md, TL6): a stroke bowed upward, as the arcs rise.
  arc: (color) => ({ borderTop: `2px solid ${color}`, borderRadius: '50% 50% 0 0 / 100% 100% 0 0' }),
};

/** A mark is a dot; a line is a short stroke, wide enough for a dash to read. */
const SWATCH_BOX: Record<string, React.CSSProperties> = {
  line: { width: '16px', height: '0' },
  dashed: { width: '16px', height: '0' },
  arc: { width: '16px', height: '6px' },
};
const MARK_BOX: React.CSSProperties = { width: '8px', height: '8px' };

const DEFAULT_SHAPE = 'disc';

/** Swatches in runs: each unlabelled one with those after it, up to the labelled one that names them all. */
function runsOf(swatches: readonly LegendSwatch[]): Array<Array<{ swatch: LegendSwatch; i: number }>> {
  const runs: Array<Array<{ swatch: LegendSwatch; i: number }>> = [];
  let run: Array<{ swatch: LegendSwatch; i: number }> = [];
  swatches.forEach((swatch, i) => {
    run.push({ swatch, i });
    if (swatch.label) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Which shapes are drawn by more than one layer right now.
 *
 * Only shapes a layer actually DECLARED count. A layer that draws one kind of
 * mark publishes no shapeMeans, which is most of them — treating those as a
 * collision would put a warning on nearly every pair on the globe and say
 * nothing. See globeLegendStore's LayerLegend.shapeMeans.
 */
export function sharedShapes(legends: readonly LayerLegend[]): Map<string, string[]> {
  const byShape = new Map<string, string[]>();
  for (const entry of legends) {
    if (!entry.shapeMeans) continue;
    const names = byShape.get(entry.shapeMeans) ?? [];
    names.push(entry.layer);
    byShape.set(entry.shapeMeans, names);
  }
  for (const [shape, names] of byShape) {
    if (names.length < 2) byShape.delete(shape);
  }
  return byShape;
}

/*
 * ─── WHERE EACH LAYER'S DATA CAME FROM, AND HOW OLD IT IS (step 11) ────────
 *
 * Globe.tsx has long built a feed for every active layer — its source, when it
 * last loaded, whether it failed and why — and handed it to the share card and
 * nothing else. An exported image said "CelesTrak did not load" while the live
 * globe beside it said nothing, and a mark from a two-hour-old catalogue looked
 * exactly like one read thirty seconds ago. The key now lists those same feeds,
 * classified by the same feedState the card uses.
 *
 * In words, not by fading the marks. A layer is fetched in one go, so its age is
 * one number for all of them: dimming would dim a whole layer evenly, which
 * reads as "less important" rather than "older" — and opacity already carries
 * the limb fade.
 */
const WARN = '#ffcc66';
const DAY_MS = 24 * 60 * 60 * 1000;
/** How often an age on screen is brought up to date. A minute's resolution needs no more. */
export const SOURCE_AGE_TICK_MS = 30_000;

/*
 * Where a source stands against a paused moment, as a card judges it (D-W's Open list): the
 * key's "ago" is from now, which is true, and a card's from the moment shown, also true. While
 * paused the key says both.
 */
function againstMoment(at: number, shownAt: number | null | undefined): string {
  if (shownAt === null || shownAt === undefined) return '';
  const by = at - shownAt;
  if (Math.abs(by) < 60_000) return ' · at the moment shown';
  return ` · ${humanAge(Math.abs(by))} ${by > 0 ? 'after' : 'before'} the moment shown`;
}

/**
 * A feed in the key's words. Every state says something; none is left to look like all-clear.
 * `shownAt`, the paused moment, adds where the source stands against it.
 */
export function sourcePhrase(state: FeedState, shownAt?: number | null): { text: string; warn: boolean } {
  switch (state.kind) {
    case 'loaded': {
      // D-E: absolute times in UTC marked Z — with the date once "16:52Z" alone
      // could be yesterday's.
      const when = Math.abs(state.ageMs) >= DAY_MS ? formatUtcDateTime(state.at) : formatUtcTime(state.at);
      const moment = againstMoment(state.at, shownAt);
      // A forecast's hour can still be to come: the heat map's nearest step may lie ahead (D-W). A time less than
      // a tick past the key's clock is not one: it was read since the key last looked (Intel Reports' relays, D-LS).
      if (state.ageMs < -SOURCE_AGE_TICK_MS) return { text: `for ${when} · ${humanAge(-state.ageMs)} ahead${moment}`, warn: false };
      return { text: `as of ${when} · ${humanAge(Math.max(0, state.ageMs))} ago${moment}`, warn: state.stale };
    }
    case 'failed': return { text: `did not load — ${state.error}`, warn: true };
    case 'loading': return { text: 'loading…', warn: false };
    case 'never': return { text: 'has not loaded', warn: true };
    case 'untimed': return { text: 'loaded — the source does not say when', warn: false };
    case 'unreadable': return { text: `unreadable timestamp (${state.raw})`, warn: true };
    case 'unreported': return { text: 'does not report whether its data arrived', warn: true };
  }
}

const BOX_BACKGROUND = 'rgba(0, 0, 0, 0.72)';
/*
 * Shrinks to the room its dock has and scrolls inside (the dock's `fitsDock`): long,
 * with War & Conflict's sources, it ran down past its dock over the timeline and its
 * LIVE button at 1400×900 (theatre-lens.md, step 8).
 */
const box: React.CSSProperties = {
  backgroundColor: BOX_BACKGROUND,
  minHeight: 0,
  overflowY: 'auto',
  color: '#c7d6f2',
  padding: '6px 8px',
  borderRadius: '4px',
  fontSize: '10px',
  lineHeight: 1.35,
  maxWidth: '260px',
  pointerEvents: 'auto',
};

const headerStyle: React.CSSProperties = {
  color: '#00ffff',
  // In view while the key scrolls under it.
  position: 'sticky',
  top: 0,
  width: '100%',
  textAlign: 'left',
  background: BOX_BACKGROUND,
  border: 'none',
  padding: 0,
  font: 'inherit',
  letterSpacing: '0.08em',
  cursor: 'pointer',
  display: 'block',
};

export const GlobeLegend: React.FC<{
  /** Every active layer's source — the same feeds the share card is built from. */
  feeds?: readonly FeedProvenance[];
}> = ({ feeds = [] }) => {
  const [legends, setLegends] = useState<LayerLegend[]>([]);
  // Folded on a phone (BD6), where the key sat over the left column.
  const phone = usePhone();
  const [open, setOpen] = useState(!phone);
  const [now, setNow] = useState(() => Date.now());
  // The paused moment, if the timeline is paused: null while live, where now is the moment shown.
  const temporal = useTemporalStateOptional();
  const shownAt = temporal && !temporal.isLive ? temporal.currentTime : null;

  useEffect(() => subscribeLegends(setLegends), []);

  // "8m ago" frozen on screen becomes false within minutes.
  const hasFeeds = feeds.length > 0;
  useEffect(() => {
    if (!hasFeeds) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), SOURCE_AGE_TICK_MS);
    return () => clearInterval(id);
  }, [hasFeeds]);

  const shared = useMemo(() => sharedShapes(legends), [legends]);
  // Earth Weather's hours follow its last row in the key (D-W, WX12).
  const lastWeatherRow = legends.map((entry) => entry.layerId).lastIndexOf('EarthWeather');

  /*
   * Nothing drawn AND no source to report: an empty key is chrome that says
   * nothing. But a failed source draws nothing and publishes no legend, so the
   * key must still appear for it — rendering only when marks exist would make it
   * silent exactly when it has the most to say.
   */
  if (legends.length === 0 && feeds.length === 0) return null;

  return (
    <Docked slot="globeLegend">
      <div style={box} data-testid="globe-legend">
        <button
          type="button"
          style={headerStyle}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} KEY{legends.length > 0 ? ` · ${legends.length} layer${legends.length === 1 ? '' : 's'}` : ''}
        </button>

        {open && legends.map((entry, index) => {
          const shape = entry.shapeMeans ?? DEFAULT_SHAPE;
          const others = (shared.get(entry.shapeMeans ?? '') ?? []).filter((name) => name !== entry.layer);
          const encodings = [
            entry.shapeMeans ? `shape: ${entry.shapeMeans}` : null,
            entry.sizeMeans ? `size: ${entry.sizeMeans}` : null,
            entry.distanceMeans ? `distance: ${entry.distanceMeans}` : null,
            entry.colorMeans ? `colour: ${entry.colorMeans}` : null,
            entry.badgeMeans ? `number: ${entry.badgeMeans}` : null,
            entry.areaMeans ? `area: ${entry.areaMeans}` : null,
            entry.emblemMeans ? `emblem: ${entry.emblemMeans}` : null,
          ].filter(Boolean);

          return (
            // Earth Weather keys several rows under one layer id: each is named apart.
            <div key={`${entry.layerId}:${entry.layer}`} style={{ marginTop: '6px' }}>
              <div style={{ color: '#e8eefc' }}>
                {entry.layer}
                {/* The moment a weather model's values hold for (D-W, step 5a). */}
                {entry.when && <span style={{ opacity: 0.85 }}>, {entry.when}</span>}
              </div>
              {encodings.length > 0 && (
                <div style={{ opacity: 0.85 }}>{encodings.join(' · ')}</div>
              )}

              {/* Each emblem drawn, by its icon and what it means (BA14). */}
              {entry.emblems && entry.emblems.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: '2px' }}>
                  {entry.emblems.map((emblem) => {
                    const symbol = symbolById(emblem.id);
                    return (
                      <span key={emblem.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {symbol && <SymbolIcon symbol={symbol} size={12} />}
                        <span>{emblem.meaning}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              {others.length > 0 && (
                /*
                 * The collision step 6.3's switcher can produce: two layers
                 * drawn in the same shape, each meaning something different.
                 * The person chose it and it is recorded rather than prevented,
                 * so the key has to name the other layer — otherwise it shows
                 * two identical swatches and explains nothing.
                 */
                <div
                  data-testid={`legend-shape-shared-${entry.layerId}`}
                  style={{ color: '#ffcc66' }}
                >
                  also drawn as {entry.shapeMeans}: {others.join(', ')}
                </div>
              )}

              {entry.swatches.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: '2px' }}>
                  {runsOf(entry.swatches).map((run) => (
                    // An unlabelled swatch runs into the next: drawn together, named once by the label after them.
                    <span key={run.map(({ swatch }) => `${swatch.label} ${swatch.color}`).join('|')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        {run.map(({ swatch, i }) => {
                          // A swatch's own shape wins: one border entry holds solid and
                          // dashed lines, which an entry-level shape cannot express.
                          const drawn = SHAPE_GLYPH[swatch.shape ?? shape] ? (swatch.shape ?? shape) : DEFAULT_SHAPE;
                          // A glyph in its colour, where the marks are that glyph (D-DP, DP12).
                          const glyph = swatch.symbol ? symbolById(swatch.symbol) : null;
                          if (glyph) {
                            return (
                              <span key={i} data-testid={`legend-swatch-${entry.layerId}-${i}`} data-shape="symbol" aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
                                <SymbolIcon symbol={glyph} size={12} color={swatch.color} />
                              </span>
                            );
                          }
                          return (
                            <span
                              key={i}
                              data-testid={`legend-swatch-${entry.layerId}-${i}`}
                              data-shape={drawn}
                              aria-hidden="true"
                              style={{
                                ...(SWATCH_BOX[drawn] ?? MARK_BOX),
                                flexShrink: 0,
                                boxSizing: 'border-box',
                                ...SHAPE_GLYPH[drawn](swatch.color),
                              }}
                            />
                          );
                        })}
                      </span>
                      {run[run.length - 1].swatch.label}
                    </span>
                  ))}
                </div>
              )}
              {/* Earth Weather's hours, after its last row (D-W, WX12). */}
              {index === lastWeatherRow && <ForecastStrip />}
            </div>
          );
        })}

        {open && feeds.length > 0 && (
          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(199, 214, 242, 0.18)' }}>
            <div style={{ color: '#00ffff', letterSpacing: '0.08em' }}>SOURCES</div>
            {feeds.map((feed) => {
              const state = feedState(feed, new Date(now));
              const { text, warn } = sourcePhrase(state, shownAt);
              const dataState = state.kind === 'loaded' && state.stale ? 'stale' : state.kind;
              return (
                <div
                  key={feed.name}
                  data-testid={`legend-source-${feed.name}`}
                  data-state={dataState}
                  style={{ marginTop: '2px' }}
                >
                  <span style={{ color: '#e8eefc' }}>{feed.name}</span>
                  {' — '}
                  <span style={{ color: warn ? WARN : undefined }}>{text}</span>
                  {feed.credits?.length ? (
                    /*
                     * Who to credit, as each source's terms ask (record D-L, L5):
                     * the source linked, and its licence where it names one.
                     * Cyan, the app's colour for what can be followed.
                     */
                    <div data-testid={`legend-source-credit-${feed.name}`} style={{ opacity: 0.85 }}>
                      {feed.credits.map((credit, i) => (
                        <span key={credit.text}>
                          {i > 0 && ' · '}
                          {credit.url
                            ? <a href={credit.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>{credit.keyText ?? credit.text}</a>
                            : (credit.keyText ?? credit.text)}
                          {credit.licence && (
                            <>
                              {' ('}
                              <a href={credit.licence.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>{credit.licence.name}</a>
                              {')'}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {noteApplies(feed) && (
                    /*
                     * What the source's data IS, whatever its age — the card's
                     * standing note, under the same rule (step 13). Satellites
                     * is why the key shows it: "as of 19:47Z · 0m ago" alone
                     * reads as though its positions were observed just now.
                     */
                    <div
                      data-testid={`legend-source-note-${feed.name}`}
                      style={{ opacity: 0.75, fontStyle: 'italic' }}
                    >
                      {feed.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Docked>
  );
};
