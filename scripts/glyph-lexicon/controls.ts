/**
 * The rail's control icons, as drafted for the owner's review (critique-2026-11-01 OR1, OR10; plan A1). Each is one
 * button on the second left rail, its face showing its state. Named as draft.ts names icons (lucide:, tabler:,
 * glyph:, draw:). Nothing here is wired: the sheet draws it, the owner picks, and only then does uiSymbols.ts take
 * what was approved.
 */

export interface DraftControl {
  id: string;
  meaning: string;
  icon: string;
  /** The kit or the mode it belongs to. */
  group: string;
}

const c = (group: string, id: string, meaning: string, icon: string): DraftControl => ({ id: `control:${id}`, meaning, icon, group });

export const CONTROL_GROUPS: ReadonlyArray<{ id: string; name: string; covers: string }> = [
  { id: 'points', name: 'Points kit', covers: 'Every layer that marks places: how each mark is drawn, coloured and sized.' },
  { id: 'areas', name: 'Areas kit', covers: 'Every layer that fills or outlines ground.' },
  { id: 'lines', name: 'Lines kit', covers: 'Arcs, routes, cables, tracks.' },
  { id: 'fields', name: 'Fields kit', covers: 'Shells drawn over the whole planet: weather, the e-field, the ψ field.' },
  { id: 'time', name: 'Time kit', covers: "A layer's own window and step, beside the one time bar." },
  { id: 'solar', name: 'Solar kit', covers: "The solar system's scale and what it shows (OR9)." },
  { id: 'inspector', name: 'Inspector', covers: 'What one item offers once clicked (OR16).' },
  { id: 'modes', name: 'Modes’ own', covers: 'The controls only one mode needs.' },
];

export const CONTROLS: readonly DraftControl[] = [
  c('points', 'mark:icon', 'Draw each item as its icon.', 'lucide:shapes'),
  c('points', 'mark:dot', 'Draw each item as a dot.', 'lucide:circle-small'),
  c('points', 'mark:pin', 'Draw each item as a pin: a line up to a flag with its tag.', 'lucide:map-pin'),
  c('points', 'mark:spike', 'Draw each item as a spike, its height the log of its magnitude.', 'lucide:chart-column'),
  c('points', 'colour:kind', 'Colour by what the item is about.', 'lucide:palette'),
  c('points', 'colour:severity', 'Colour by how severe.', 'lucide:signal'),
  c('points', 'colour:age', 'Colour by how old.', 'lucide:clock-arrow-down'),
  c('points', 'colour:source', 'Colour by who reported it.', 'lucide:quote'),
  c('points', 'size:magnitude', 'Size by magnitude.', 'lucide:arrow-up-wide-narrow'),
  c('points', 'size:count', 'Size by how many.', 'lucide:hash'),
  c('points', 'size:none', 'One size for all.', 'lucide:equal'),
  c('points', 'labels', 'Names or values beside the marks.', 'lucide:tag'),
  c('points', 'cluster', 'Fold near marks into a counted icon.', 'lucide:group'),
  c('points', 'filter', 'Show only some kinds.', 'lucide:list-filter'),
  c('points', 'list', 'The items drawn, as a list in the inspector.', 'lucide:list'),
  c('areas', 'fill:solid', 'Fill the ground.', 'lucide:paint-bucket'),
  c('areas', 'fill:hatch', 'Hatch the ground.', 'draw:three parallel diagonal strokes in a square'),
  c('areas', 'fill:outline', 'Outline only.', 'lucide:square-dashed'),
  c('areas', 'opacity', 'How see-through.', 'lucide:blend'),
  c('areas', 'colour:value', 'Colour by a value, on a ramp.', 'lucide:swatch-book'),
  c('lines', 'width:value', 'Width by a value.', 'lucide:move-horizontal'),
  c('lines', 'arrows', 'Arrows along each line, the way it runs.', 'lucide:arrow-right-left'),
  c('lines', 'flow', 'Moving flow along each line.', 'lucide:waves'),
  c('lines', 'dashed', 'Planned or uncertain lines dashed.', 'lucide:route'),
  c('fields', 'look:heat', 'A heat map of the value.', 'lucide:thermometer'),
  c('fields', 'look:contours', 'Lines at fixed steps of the value.', 'lucide:brush'),
  c('fields', 'look:relief', 'The value raised as relief.', 'lucide:mountain'),
  c('fields', 'look:flow', 'The field moving.', 'lucide:wind'),
  c('fields', 'look:arrows', 'Arrows the way the field points.', 'lucide:move-up-right'),
  c('fields', 'look:ripples', 'Ripples across the field.', 'lucide:audio-waveform'),
  c('fields', 'scale:absolute', 'One scale every day.', 'lucide:ruler'),
  c('fields', 'scale:relative', "The scale stretched over today's values.", 'lucide:scaling'),
  c('fields', 'units', 'Units: °C or °F, mm or in.', 'lucide:repeat'),
  c('time', 'window:day', 'The last 24 hours.', 'lucide:clock'),
  c('time', 'window:week', 'The last 7 days.', 'lucide:calendar-days'),
  c('time', 'window:month', 'The last 30 days.', 'lucide:calendar'),
  c('time', 'window:year', 'The last year.', 'lucide:calendar-check'),
  c('time', 'window:all', 'Everything held.', 'lucide:infinity'),
  c('time', 'fade', 'Older items fade.', 'lucide:clock-fading'),
  c('solar', 'scale:true', 'True 1:1: sizes and distances as they are.', 'lucide:scale-3d'),
  c('solar', 'scale:compact', 'Compact: true sizes, distances 1:19.7.', 'lucide:minimize-2'),
  c('solar', 'scale:diagram', 'Diagram: orbits evenly spaced, not to scale.', 'lucide:circle-ellipsis'),
  c('solar', 'scale:sky', 'The sky from a place on the Earth.', 'lucide:telescope'),
  c('solar', 'orbits', 'Orbit lines.', 'lucide:circle-dot-dashed'),
  c('solar', 'moons', 'Moons.', 'lucide:moon'),
  c('solar', 'light', 'True sunlight or flat light.', 'lucide:sun'),
  c('inspector', 'timeline', 'Show it on the time bar.', 'lucide:chart-gantt'),
  c('inspector', 'card', 'Make a card of it.', 'lucide:image'),
  c('inspector', 'compare', 'Compare it, side by side.', 'lucide:columns-2'),
  c('inspector', 'watch', 'Watch this place: ping when more lands here.', 'lucide:bell'),
  c('inspector', 'related', 'Related items, near it and around its time.', 'lucide:link'),
  c('modes', 'conflict:displacement', 'Conflict Zones: people displaced from their homes (UNHCR).', 'lucide:tent'),
  c('modes', 'war:arcs', "War & Conflict: the forces' arcs.", 'lucide:git-branch'),
  c('modes', 'war:deaths', 'War & Conflict: deaths rings.', 'lucide:heart-crack'),
  c('modes', 'war:map', 'War & Conflict: the war map.', 'lucide:map-pinned'),
  c('modes', 'war:theatres', 'War & Conflict: theatres.', 'lucide:layout-grid'),
  c('modes', 'resources:oil', 'Resource Zones: oil.', 'lucide:droplet'),
  c('modes', 'resources:gas', 'Resource Zones: gas.', 'lucide:flame'),
  c('modes', 'resources:renewables', 'Resource Zones: renewables.', 'lucide:wind-arrow-down'),
  c('modes', 'resources:water', 'Resource Zones: water.', 'lucide:glass-water'),
  c('modes', 'resources:minerals', 'Resource Zones: minerals.', 'lucide:gem'),
  c('modes', 'resources:routes', 'Resource Zones: trade routes.', 'lucide:ship'),
  c('modes', 'eco:footprints', 'Eco Disasters: GDACS footprints and tracks.', 'lucide:scan'),
  c('modes', 'eco:plumes', 'Eco Disasters: volcano plumes.', 'lucide:cloud-fog'),
  c('modes', 'eco:depth', "Eco Disasters: a quake's depth beneath the surface.", 'lucide:arrow-down-to-line'),
  // The quake kit's own (D-EQ, EQ12: the owner's picks, 3 Nov).
  c('modes', 'eco:plates', 'Eco Disasters: the plate boundaries beside the quakes (PB2002).', 'lucide:split'),
  c('modes', 'eco:volcanoes', 'Eco Disasters: the volcano catalogue beside the quakes.', 'lucide:mountain-snow'),
  c('modes', 'eco:magnitudes', 'Eco Disasters: only the quakes whose magnitude is in a range.', 'lucide:sliders-horizontal'),
  c('modes', 'eco:depths', 'Eco Disasters: only the quakes whose depth is in a range.', 'lucide:unfold-vertical'),
  // A ping on a new strong quake (D-EQ, EQ19): the bell rings, unlike the inspector's Watch, the bell at rest.
  c('modes', 'eco:ping', 'Eco Disasters: a ping on a new quake of the magnitude chosen or more.', 'lucide:bell-ring'),
  c('modes', 'weather:temperature', 'Earth Weather: colour by temperature.', 'lucide:thermometer-snowflake'),
  c('modes', 'weather:rain', 'Earth Weather: colour by rain.', 'lucide:cloud-rain'),
  c('modes', 'weather:air', 'Earth Weather: colour by air quality.', 'lucide:air-vent'),
  c('modes', 'weather:clouds', 'Earth Weather: real clouds.', 'lucide:cloud'),
  c('modes', 'weather:gauges', 'Earth Weather: river and tide gauges.', 'lucide:droplets'),
  c('modes', 'space:belts', 'Space Weather: the Van Allen belts.', 'draw:two nested crescents round a small disc'),
  c('modes', 'space:cmes', 'Space Weather: CMEs.', 'lucide:sparkle'),
  c('modes', 'space:enlil', 'Space Weather: ENLIL, the solar wind model.', 'lucide:sun-medium'),
  c('modes', 'unrest:events', 'Civil Unrest: the events.', 'lucide:speech'),
  c('modes', 'unrest:surges', 'Civil Unrest: the surges.', 'lucide:trending-up'),
];
