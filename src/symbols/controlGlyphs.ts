/**
 * The second left rail's control glyphs (critique-2026-11-01, OR1, OR10; plan A1), as drafted on the Glyph Lexicon
 * sheet and written by scripts/glyph-lexicon/controls-to-symbols.ts: do not edit by hand; change controls.ts and
 * run it. Lucide's element data (https://lucide.dev, ISC licence) from lucide-react 0.525.0, and Starcom's own marks
 * where Lucide has none. uiSymbols.ts takes them into GLYPHS, where one icon has one meaning.
 */
import type { IconNode } from './symbolRegistry';
import type { GlyphEntry, GlyphHue } from './uiSymbols';

const glyph = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Lucide', licence: 'ISC' } });
const mark = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Starcom', licence: 'own' } });

export const CONTROL_GLYPHS = {
  'control:mark:icon': glyph('control:mark:icon', 'Draw each item as its icon.', 'shapes', 'control', [
    ['path', { d: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z' }],
    ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }],
    ['circle', { cx: 17.5, cy: 17.5, r: 3.5 }],
  ]),
  'control:mark:dot': glyph('control:mark:dot', 'Draw each item as a dot.', 'circle-small', 'control', [
    ['circle', { cx: 12, cy: 12, r: 6 }],
  ]),
  'control:mark:pin': glyph('control:mark:pin', 'Draw each item as a pin: a line up to a flag with its tag.', 'map-pin', 'control', [
    ['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' }],
    ['circle', { cx: 12, cy: 10, r: 3 }],
  ]),
  'control:mark:spike': glyph('control:mark:spike', 'Draw each item as a spike, its height the log of its magnitude.', 'chart-column', 'control', [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M18 17V9' }],
    ['path', { d: 'M13 17V5' }],
    ['path', { d: 'M8 17v-3' }],
  ]),
  'control:colour:kind': glyph('control:colour:kind', 'Colour by what the item is about.', 'palette', 'control', [
    ['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }],
    ['circle', { cx: 13.5, cy: 6.5, r: '.5', fill: 'currentColor' }],
    ['circle', { cx: 17.5, cy: 10.5, r: '.5', fill: 'currentColor' }],
    ['circle', { cx: 6.5, cy: 12.5, r: '.5', fill: 'currentColor' }],
    ['circle', { cx: 8.5, cy: 7.5, r: '.5', fill: 'currentColor' }],
  ]),
  'control:colour:severity': glyph('control:colour:severity', 'Colour by how severe.', 'signal', 'control', [
    ['path', { d: 'M2 20h.01' }],
    ['path', { d: 'M7 20v-4' }],
    ['path', { d: 'M12 20v-8' }],
    ['path', { d: 'M17 20V8' }],
    ['path', { d: 'M22 4v16' }],
  ]),
  'control:colour:age': glyph('control:colour:age', 'Colour by how old.', 'clock-arrow-down', 'control', [
    ['path', { d: 'M12 6v6l2 1' }],
    ['path', { d: 'M12.337 21.994a10 10 0 1 1 9.588-8.767' }],
    ['path', { d: 'm14 18 4 4 4-4' }],
    ['path', { d: 'M18 14v8' }],
  ]),
  'control:colour:source': glyph('control:colour:source', 'Colour by who reported it.', 'quote', 'control', [
    ['path', { d: 'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z' }],
    ['path', { d: 'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z' }],
  ]),
  'control:size:magnitude': glyph('control:size:magnitude', 'Size by magnitude.', 'arrow-up-wide-narrow', 'control', [
    ['path', { d: 'm3 8 4-4 4 4' }],
    ['path', { d: 'M7 4v16' }],
    ['path', { d: 'M11 12h10' }],
    ['path', { d: 'M11 16h7' }],
    ['path', { d: 'M11 20h4' }],
  ]),
  'control:size:count': glyph('control:size:count', 'Size by how many.', 'hash', 'control', [
    ['line', { 'x1': 4, 'x2': 20, 'y1': 9, 'y2': 9 }],
    ['line', { 'x1': 4, 'x2': 20, 'y1': 15, 'y2': 15 }],
    ['line', { 'x1': 10, 'x2': 8, 'y1': 3, 'y2': 21 }],
    ['line', { 'x1': 16, 'x2': 14, 'y1': 3, 'y2': 21 }],
  ]),
  'control:size:none': glyph('control:size:none', 'One size for all.', 'equal', 'control', [
    ['line', { 'x1': 5, 'x2': 19, 'y1': 9, 'y2': 9 }],
    ['line', { 'x1': 5, 'x2': 19, 'y1': 15, 'y2': 15 }],
  ]),
  'control:labels': glyph('control:labels', 'Names or values beside the marks.', 'tag', 'control', [
    ['path', { d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z' }],
    ['circle', { cx: 7.5, cy: 7.5, r: '.5', fill: 'currentColor' }],
  ]),
  'control:cluster': glyph('control:cluster', 'Fold near marks into a counted icon.', 'group', 'control', [
    ['path', { d: 'M3 7V5c0-1.1.9-2 2-2h2' }],
    ['path', { d: 'M17 3h2c1.1 0 2 .9 2 2v2' }],
    ['path', { d: 'M21 17v2c0 1.1-.9 2-2 2h-2' }],
    ['path', { d: 'M7 21H5c-1.1 0-2-.9-2-2v-2' }],
    ['rect', { width: 7, height: 5, x: 7, y: 7, rx: 1 }],
    ['rect', { width: 7, height: 5, x: 10, y: 12, rx: 1 }],
  ]),
  'control:filter': glyph('control:filter', 'Show only some kinds.', 'list-filter', 'control', [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M7 12h10' }],
    ['path', { d: 'M10 18h4' }],
  ]),
  'control:list': glyph('control:list', 'The items drawn, as a list in the inspector.', 'list', 'control', [
    ['path', { d: 'M3 12h.01' }],
    ['path', { d: 'M3 18h.01' }],
    ['path', { d: 'M3 6h.01' }],
    ['path', { d: 'M8 12h13' }],
    ['path', { d: 'M8 18h13' }],
    ['path', { d: 'M8 6h13' }],
  ]),
  'control:fill:solid': glyph('control:fill:solid', 'Fill the ground.', 'paint-bucket', 'control', [
    ['path', { d: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z' }],
    ['path', { d: 'm5 2 5 5' }],
    ['path', { d: 'M2 13h15' }],
    ['path', { d: 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z' }],
  ]),
  'control:fill:hatch': mark('control:fill:hatch', 'Hatch the ground.', 'hatch-lines', 'control', [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M3 15 15 3' }],
    ['path', { d: 'M3 21 21 3' }],
    ['path', { d: 'M9 21 21 9' }],
  ]),
  'control:fill:outline': glyph('control:fill:outline', 'Outline only.', 'square-dashed', 'control', [
    ['path', { d: 'M5 3a2 2 0 0 0-2 2' }],
    ['path', { d: 'M19 3a2 2 0 0 1 2 2' }],
    ['path', { d: 'M21 19a2 2 0 0 1-2 2' }],
    ['path', { d: 'M5 21a2 2 0 0 1-2-2' }],
    ['path', { d: 'M9 3h1' }],
    ['path', { d: 'M9 21h1' }],
    ['path', { d: 'M14 3h1' }],
    ['path', { d: 'M14 21h1' }],
    ['path', { d: 'M3 9v1' }],
    ['path', { d: 'M21 9v1' }],
    ['path', { d: 'M3 14v1' }],
    ['path', { d: 'M21 14v1' }],
  ]),
  'control:opacity': glyph('control:opacity', 'How see-through.', 'blend', 'control', [
    ['circle', { cx: 9, cy: 9, r: 7 }],
    ['circle', { cx: 15, cy: 15, r: 7 }],
  ]),
  'control:colour:value': glyph('control:colour:value', 'Colour by a value, on a ramp.', 'swatch-book', 'control', [
    ['path', { d: 'M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z' }],
    ['path', { d: 'M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7' }],
    ['path', { d: 'M 7 17h.01' }],
    ['path', { d: 'm11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8' }],
  ]),
  'control:width:value': glyph('control:width:value', 'Width by a value.', 'move-horizontal', 'control', [
    ['path', { d: 'm18 8 4 4-4 4' }],
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'm6 8-4 4 4 4' }],
  ]),
  'control:arrows': glyph('control:arrows', 'Arrows along each line, the way it runs.', 'arrow-right-left', 'control', [
    ['path', { d: 'm16 3 4 4-4 4' }],
    ['path', { d: 'M20 7H4' }],
    ['path', { d: 'm8 21-4-4 4-4' }],
    ['path', { d: 'M4 17h16' }],
  ]),
  'control:flow': glyph('control:flow', 'Moving flow along each line.', 'waves', 'control', [
    ['path', { d: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
    ['path', { d: 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
    ['path', { d: 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
  ]),
  'control:dashed': glyph('control:dashed', 'Planned or uncertain lines dashed.', 'route', 'control', [
    ['circle', { cx: 6, cy: 19, r: 3 }],
    ['path', { d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' }],
    ['circle', { cx: 18, cy: 5, r: 3 }],
  ]),
  'control:look:heat': glyph('control:look:heat', 'A heat map of the value.', 'thermometer', 'control', [
    ['path', { d: 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' }],
  ]),
  'control:look:contours': glyph('control:look:contours', 'Lines at fixed steps of the value.', 'brush', 'control', [
    ['path', { d: 'm11 10 3 3' }],
    ['path', { d: 'M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z' }],
    ['path', { d: 'M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031' }],
  ]),
  'control:look:relief': glyph('control:look:relief', 'The value raised as relief.', 'mountain', 'control', [
    ['path', { d: 'm8 3 4 8 5-5 5 15H2L8 3z' }],
  ]),
  'control:look:flow': glyph('control:look:flow', 'The field moving.', 'wind', 'control', [
    ['path', { d: 'M12.8 19.6A2 2 0 1 0 14 16H2' }],
    ['path', { d: 'M17.5 8a2.5 2.5 0 1 1 2 4H2' }],
    ['path', { d: 'M9.8 4.4A2 2 0 1 1 11 8H2' }],
  ]),
  'control:look:arrows': glyph('control:look:arrows', 'Arrows the way the field points.', 'move-up-right', 'control', [
    ['path', { d: 'M13 5H19V11' }],
    ['path', { d: 'M19 5L5 19' }],
  ]),
  'control:look:ripples': glyph('control:look:ripples', 'Ripples across the field.', 'audio-waveform', 'control', [
    ['path', { d: 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2' }],
  ]),
  'control:scale:absolute': glyph('control:scale:absolute', 'One scale every day.', 'ruler', 'control', [
    ['path', { d: 'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z' }],
    ['path', { d: 'm14.5 12.5 2-2' }],
    ['path', { d: 'm11.5 9.5 2-2' }],
    ['path', { d: 'm8.5 6.5 2-2' }],
    ['path', { d: 'm17.5 15.5 2-2' }],
  ]),
  'control:scale:relative': glyph('control:scale:relative', 'The scale stretched over today\'s values.', 'scaling', 'control', [
    ['path', { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
    ['path', { d: 'M14 15H9v-5' }],
    ['path', { d: 'M16 3h5v5' }],
    ['path', { d: 'M21 3 9 15' }],
  ]),
  'control:units': glyph('control:units', 'Units: °C or °F, mm or in.', 'repeat', 'control', [
    ['path', { d: 'm17 2 4 4-4 4' }],
    ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }],
    ['path', { d: 'm7 22-4-4 4-4' }],
    ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }],
  ]),
  'control:window:day': glyph('control:window:day', 'The last 24 hours.', 'clock', 'control', [
    ['path', { d: 'M12 6v6l4 2' }],
    ['circle', { cx: 12, cy: 12, r: 10 }],
  ]),
  'control:window:week': glyph('control:window:week', 'The last 7 days.', 'calendar-days', 'control', [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'M8 14h.01' }],
    ['path', { d: 'M12 14h.01' }],
    ['path', { d: 'M16 14h.01' }],
    ['path', { d: 'M8 18h.01' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M16 18h.01' }],
  ]),
  'control:window:month': glyph('control:window:month', 'The last 30 days.', 'calendar', 'control', [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ['path', { d: 'M3 10h18' }],
  ]),
  'control:window:year': glyph('control:window:year', 'The last year.', 'calendar-check', 'control', [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'm9 16 2 2 4-4' }],
  ]),
  'control:window:all': glyph('control:window:all', 'Everything held.', 'infinity', 'control', [
    ['path', { d: 'M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8' }],
  ]),
  'control:fade': glyph('control:fade', 'Older items fade.', 'clock-fading', 'control', [
    ['path', { d: 'M12 2a10 10 0 0 1 7.38 16.75' }],
    ['path', { d: 'M12 6v6l4 2' }],
    ['path', { d: 'M2.5 8.875a10 10 0 0 0-.5 3' }],
    ['path', { d: 'M2.83 16a10 10 0 0 0 2.43 3.4' }],
    ['path', { d: 'M4.636 5.235a10 10 0 0 1 .891-.857' }],
    ['path', { d: 'M8.644 21.42a10 10 0 0 0 7.631-.38' }],
  ]),
  'control:scale:true': glyph('control:scale:true', 'True 1:1: sizes and distances as they are.', 'scale-3d', 'control', [
    ['path', { d: 'M5 7v11a1 1 0 0 0 1 1h11' }],
    ['path', { d: 'M5.293 18.707 11 13' }],
    ['circle', { cx: 19, cy: 19, r: 2 }],
    ['circle', { cx: 5, cy: 5, r: 2 }],
  ]),
  'control:scale:compact': glyph('control:scale:compact', 'Compact: true sizes, distances 1:19.7.', 'minimize-2', 'control', [
    ['path', { d: 'm14 10 7-7' }],
    ['path', { d: 'M20 10h-6V4' }],
    ['path', { d: 'm3 21 7-7' }],
    ['path', { d: 'M4 14h6v6' }],
  ]),
  'control:scale:diagram': glyph('control:scale:diagram', 'Diagram: orbits evenly spaced, not to scale.', 'circle-ellipsis', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M17 12h.01' }],
    ['path', { d: 'M12 12h.01' }],
    ['path', { d: 'M7 12h.01' }],
  ]),
  'control:scale:sky': glyph('control:scale:sky', 'The sky from a place on the Earth.', 'telescope', 'control', [
    ['path', { d: 'm10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44' }],
    ['path', { d: 'm13.56 11.747 4.332-.924' }],
    ['path', { d: 'm16 21-3.105-6.21' }],
    ['path', { d: 'M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z' }],
    ['path', { d: 'm6.158 8.633 1.114 4.456' }],
    ['path', { d: 'm8 21 3.105-6.21' }],
    ['circle', { cx: 12, cy: 13, r: 2 }],
  ]),
  'control:orbits': glyph('control:orbits', 'Orbit lines.', 'circle-dot-dashed', 'control', [
    ['path', { d: 'M10.1 2.18a9.93 9.93 0 0 1 3.8 0' }],
    ['path', { d: 'M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7' }],
    ['path', { d: 'M21.82 10.1a9.93 9.93 0 0 1 0 3.8' }],
    ['path', { d: 'M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69' }],
    ['path', { d: 'M13.9 21.82a9.94 9.94 0 0 1-3.8 0' }],
    ['path', { d: 'M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7' }],
    ['path', { d: 'M2.18 13.9a9.93 9.93 0 0 1 0-3.8' }],
    ['path', { d: 'M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69' }],
    ['circle', { cx: 12, cy: 12, r: 1 }],
  ]),
  'control:moons': glyph('control:moons', 'Moons.', 'moon', 'control', [
    ['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  ]),
  'control:light': glyph('control:light', 'True sunlight or flat light.', 'sun', 'control', [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }],
  ]),
  'control:timeline': glyph('control:timeline', 'Show it on the time bar.', 'chart-gantt', 'control', [
    ['path', { d: 'M10 6h8' }],
    ['path', { d: 'M12 16h6' }],
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M8 11h7' }],
  ]),
  'control:card': glyph('control:card', 'Make a card of it.', 'image', 'control', [
    ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 }],
    ['circle', { cx: 9, cy: 9, r: 2 }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  ]),
  'control:compare': glyph('control:compare', 'Compare it, side by side.', 'columns-2', 'control', [
    ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ['path', { d: 'M12 3v18' }],
  ]),
  'control:watch': glyph('control:watch', 'Watch this place: ping when more lands here.', 'bell', 'control', [
    ['path', { d: 'M10.268 21a2 2 0 0 0 3.464 0' }],
    ['path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' }],
  ]),
  'control:related': glyph('control:related', 'Related items, near it and around its time.', 'link', 'control', [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ]),
  'control:conflict:displacement': glyph('control:conflict:displacement', 'Conflict Zones: people displaced from their homes (UNHCR).', 'tent', 'control', [
    ['path', { d: 'M3.5 21 14 3' }],
    ['path', { d: 'M20.5 21 10 3' }],
    ['path', { d: 'M15.5 21 12 15l-3.5 6' }],
    ['path', { d: 'M2 21h20' }],
  ]),
  'control:psi:bands': glyph('control:psi:bands', 'Planet lines: each line widened by its orb.', 'rectangle-vertical', 'control', [
    ['rect', { width: 12, height: 20, x: 6, y: 2, rx: 2 }],
  ]),
  'control:psi:parans': glyph('control:psi:parans', 'Planet lines: parans, where two bodies are angular at once.', 'rows-2', 'control', [
    ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
    ['path', { d: 'M3 12h18' }],
  ]),
  'control:war:arcs': glyph('control:war:arcs', 'War & Conflict: the forces\' arcs.', 'git-branch', 'control', [
    ['line', { 'x1': 6, 'x2': 6, 'y1': 3, 'y2': 15 }],
    ['circle', { cx: 18, cy: 6, r: 3 }],
    ['circle', { cx: 6, cy: 18, r: 3 }],
    ['path', { d: 'M18 9a9 9 0 0 1-9 9' }],
  ]),
  'control:war:deaths': glyph('control:war:deaths', 'War & Conflict: deaths rings.', 'heart-crack', 'control', [
    ['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }],
    ['path', { d: 'm12 13-1-1 2-2-3-3 2-2' }],
  ]),
  'control:war:map': glyph('control:war:map', 'War & Conflict: the war map.', 'map-pinned', 'control', [
    ['path', { d: 'M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0' }],
    ['circle', { cx: 12, cy: 8, r: 2 }],
    ['path', { d: 'M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712' }],
  ]),
  'control:war:theatres': glyph('control:war:theatres', 'War & Conflict: theatres.', 'layout-grid', 'control', [
    ['rect', { width: 7, height: 7, x: 3, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 14, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 14, y: 14, rx: 1 }],
    ['rect', { width: 7, height: 7, x: 3, y: 14, rx: 1 }],
  ]),
  'control:resources:oil': glyph('control:resources:oil', 'Resource Zones: oil.', 'droplet', 'control', [
    ['path', { d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' }],
  ]),
  'control:resources:gas': glyph('control:resources:gas', 'Resource Zones: gas.', 'flame', 'control', [
    ['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' }],
  ]),
  'control:resources:renewables': glyph('control:resources:renewables', 'Resource Zones: renewables.', 'wind-arrow-down', 'control', [
    ['path', { d: 'M10 2v8' }],
    ['path', { d: 'M12.8 21.6A2 2 0 1 0 14 18H2' }],
    ['path', { d: 'M17.5 10a2.5 2.5 0 1 1 2 4H2' }],
    ['path', { d: 'm6 6 4 4 4-4' }],
  ]),
  'control:resources:water': glyph('control:resources:water', 'Resource Zones: water.', 'glass-water', 'control', [
    ['path', { d: 'M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z' }],
    ['path', { d: 'M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0' }],
  ]),
  'control:resources:minerals': glyph('control:resources:minerals', 'Resource Zones: minerals.', 'gem', 'control', [
    ['path', { d: 'M6 3h12l4 6-10 13L2 9Z' }],
    ['path', { d: 'M11 3 8 9l4 13 4-13-3-6' }],
    ['path', { d: 'M2 9h20' }],
  ]),
  'control:resources:routes': glyph('control:resources:routes', 'Resource Zones: trade routes.', 'ship', 'control', [
    ['path', { d: 'M12 10.189V14' }],
    ['path', { d: 'M12 2v3' }],
    ['path', { d: 'M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6' }],
    ['path', { d: 'M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76' }],
    ['path', { d: 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }],
  ]),
  'control:eco:footprints': glyph('control:eco:footprints', 'Eco Disasters: GDACS footprints and tracks.', 'scan', 'control', [
    ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
  ]),
  'control:eco:plumes': glyph('control:eco:plumes', 'Eco Disasters: volcano plumes.', 'cloud-fog', 'control', [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' }],
    ['path', { d: 'M16 17H7' }],
    ['path', { d: 'M17 21H9' }],
  ]),
  'control:eco:depth': glyph('control:eco:depth', 'Eco Disasters: a quake\'s depth beneath the surface.', 'arrow-down-to-line', 'control', [
    ['path', { d: 'M12 17V3' }],
    ['path', { d: 'm6 11 6 6 6-6' }],
    ['path', { d: 'M19 21H5' }],
  ]),
  'control:eco:plates': glyph('control:eco:plates', 'Eco Disasters: the plate boundaries beside the quakes (PB2002).', 'split', 'control', [
    ['path', { d: 'M16 3h5v5' }],
    ['path', { d: 'M8 3H3v5' }],
    ['path', { d: 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3' }],
    ['path', { d: 'm15 9 6-6' }],
  ]),
  'control:eco:volcanoes': glyph('control:eco:volcanoes', 'Eco Disasters: the volcano catalogue beside the quakes.', 'mountain-snow', 'control', [
    ['path', { d: 'm8 3 4 8 5-5 5 15H2L8 3z' }],
    ['path', { d: 'M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19' }],
  ]),
  'control:eco:magnitudes': glyph('control:eco:magnitudes', 'Eco Disasters: only the quakes whose magnitude is in a range.', 'sliders-horizontal', 'control', [
    ['line', { 'x1': 21, 'x2': 14, 'y1': 4, 'y2': 4 }],
    ['line', { 'x1': 10, 'x2': 3, 'y1': 4, 'y2': 4 }],
    ['line', { 'x1': 21, 'x2': 12, 'y1': 12, 'y2': 12 }],
    ['line', { 'x1': 8, 'x2': 3, 'y1': 12, 'y2': 12 }],
    ['line', { 'x1': 21, 'x2': 16, 'y1': 20, 'y2': 20 }],
    ['line', { 'x1': 12, 'x2': 3, 'y1': 20, 'y2': 20 }],
    ['line', { 'x1': 14, 'x2': 14, 'y1': 2, 'y2': 6 }],
    ['line', { 'x1': 8, 'x2': 8, 'y1': 10, 'y2': 14 }],
    ['line', { 'x1': 16, 'x2': 16, 'y1': 18, 'y2': 22 }],
  ]),
  'control:eco:depths': glyph('control:eco:depths', 'Eco Disasters: only the quakes whose depth is in a range.', 'unfold-vertical', 'control', [
    ['path', { d: 'M12 22v-6' }],
    ['path', { d: 'M12 8V2' }],
    ['path', { d: 'M4 12H2' }],
    ['path', { d: 'M10 12H8' }],
    ['path', { d: 'M16 12h-2' }],
    ['path', { d: 'M22 12h-2' }],
    ['path', { d: 'm15 19-3 3-3-3' }],
    ['path', { d: 'm15 5-3-3-3 3' }],
  ]),
  'control:eco:ping': glyph('control:eco:ping', 'Eco Disasters: a ping on a new quake of the magnitude chosen or more.', 'bell-ring', 'control', [
    ['path', { d: 'M10.268 21a2 2 0 0 0 3.464 0' }],
    ['path', { d: 'M22 8c0-2.3-.8-4.3-2-6' }],
    ['path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' }],
    ['path', { d: 'M4 2C2.8 3.7 2 5.7 2 8' }],
  ]),
  'control:weather:temperature': glyph('control:weather:temperature', 'Earth Weather: colour by temperature.', 'thermometer-snowflake', 'control', [
    ['path', { d: 'm10 20-1.25-2.5L6 18' }],
    ['path', { d: 'M10 4 8.75 6.5 6 6' }],
    ['path', { d: 'M10.585 15H10' }],
    ['path', { d: 'M2 12h6.5L10 9' }],
    ['path', { d: 'M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z' }],
    ['path', { d: 'm4 10 1.5 2L4 14' }],
    ['path', { d: 'm7 21 3-6-1.5-3' }],
    ['path', { d: 'm7 3 3 6h2' }],
  ]),
  'control:weather:rain': glyph('control:weather:rain', 'Earth Weather: colour by rain.', 'cloud-rain', 'control', [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' }],
    ['path', { d: 'M16 14v6' }],
    ['path', { d: 'M8 14v6' }],
    ['path', { d: 'M12 16v6' }],
  ]),
  'control:weather:air': glyph('control:weather:air', 'Earth Weather: colour by air quality.', 'air-vent', 'control', [
    ['path', { d: 'M18 17.5a2.5 2.5 0 1 1-4 2.03V12' }],
    ['path', { d: 'M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M6 8h12' }],
    ['path', { d: 'M6.6 15.572A2 2 0 1 0 10 17v-5' }],
  ]),
  'control:weather:clouds': glyph('control:weather:clouds', 'Earth Weather: real clouds.', 'cloud', 'control', [
    ['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }],
  ]),
  'control:weather:gauges': glyph('control:weather:gauges', 'Earth Weather: river and tide gauges.', 'droplets', 'control', [
    ['path', { d: 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z' }],
    ['path', { d: 'M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97' }],
  ]),
  'control:space:belts': mark('control:space:belts', 'Space Weather: the Van Allen belts.', 'belts-crescents', 'control', [
    ['circle', { cx: 12, cy: 12, r: 2.5 }],
    ['path', { d: 'M6.5 6.5a8 8 0 0 0 0 11' }],
    ['path', { d: 'M17.5 6.5a8 8 0 0 1 0 11' }],
    ['path', { d: 'M3.5 3.5a12 12 0 0 0 0 17' }],
    ['path', { d: 'M20.5 3.5a12 12 0 0 1 0 17' }],
  ]),
  'control:space:cmes': glyph('control:space:cmes', 'Space Weather: CMEs.', 'sparkle', 'control', [
    ['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }],
  ]),
  'control:space:enlil': glyph('control:space:enlil', 'Space Weather: ENLIL, the solar wind model.', 'sun-medium', 'control', [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 3v1' }],
    ['path', { d: 'M12 20v1' }],
    ['path', { d: 'M3 12h1' }],
    ['path', { d: 'M20 12h1' }],
    ['path', { d: 'm18.364 5.636-.707.707' }],
    ['path', { d: 'm6.343 17.657-.707.707' }],
    ['path', { d: 'm5.636 5.636.707.707' }],
    ['path', { d: 'm17.657 17.657.707.707' }],
  ]),
  'control:unrest:events': glyph('control:unrest:events', 'Civil Unrest: the events.', 'speech', 'control', [
    ['path', { d: 'M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20' }],
    ['path', { d: 'M19.8 17.8a7.5 7.5 0 0 0 .003-10.603' }],
    ['path', { d: 'M17 15a3.5 3.5 0 0 0-.025-4.975' }],
  ]),
  'control:unrest:surges': glyph('control:unrest:surges', 'Civil Unrest: the surges.', 'trending-up', 'control', [
    ['path', { d: 'M16 7h6v6' }],
    ['path', { d: 'm22 7-8.5 8.5-5-5L2 17' }],
  ]),
} as const satisfies Record<string, GlyphEntry>;
