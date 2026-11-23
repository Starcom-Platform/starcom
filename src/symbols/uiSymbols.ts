/**
 * The glyphs of the bar, the rails, quick access and the Globe's notes (K3,
 * plan block D, step 4): one icon for each meaning, wherever it is drawn. The
 * rail drew one emoji for a layer and quick access another; a name here is the
 * only way to draw either now.
 *
 * Picked by meaning and reviewed on the glyph sheet (BD8, BD9). Swapping one is
 * one line: its icon's name and drawing below. The drawing is Lucide's own element
 * data on its 24-unit grid, copied as symbolRegistry.ts copies the category
 * icons (Lucide, https://lucide.dev, ISC licence; see symbolRegistry.ts for
 * the notice), from lucide-react 0.525.0.
 *
 * A glyph's hue is the registry's, never the call site's (K3). Both hues now
 * draw in the colour of what they sit in: a control's colour says its state
 * (current, open, off), and a note's is its line's. The sections' own tints
 * come with the swatch sheet (BD2, step 5).
 */
import type { IconNode, SymbolEntry } from './symbolRegistry';
import { CONTROL_GLYPHS } from './controlGlyphs';

/** `control`: a button or a nav entry, coloured by its state. `note`: a line of text, coloured as the line. */
export type GlyphHue = 'control' | 'note';

export interface GlyphEntry extends SymbolEntry {
  hue: GlyphHue;
}

const glyph = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Lucide', licence: 'ISC' } });

/**
 * A mark drawn for Starcom where Lucide has none (K3: "marks drawn on the
 * 24-unit grid fill what Lucide lacks"), in Lucide's manner: its grid, a 2-unit
 * stroke, round caps and joins. Chosen by the owner on the glyph sheet (BD9).
 */
const mark = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Starcom', licence: 'own' } });

const BASE_GLYPHS = {
  // ── Apps (the bar, the phone bar, quick access, search) ──
  'app:cybercommand': glyph('app:cybercommand', 'Globe', 'globe', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ]),
  'app:netrunner': glyph('app:netrunner', 'NetRunner', 'terminal', 'control', [
    ['path', { d: 'M12 19h8' }],
    ['path', { d: 'm4 17 6-6-6-6' }],
  ]),
  'app:cases': glyph('app:cases', 'Cases', 'folder-search', 'control', [
    ['path', { d: 'M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1' }],
    ['path', { d: 'm21 21-1.9-1.9' }],
    ['circle', { cx: 17, cy: 17, r: 3 }],
  ]),
  'app:inteldashboard': glyph('app:inteldashboard', 'IntelDashboard', 'newspaper', 'control', [
    ['path', { d: 'M15 18h-5' }],
    ['path', { d: 'M18 14h-8' }],
    ['path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2' }],
    ['rect', { width: 8, height: 4, x: 10, y: 6, rx: 1 }],
  ]),
  'app:intelanalyzer': glyph('app:intelanalyzer', 'IntelAnalyzer', 'microscope', 'control', [
    ['path', { d: 'M6 18h8' }],
    ['path', { d: 'M3 22h18' }],
    ['path', { d: 'M14 22a7 7 0 1 0 0-14h-1' }],
    ['path', { d: 'M9 14h2' }],
    ['path', { d: 'M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z' }],
    ['path', { d: 'M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3' }],
  ]),
  'app:intelweb': glyph('app:intelweb', 'IntelWeb', 'waypoints', 'control', [
    ['circle', { cx: 12, cy: 4.5, r: 2.5 }],
    ['path', { d: 'm10.2 6.3-3.9 3.9' }],
    ['circle', { cx: 4.5, cy: 12, r: 2.5 }],
    ['path', { d: 'M7 12h10' }],
    ['circle', { cx: 19.5, cy: 12, r: 2.5 }],
    ['path', { d: 'm13.8 17.7 3.9-3.9' }],
    ['circle', { cx: 12, cy: 19.5, r: 2.5 }],
  ]),
  'app:teamworkspace': glyph('app:teamworkspace', 'Missions', 'target', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['circle', { cx: 12, cy: 12, r: 6 }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
  ]),
  'app:marketexchange': glyph('app:marketexchange', 'MarketExchange (the opportunity board)', 'clipboard-list', 'control', [
    ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M12 11h4' }],
    ['path', { d: 'M12 16h4' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 16h.01' }],
  ]),
  'nav:intel': glyph('nav:intel', 'Intel (phone bar sheet)', 'eye', 'control', [
    ['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ]),
  'nav:more': glyph('nav:more', 'More (phone bar sheet)', 'ellipsis', 'control', [
    ['circle', { cx: 12, cy: 12, r: 1 }],
    ['circle', { cx: 19, cy: 12, r: 1 }],
    ['circle', { cx: 5, cy: 12, r: 1 }],
  ]),
  // ── The header ──
  'chat:open': glyph('chat:open', 'Secure chat', 'message-circle', 'control', [
    ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
  ]),
  'chat:stealth': glyph('chat:stealth', 'Secure chat, stealth mode', 'ghost', 'control', [
    ['path', { d: 'M9 10h.01' }],
    ['path', { d: 'M15 10h.01' }],
    ['path', { d: 'M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z' }],
  ]),
  'chat:emergency': glyph('chat:emergency', 'Secure chat, emergency mode', 'message-circle-warning', 'control', [
    ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
    ['path', { d: 'M12 8v4' }],
    ['path', { d: 'M12 16h.01' }],
  ]),
  // ── Globe modes (the left rail) ──
  'mode:CyberCommand': glyph('mode:CyberCommand', 'Intel Watch', 'radar', 'control', [
    ['path', { d: 'M19.07 4.93A10 10 0 0 0 6.99 3.34' }],
    ['path', { d: 'M4 6h.01' }],
    ['path', { d: 'M2.29 9.62A10 10 0 1 0 21.31 8.35' }],
    ['path', { d: 'M16.24 7.76A6 6 0 1 0 8.23 16.67' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M17.99 11.66A6 6 0 0 1 15.77 16.67' }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
    ['path', { d: 'm13.41 10.59 5.66-5.66' }],
  ]),
  'mode:GeoPolitical': glyph('mode:GeoPolitical', 'Geo Political', 'flag', 'control', [
    ['path', { d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528' }],
  ]),
  'mode:EcoNatural': glyph('mode:EcoNatural', 'Eco Natural', 'leaf', 'control', [
    ['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }],
    ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }],
  ]),
  // Hero Watch (D-HW): round 4's proposed glyphs on the sheet, a line each to swap.
  'mode:HeroWatch': glyph('mode:HeroWatch', 'Hero Watch', 'shield-plus', 'control', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M9 12h6' }],
    ['path', { d: 'M12 9v6' }],
  ]),
  // Missions (D-MF, step 5): a flag over a target, the goal a mission is; proposed for the sheet, a line to swap.
  'mode:Missions': glyph('mode:Missions', 'Missions (globe mode)', 'goal', 'control', [
    ['path', { d: 'M12 13V2l8 4-8 4' }],
    ['path', { d: 'M20.561 10.222a9 9 0 1 1-12.55-5.29' }],
    ['path', { d: 'M8.002 9.997a5 5 0 1 0 8.9 2.02' }],
  ]),
  // AI Watch (D-AW, AW5): the owner kept these on 2026-10-12; a line each to swap.
  'mode:AIWatch': glyph('mode:AIWatch', 'AI Watch', 'bot', 'control', [
    ['path', { d: 'M12 8V4H8' }],
    ['rect', { width: 16, height: 12, x: 4, y: 8, rx: 2 }],
    ['path', { d: 'M2 14h2' }],
    ['path', { d: 'M20 14h2' }],
    ['path', { d: 'M15 13v2' }],
    ['path', { d: 'M9 13v2' }],
  ]),
  // Psi Watch (D-PW, PW18): the owner's Set A, 2026-10-26; a line each to swap.
  'mode:PsiWatch': glyph('mode:PsiWatch', 'Psi Watch', 'orbit', 'control', [
    ['path', { d: 'M20.341 6.484A10 10 0 0 1 10.266 21.85' }],
    ['path', { d: 'M3.659 17.516A10 10 0 0 1 13.74 2.152' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['circle', { cx: 19, cy: 5, r: 2 }],
    ['circle', { cx: 5, cy: 19, r: 2 }],
  ]),
  'mode:RaverWatch': mark('mode:RaverWatch', 'Raver Watch', 'raver-headphones', 'control', [
    ['path', { d: 'M5 13v-1a7 7 0 0 1 14 0v1' }],
    ['rect', { x: 3, y: 13, width: 4, height: 6, rx: 2 }],
    ['rect', { x: 17, y: 13, width: 4, height: 6, rx: 2 }],
    ['path', { d: 'M9 21c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5' }],
    ['circle', { cx: 12, cy: 13.5, r: 2 }],
  ]),
  // ── Layers (the sub-rail, quick access, the right rail's overlays) ──
  'layer:IntelReports': glyph('layer:IntelReports', 'Intel Reports', 'file-text', 'control', [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ]),
  'layer:CyberThreats': mark('layer:CyberThreats', 'Cyber Threats', 'chip-warning', 'control', [
    ['rect', { x: 5, y: 5, width: 14, height: 14, rx: 2 }],
    ['path', { d: 'M9 2v3' }],
    ['path', { d: 'M15 2v3' }],
    ['path', { d: 'M9 19v3' }],
    ['path', { d: 'M15 19v3' }],
    ['path', { d: 'M2 9h3' }],
    ['path', { d: 'M2 15h3' }],
    ['path', { d: 'M19 9h3' }],
    ['path', { d: 'M19 15h3' }],
    ['path', { d: 'M12 8.5v4' }],
    ['path', { d: 'M12 15.5h.01' }],
  ]),
  'layer:Satellites': glyph('layer:Satellites', 'Satellites', 'satellite', 'control', [
    ['path', { d: 'm13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5' }],
    ['path', { d: 'M16.5 7.5 19 5' }],
    ['path', { d: 'm17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5' }],
    ['path', { d: 'M9 21a6 6 0 0 0-6-6' }],
    ['path', { d: 'M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z' }],
  ]),
  'layer:CommHubs': glyph('layer:CommHubs', 'Communication Hubs', 'radio-tower', 'control', [
    ['path', { d: 'M4.9 16.1C1 12.2 1 5.8 4.9 1.9' }],
    ['path', { d: 'M7.8 4.7a6.14 6.14 0 0 0-.8 7.5' }],
    ['circle', { cx: 12, cy: 9, r: 2 }],
    ['path', { d: 'M16.2 4.8c2 2 2.26 5.11.8 7.47' }],
    ['path', { d: 'M19.1 1.9a9.96 9.96 0 0 1 0 14.1' }],
    ['path', { d: 'M9.5 18h5' }],
    ['path', { d: 'm8 22 4-11 4 11' }],
  ]),
  'layer:RLSH': glyph('layer:RLSH', 'RLSH (real-life superheroes)', 'shield-user', 'control', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M6.376 18.91a6 6 0 0 1 11.249.003' }],
    ['circle', { cx: 12, cy: 11, r: 4 }],
  ]),
  'layer:DiplomaticEvents': glyph('layer:DiplomaticEvents', 'Diplomatic Events', 'handshake', 'control', [
    ['path', { d: 'm11 17 2 2a1 1 0 1 0 3-3' }],
    ['path', { d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4' }],
    ['path', { d: 'm21 3 1 11h-2' }],
    ['path', { d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3' }],
    ['path', { d: 'M3 4h8' }],
  ]),
  'layer:ResourceZones': glyph('layer:ResourceZones', 'Resource Zones', 'pickaxe', 'control', [
    ['path', { d: 'M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912' }],
    ['path', { d: 'M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393' }],
    ['path', { d: 'M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z' }],
    ['path', { d: 'M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319' }],
  ]),
  'layer:ConflictZones': glyph('layer:ConflictZones', 'Conflict Zones', 'swords', 'control', [
    ['polyline', { points: '14.5 17.5 3 6 3 3 6 3 17.5 14.5' }],
    ['line', { x1: 13, x2: 19, y1: 19, y2: 13 }],
    ['line', { x1: 16, x2: 20, y1: 16, y2: 20 }],
    ['line', { x1: 19, x2: 21, y1: 21, y2: 19 }],
    ['polyline', { points: '14.5 6.5 18 3 21 3 21 6 17.5 9.5' }],
    ['line', { x1: 5, x2: 9, y1: 14, y2: 18 }],
    ['line', { x1: 7, x2: 4, y1: 17, y2: 20 }],
    ['line', { x1: 3, x2: 5, y1: 19, y2: 21 }],
  ]),
  'layer:WarConflict': mark('layer:WarConflict', 'War & Conflict', 'tank', 'control', [
    ['rect', { x: 1.5, y: 14, width: 21, height: 7, rx: 3.5 }],
    ['circle', { cx: 6, cy: 17.5, r: 1 }],
    ['circle', { cx: 12, cy: 17.5, r: 1 }],
    ['circle', { cx: 18, cy: 17.5, r: 1 }],
    ['path', { d: 'M4 14l1.5-4h11l1.5 4' }],
    ['path', { d: 'M8 10V7.5A1.5 1.5 0 0 1 9.5 6h4A1.5 1.5 0 0 1 15 7.5V10' }],
    ['path', { d: 'M15 8h7' }],
  ]),
  'layer:SpaceWeather': mark('layer:SpaceWeather', 'Space Weather', 'ringed-planet', 'control', [
    // The owner's pick in glyph round 6 (2026-10-11), asked for as "something that clearly denotes solar
    // system or space": a planet with its ring, tilted, the ring's far side behind the planet.
    ['circle', { cx: 12, cy: 12, r: 5.5 }],
    ['path', { d: 'M1.5 12a10.5 3 0 0 0 21 0', transform: 'rotate(-20 12 12)' }],
    ['path', { d: 'M1.5 12a10.5 3 0 0 1 5.69-2.67', transform: 'rotate(-20 12 12)' }],
    ['path', { d: 'M16.81 9.33a10.5 3 0 0 1 5.69 2.67', transform: 'rotate(-20 12 12)' }],
  ]),
  'layer:EcologicalDisasters': mark('layer:EcologicalDisasters', 'Ecological Disasters', 'volcano', 'control', [
    ['path', { d: 'M2 21 9 10l1.5 1.5h3L15 10l7 11Z' }],
    ['path', { d: 'M12 7V2.5' }],
    ['path', { d: 'M9.2 6.6 7.4 3.6' }],
    ['path', { d: 'M14.8 6.6l1.8-3' }],
  ]),
  'layer:EarthWeather': glyph('layer:EarthWeather', 'Earth Weather', 'cloud-sun-rain', 'control', [
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }],
    ['path', { d: 'M15.947 12.65a4 4 0 0 0-5.925-4.128' }],
    ['path', { d: 'M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24' }],
    ['path', { d: 'M11 20v2' }],
    ['path', { d: 'M7 19v2' }],
  ]),
  'layer:Lifeboats': glyph('layer:Lifeboats', 'Lifeboats', 'life-buoy', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm4.93 4.93 4.24 4.24' }],
    ['path', { d: 'm14.83 9.17 4.24-4.24' }],
    ['path', { d: 'm14.83 14.83 4.24 4.24' }],
    ['path', { d: 'm9.17 14.83-4.24 4.24' }],
    ['circle', { cx: 12, cy: 12, r: 4 }],
  ]),
  'layer:Relief': glyph('layer:Relief', 'Relief', 'package-plus', 'control', [
    ['path', { d: 'M16 16h6' }],
    ['path', { d: 'M19 13v6' }],
    ['path', { d: 'M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['line', { x1: 12, x2: 12, y1: 22, y2: 12 }],
  ]),
  'layer:PsiLines': glyph('layer:PsiLines', 'Planet lines', 'spline', 'control', [
    ['circle', { cx: 19, cy: 5, r: 2 }],
    ['circle', { cx: 5, cy: 19, r: 2 }],
    ['path', { d: 'M5 17A12 12 0 0 1 17 5' }],
  ]),
  'layer:PsiField': glyph('layer:PsiField', 'Field readings', 'gauge', 'control', [
    ['path', { d: 'm12 14 4-4' }],
    ['path', { d: 'M3.34 19a10 10 0 1 1 17.32 0' }],
  ]),
  'layer:PsiZones': glyph('layer:PsiZones', 'Tested places', 'grid-2x2-check', 'control', [
    ['path', { d: 'M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3' }],
    ['path', { d: 'm16 19 2 2 4-4' }],
  ]),
  // Psi Alerts (PW26, the owner's word): several channels' paths meeting, where Set A's fork had them part.
  'layer:PsiRifts': glyph('layer:PsiRifts', 'Psi Alerts', 'merge', 'control', [
    ['path', { d: 'm8 6 4-4 4 4' }],
    ['path', { d: 'M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22' }],
    ['path', { d: 'm20 22-5-5' }],
  ]),
  'layer:PsiWindows': glyph('layer:PsiWindows', 'Windows', 'hourglass', 'control', [
    ['path', { d: 'M5 22h14' }],
    ['path', { d: 'M5 2h14' }],
    ['path', { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22' }],
    ['path', { d: 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2' }],
  ]),
  'layer:PsiModel': mark('layer:PsiModel', 'ψ field', 'psi', 'control', [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M5 5v4a7 7 0 0 0 14 0V5' }],
    ['path', { d: 'M9 21h6' }],
  ]),
  'layer:MagneticShield': glyph('layer:MagneticShield', 'Magnetic shield', 'shield-half', 'control', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M12 22V2' }],
  ]),
  'layer:AiIncidents': glyph('layer:AiIncidents', 'AI incidents', 'triangle-alert', 'control', [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ]),
  'layer:AiFrontier': glyph('layer:AiFrontier', 'Frontier AI', 'cpu', 'control', [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }],
    ['rect', { x: 9, y: 9, width: 6, height: 6 }],
    ['path', { d: 'M15 2v2' }], ['path', { d: 'M15 20v2' }], ['path', { d: 'M2 15h2' }], ['path', { d: 'M2 9h2' }],
    ['path', { d: 'M20 15h2' }], ['path', { d: 'M20 9h2' }], ['path', { d: 'M9 2v2' }], ['path', { d: 'M9 20v2' }],
  ]),
  'layer:AiWar': glyph('layer:AiWar', 'AI in war', 'crosshair', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 22, x2: 18, y1: 12, y2: 12 }],
    ['line', { x1: 6, x2: 2, y1: 12, y2: 12 }],
    ['line', { x1: 12, x2: 12, y1: 6, y2: 2 }],
    ['line', { x1: 12, x2: 12, y1: 22, y2: 18 }],
  ]),
  'layer:AiSafety': glyph('layer:AiSafety', 'AI safety and security', 'lock-keyhole', 'control', [
    ['circle', { cx: 12, cy: 16, r: 1 }],
    ['rect', { x: 3, y: 10, width: 18, height: 12, rx: 2 }],
    ['path', { d: 'M7 10V7a5 5 0 0 1 10 0v3' }],
  ]),
  'layer:FieldMissions': glyph('layer:FieldMissions', 'Field missions', 'map-pin-check', 'control', [
    ['path', { d: 'M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728' }],
    ['circle', { cx: 12, cy: 10, r: 3 }],
    ['path', { d: 'm16 18 2 2 4-4' }],
  ]),
  // Missions' one section (D-MF, step 5): the clipboard its places wear on the globe, so the rail shows the mark.
  'layer:OpenMissions': glyph('layer:OpenMissions', 'Open missions', 'clipboard-check', 'control', [
    ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'm9 14 2 2 4-4' }],
  ]),
  // Campaigns and Operations in Missions mode (D-RS, RS25): declared, timed pushes, so a megaphone.
  'layer:CampaignsOperations': glyph('layer:CampaignsOperations', 'Campaigns and operations', 'megaphone', 'control', [
    ['path', { d: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z' }],
    ['path', { d: 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14' }],
    ['path', { d: 'M8 6v8' }],
  ]),
  // Safety windows in Missions (D-RR, RR1): a calendar with a heart, the nights people look after one another.
  'layer:SafetyWindows': glyph('layer:SafetyWindows', 'Safety windows', 'calendar-heart', 'control', [
    ['path', { d: 'M3 10h18V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7' }],
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M21.29 14.7a2.43 2.43 0 0 0-2.65-.52c-.3.12-.57.3-.8.53l-.34.34-.35-.34a2.43 2.43 0 0 0-2.65-.53c-.3.12-.56.3-.79.53-.95.94-1 2.53.2 3.74L17.5 22l3.6-3.55c1.2-1.21 1.14-2.8.19-3.74Z' }],
  ]),
  // Civil Unrest in Geo Political (D-CU, CU2): a crowd, for a day of unrest; the megaphone is Campaigns'.
  'layer:CivilUnrest': glyph('layer:CivilUnrest', 'Civil Unrest', 'users-round', 'control', [
    ['path', { d: 'M18 21a8 8 0 0 0-16 0' }],
    ['circle', { cx: 10, cy: 8, r: 5 }],
    ['path', { d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3' }],
  ]),
  // Its protest surges (CU4): a broken ring, a surge in reporting, never the crowd.
  'layer:ProtestSurges': glyph('layer:ProtestSurges', 'Protest surges', 'circle-dashed', 'control', [
    ['path', { d: 'M10.1 2.182a10 10 0 0 1 3.8 0' }],
    ['path', { d: 'M13.9 21.818a10 10 0 0 1-3.8 0' }],
    ['path', { d: 'M17.609 3.721a10 10 0 0 1 2.69 2.7' }],
    ['path', { d: 'M2.182 13.9a10 10 0 0 1 0-3.8' }],
    ['path', { d: 'M20.279 17.609a10 10 0 0 1-2.7 2.69' }],
    ['path', { d: 'M21.818 10.1a10 10 0 0 1 0 3.8' }],
    ['path', { d: 'M3.721 6.391a10 10 0 0 1 2.7-2.69' }],
    ['path', { d: 'M6.391 20.279a10 10 0 0 1-2.69-2.7' }],
  ]),
  'layer:DrugCheckAlerts': glyph('layer:DrugCheckAlerts', 'Drug-check alerts', 'pill', 'control', [
    ['path', { d: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z' }],
    ['path', { d: 'm8.5 8.5 7 7' }],
  ]),
  'layer:SceneIncidents': glyph('layer:SceneIncidents', 'Scene incidents', 'siren', 'control', [
    ['path', { d: 'M7 18v-6a5 5 0 1 1 10 0v6' }],
    ['path', { d: 'M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z' }],
    ['path', { d: 'M21 12h1' }],
    ['path', { d: 'M18.5 4.5 18 5' }],
    ['path', { d: 'M2 12h1' }],
    ['path', { d: 'M12 2v1' }],
    ['path', { d: 'm4.929 4.929.707.707' }],
    ['path', { d: 'M12 12v6' }],
  ]),
  'layer:SceneEvents': mark('layer:SceneEvents', 'Scene events', 'ticket-admit-star', 'control', [
    // The owner's pick in glyph round 6 (2026-10-11): an admission ticket, tilted, its stub torn along a
    // perforation, a star on it. Lucide's ticket did not read as one at 18 px.
    ['path', { d: 'M3.5 7H15a1 1 0 0 0 2 0h3.5A1.5 1.5 0 0 1 22 8.5v7a1.5 1.5 0 0 1-1.5 1.5H17a1 1 0 0 0-2 0H3.5A1.5 1.5 0 0 1 2 15.5v-7A1.5 1.5 0 0 1 3.5 7Z', transform: 'rotate(-18 12 12)' }],
    ['path', { d: 'M16 10v.01M16 12v.01M16 14v.01', transform: 'rotate(-18 12 12)' }],
    ['path', { d: 'm8.5 9.4.8 1.6 1.7.25-1.25 1.2.3 1.7-1.55-.8-1.55.8.3-1.7L6 11.25l1.7-.25Z', transform: 'rotate(-18 12 12)' }],
  ]),
  'layer:HeatRisk': glyph('layer:HeatRisk', 'Heat risk', 'thermometer-sun', 'control', [
    ['path', { d: 'M12 9a4 4 0 0 0-2 7.5' }],
    ['path', { d: 'M12 3v2' }],
    ['path', { d: 'm6.6 18.4-1.4 1.4' }],
    ['path', { d: 'M20 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' }],
    ['path', { d: 'M4 13H2' }],
    ['path', { d: 'M6.34 7.34 4.93 5.93' }],
  ]),
  'layer:RaverMissions': glyph('layer:RaverMissions', 'Raver missions', 'heart-handshake', 'control', [
    ['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }],
    ['path', { d: 'M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66' }],
    ['path', { d: 'm18 15-2-2' }],
    ['path', { d: 'm15 18-2-2' }],
  ]),
  'layer:HarmReductionSites': glyph('layer:HarmReductionSites', 'Harm-reduction sites', 'briefcase-medical', 'control', [
    ['path', { d: 'M12 11v4' }],
    ['path', { d: 'M14 13h-4' }],
    ['path', { d: 'M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2' }],
    ['path', { d: 'M18 6v14' }],
    ['path', { d: 'M6 6v14' }],
    ['rect', { width: 20, height: 14, x: 2, y: 6, rx: 2 }],
  ]),
  'layer:NationalTerritories': glyph('layer:NationalTerritories', 'National territories (overlay)', 'land-plot', 'control', [
    ['path', { d: 'm12 8 6-3-6-3v10' }],
    ['path', { d: 'm8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12' }],
    ['path', { d: 'm6.49 12.85 11.02 6.3' }],
    ['path', { d: 'M17.51 12.85 6.5 19.15' }],
  ]),
  // Zones, with Sectors inside the Zones (ZSP 1.0): a folded map, its panels the Sectors.
  'layer:Zones': glyph('layer:Zones', 'Zones and their Sectors (overlay)', 'map', 'control', [
    ['path', { d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z' }],
    ['path', { d: 'M15 5.764v15' }],
    ['path', { d: 'M9 3.236v15' }],
  ]),
  // Spheres, the domains a language or a community of states reaches: the languages mark.
  'layer:Spheres': glyph('layer:Spheres', 'Spheres of language and influence (overlay)', 'languages', 'control', [
    ['path', { d: 'm5 8 6 6' }],
    ['path', { d: 'm4 14 6-6 2-3' }],
    ['path', { d: 'M2 5h12' }],
    ['path', { d: 'M7 2h1' }],
    ['path', { d: 'm22 22-5-10-5 10' }],
    ['path', { d: 'M14 18h6' }],
  ]),
  'layer:other': glyph('layer:other', 'A layer with no glyph of its own yet (quick access)', 'layers', 'control', [
    ['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z' }],
    ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' }],
    ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' }],
  ]),
  // ── Rail and ticker actions ──
  'action:settings': glyph('action:settings', "Settings (the app's in the header; layers, space weather and the Globe's here)", 'settings', 'control', [
    ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ]),
  'action:globeAppearance': glyph('action:globeAppearance', 'Globe appearance: planet and light', 'sun-moon', 'control', [
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M13 8.129A4 4 0 0 1 15.873 11' }],
    ['path', { d: 'm19 5-1.256 1.256' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'M9 8a5 5 0 1 0 7 7 7 7 0 1 1-7-7' }],
  ]),
  'action:cursorTrail': mark('action:cursorTrail', 'Cursor trail indicator', 'pointer-side-dots', 'control', [
    ['path', { d: 'M3 3l5.2 13 1.9-5.4L15.5 8.7Z' }],
    ['circle', { cx: 15.5, cy: 13, r: 0.9 }],
    ['circle', { cx: 19, cy: 13, r: 0.55 }],
    ['path', { d: 'M22 13h.01' }],
  ]),
  'action:uplink': glyph('action:uplink', 'Starcom Uplink, the browser extension', 'plug-zap', 'control', [
    ['path', { d: 'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z' }],
    ['path', { d: 'm2 22 3-3' }],
    ['path', { d: 'M7.5 13.5 10 11' }],
    ['path', { d: 'M10.5 16.5 13 14' }],
    ['path', { d: 'm18 3-4 4h6l-4 4' }],
  ]),
  'action:watchlist': glyph('action:watchlist', 'Watchlist: watched places and what lands in them (D-WL)', 'scan-eye', 'control', [
    ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
    ['circle', { cx: 12, cy: 12, r: 1 }],
    ['path', { d: 'M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0' }],
  ]),
  'action:story': glyph('action:story', 'Stories: views in an order of your own, each with a caption (D-ST)', 'book-open', 'control', [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ]),
  'action:status': glyph('action:status', 'System status', 'activity', 'control', [
    ['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }],
  ]),
  'action:support': glyph('action:support', 'Support Ops: support the mission', 'hand-heart', 'control', [
    ['path', { d: 'M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16' }],
    ['path', { d: 'm7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9' }],
    ['path', { d: 'm2 15 6 6' }],
    ['path', { d: 'M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z' }],
  ]),
  // ── The header's sound button: it shows the state, and a press changes it ──
  'action:soundOn': glyph('action:soundOn', 'Sound on', 'volume-2', 'control', [
    ['path', { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' }],
    ['path', { d: 'M16 9a5 5 0 0 1 0 6' }],
    ['path', { d: 'M19.364 18.364a9 9 0 0 0 0-12.728' }],
  ]),
  'action:soundOff': glyph('action:soundOff', 'Sound off', 'volume-x', 'control', [
    ['path', { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' }],
    ['line', { x1: 22, x2: 16, y1: 9, y2: 15 }],
    ['line', { x1: 16, x2: 22, y1: 9, y2: 15 }],
  ]),
  // ── Space weather sub-rail ──
  'sw:electricField': glyph('sw:electricField', 'Electric field vectors', 'zap', 'control', [
    ['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }],
  ]),
  'sw:magnetopause': glyph('sw:magnetopause', 'Magnetopause shell', 'magnet', 'control', [
    ['path', { d: 'm6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15' }],
    ['path', { d: 'm5 8 4 4' }],
    ['path', { d: 'm12 15 4 4' }],
  ]),
  'sw:bowShock': mark('sw:bowShock', 'Bow shock shell', 'bow-shock', 'control', [
    ['circle', { cx: 16, cy: 12, r: 3 }],
    ['path', { d: 'M11 3a13 13 0 0 0 0 18' }],
    ['path', { d: 'M3 9h3' }],
    ['path', { d: 'M2 12h3' }],
    ['path', { d: 'M3 15h3' }],
  ]),
  'sw:aurora': mark('sw:aurora', 'Aurora boundary', 'aurora-polar-curtains', 'control', [
    // The owner's pick in round 5 (2026-10-11): the planet, the oval of light round its pole, and the
    // curtains rising from it, the middle one tallest.
    ['circle', { cx: 12, cy: 15.5, r: 6.5 }],
    ['ellipse', { cx: 12, cy: 11, rx: 4.2, ry: 1.3 }],
    ['path', { d: 'M8.6 10.2V6.8' }],
    ['path', { d: 'M12 9.7V3.5' }],
    ['path', { d: 'M15.4 10.2V6.8' }],
  ]),
  // ── RLSH sub-rail ──
  'rlsh:all': glyph('rlsh:all', 'Everyone on record', 'users', 'control', [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
  ]),
  'rlsh:hero': glyph('rlsh:hero', 'Heroes', 'star', 'control', [
    ['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }],
  ]),
  'rlsh:zone_guardian': glyph('rlsh:zone_guardian', 'Zone Guardians', 'shield', 'control', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
  ]),
  'rlsh:rescue_ranger': glyph('rlsh:rescue_ranger', 'Rescue Rangers', 'hand-helping', 'control', [
    ['path', { d: 'M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14' }],
    ['path', { d: 'm7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9' }],
    ['path', { d: 'm2 13 6 6' }],
  ]),
  'rlsh:operating': glyph('rlsh:operating', 'Currently operating', 'circle-dot', 'control', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['circle', { cx: 12, cy: 12, r: 1 }],
  ]),
  'rlsh:register': glyph('rlsh:register', 'Your RLSH card', 'user-plus', 'control', [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
    ['line', { x1: 19, x2: 19, y1: 8, y2: 14 }],
    ['line', { x1: 22, x2: 16, y1: 11, y2: 11 }],
  ]),
  // ── Quick access panels ──
  'panel:node-graph': glyph('panel:node-graph', 'Node Graph', 'network', 'control', [
    ['rect', { x: 16, y: 16, width: 6, height: 6, rx: 1 }],
    ['rect', { x: 2, y: 16, width: 6, height: 6, rx: 1 }],
    ['rect', { x: 9, y: 2, width: 6, height: 6, rx: 1 }],
    ['path', { d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' }],
    ['path', { d: 'M12 12V8' }],
  ]),
  'panel:timeline': glyph('panel:timeline', 'Timeline', 'calendar-range', 'control', [
    ['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M17 14h-6' }],
    ['path', { d: 'M13 18H7' }],
    ['path', { d: 'M7 14h.01' }],
    ['path', { d: 'M17 18h.01' }],
  ]),
  'panel:threat-assessment': glyph('panel:threat-assessment', 'Threat Assessment', 'shield-alert', 'control', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M12 8v4' }],
    ['path', { d: 'M12 16h.01' }],
  ]),
  // ── The Globe's notes (bottom-left) ──
  'note:listening': glyph('note:listening', 'Listening for reports', 'radio', 'note', [
    ['path', { d: 'M16.247 7.761a6 6 0 0 1 0 8.478' }],
    ['path', { d: 'M19.075 4.933a10 10 0 0 1 0 14.134' }],
    ['path', { d: 'M4.925 19.067a10 10 0 0 1 0-14.134' }],
    ['path', { d: 'M7.753 16.239a6 6 0 0 1 0-8.478' }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
  ]),
  'note:network': glyph('note:network', 'Reports from the network', 'satellite-dish', 'note', [
    ['path', { d: 'M4 10a7.31 7.31 0 0 0 10 10Z' }],
    ['path', { d: 'm9 15 3-3' }],
    ['path', { d: 'M17 13a6 6 0 0 0-6-6' }],
    ['path', { d: 'M21 13A10 10 0 0 0 11 3' }],
  ]),
  'note:earlierSession': glyph('note:earlierSession', 'Drawn from an earlier session', 'history', 'note', [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ]),
  'note:matched': glyph('note:matched', 'Matched / showing', 'list-checks', 'note', [
    ['path', { d: 'm3 17 2 2 4-4' }],
    ['path', { d: 'm3 7 2 2 4-4' }],
    ['path', { d: 'M13 6h8' }],
    ['path', { d: 'M13 12h8' }],
    ['path', { d: 'M13 18h8' }],
  ]),
  'note:filtered': glyph('note:filtered', 'Hidden by your priority or lens filter', 'funnel', 'note', [
    ['path', { d: 'M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z' }],
  ]),
  // The owner's pick in glyph round 2 (2026-10-05): a calendar with a clock, a date placed by its time.
  'note:writtenTime': glyph('note:writtenTime', 'Placed by when it was written', 'calendar-clock', 'note', [
    ['path', { d: 'M16 14v2.2l1.6 1' }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5' }],
    ['path', { d: 'M3 10h5' }],
    ['path', { d: 'M8 2v4' }],
    ['circle', { cx: 16, cy: 16, r: 6 }],
  ]),
  'note:untimed': glyph('note:untimed', 'No time, not placed', 'calendar-off', 'note', [
    ['path', { d: 'M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18' }],
    ['path', { d: 'M21 15.5V6a2 2 0 0 0-2-2H9.5' }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M3 10h7' }],
    ['path', { d: 'M21 10h-5.5' }],
    ['path', { d: 'm2 2 20 20' }],
  ]),
  // ── The job rail (new, for review) ──
  'job:findings-publish': mark('job:findings-publish', 'Publishing findings (the outbox)', 'outbox-queued', 'control', [
    ['path', { d: 'M22 14h-6l-2 3h-4l-2-3H2' }],
    ['path', { d: 'M2 14v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4' }],
    ['path', { d: 'm8 7 4-4 4 4' }],
    ['path', { d: 'm8 11 4-4 4 4' }],
  ]),
  'job:publish': glyph('job:publish', 'A reviewed publish: a case position, a Mission Package, a finding', 'stamp', 'control', [
    ['path', { d: 'M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13' }],
    ['path', { d: 'M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z' }],
    ['path', { d: 'M5 22h14' }],
  ]),
  'job:bundle-import': mark('job:bundle-import', 'Importing a bundle', 'bundle-stack-bound', 'control', [
    ['path', { d: 'M7 6V4.5A1.5 1.5 0 0 1 8.5 3h11A1.5 1.5 0 0 1 21 4.5v12a1.5 1.5 0 0 1-1.5 1.5H18' }],
    ['rect', { x: 3, y: 6, width: 15, height: 15, rx: 1.5 }],
    ['path', { d: 'M3 12h15' }],
    ['path', { d: 'M3 15h15' }],
  ]),
  // A shown layer's data on its way (decision D-LS, LS1).
  'job:layer-load': glyph('job:layer-load', 'A layer\'s data, loading', 'cloud-download', 'control', [
    ['path', { d: 'M12 13v8l-4-4' }],
    ['path', { d: 'm12 21 4-4' }],
    ['path', { d: 'M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284' }],
  ]),
} as const satisfies Record<string, GlyphEntry>;

/** Every glyph: the bar's, the rails', the notes', and the second left rail's kit controls (controlGlyphs.ts, plan A1). */
export const GLYPHS = { ...BASE_GLYPHS, ...CONTROL_GLYPHS } as const;

/** A meaning the registry draws. */
export type GlyphName = keyof typeof GLYPHS;
