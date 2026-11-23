/**
 * The Starcom Glyph Lexicon, as drafted for the owner's review (D-GV GV0.3, GV1). Nothing here is wired: the sheet
 * (sheet.ts) draws it, the owner picks, and only then does one lexicon module under src/ take what was approved.
 *
 * Each kind answers "what is it?" with its icon. Its frame answers "what sort of thing?" (globe-visuals-overhaul.md,
 * "The ontology"). An icon is named where it comes from:
 *   lucide:<name>     Lucide 0.525 (ISC), as uiSymbols.ts copies it
 *   tabler:<name>     Tabler Icons 3.31.0 (MIT), copied per glyph with credit (GV, "Where new glyphs come from")
 *   glyph:<id>        a glyph already in uiSymbols.ts, Lucide's or one drawn for Starcom
 *   symbol:<id>       a category emblem in symbolRegistry.ts
 *   intel:<variant>   an Intel Report body as the globe draws it
 *   draw:<what>       nothing fits: to be drawn for Starcom, in Lucide's manner
 * `today` is what the globe or the app draws for it now, where that differs from the proposal or is worth seeing beside it.
 */

export type Frame = 'event' | 'asset' | 'area' | 'actor' | 'protective' | 'forecast';

export interface DraftKind {
  id: string;
  meaning: string;
  icon: string;
  frame: Frame;
  modes: readonly string[];
  today?: string;
  note?: string;
  /** A modifier the kind is drawn with: the strike-through of a cancelled thing. */
  modifier?: 'struck';
}

export interface DraftDomain {
  id: string;
  name: string;
  /** What the domain covers, in a sentence. */
  covers: string;
  kinds: readonly DraftKind[];
}

const k = (id: string, meaning: string, icon: string, frame: Frame, modes: readonly string[] = [], extra: { today?: string; note?: string; modifier?: 'struck' } = {}): DraftKind =>
  ({ id, meaning, icon, frame, modes, ...extra });

export const FRAMES: Readonly<Record<Frame, { shape: string; says: string }>> = {
  event: { shape: 'a disc', says: 'it happened' },
  asset: { shape: 'a rounded square', says: 'it stands there: a facility, a site, a craft' },
  area: { shape: 'a hexagon', says: 'it covers ground' },
  actor: { shape: 'a diamond', says: 'someone acts: a force, a group, a source' },
  protective: { shape: 'a shield', says: 'a protective or safety resource' },
  forecast: { shape: 'an open ring', says: 'a forecast or a prediction, not yet happened' },
};

export const DOMAINS: readonly DraftDomain[] = [
  {
    id: 'conflict', name: 'Conflict & security', covers: 'Armed conflict, the forces in it, what it does to people, and the politics around it.',
    kinds: [
      k('conflict:kinetic:airstrike', 'An air strike or bombing from the air.', 'lucide:bomb', 'event', ['WarConflict'], { today: 'lucide:bomb', note: "Today one glyph, 'strike', stands for air strikes, shelling, explosions and missiles (W2 splits them)." }),
      k('conflict:kinetic:drone-strike', 'A strike by an armed drone.', 'lucide:drone', 'event', ['WarConflict'], { today: 'lucide:bomb' }),
      k('conflict:kinetic:missile', 'A missile or rocket fired or striking.', 'draw:a missile on the diagonal: slim body, four fins, a short exhaust', 'event', ['WarConflict'], { today: 'lucide:bomb', note: "Neither Lucide nor Tabler has one; Lucide's rocket reads as a space launch." }),
      k('conflict:kinetic:shelling', 'Artillery or mortar fire.', 'draw:a shell arcing down into a three-line burst', 'event', ['WarConflict'], { today: 'lucide:bomb' }),
      k('conflict:kinetic:explosion', 'An explosion whose cause is not stated.', 'draw:a burst: eight short rays round an open centre', 'event', ['WarConflict'], { today: 'lucide:bomb' }),
      k('conflict:kinetic:ground-fighting', 'Fighting on the ground between armed forces.', 'glyph:layer:ConflictZones', 'event', ['WarConflict', 'ConflictZones'], { today: 'lucide:swords', note: 'The Conflict Zones layer and the conflict emblem draw the same swords.' }),
      k('conflict:kinetic:shooting', 'A shooting or sniper fire.', 'draw:a pistol in profile, barrel right', 'event', ['WarConflict'], { today: 'lucide:swords', note: "Lucide's crosshair is AI in war's; no gun in either set." }),
      k('conflict:kinetic:naval', 'A clash or attack at sea.', 'lucide:ship', 'event', ['WarConflict'], { today: 'lucide:ship' }),
      k('conflict:kinetic:shootdown', 'An aircraft or drone shot down.', 'tabler:plane-off', 'event', ['WarConflict'], { today: 'lucide:bomb' }),
      k('conflict:forces:troops', 'Troops deployed, massing or withdrawing.', 'tabler:helmet', 'actor', ['WarConflict', 'ConflictZones'], { today: 'lucide:shield', note: "The shield is the protective frame's own shape, and Zone Guardians'." }),
      k('conflict:forces:armour', 'Tanks and armoured vehicles.', 'glyph:layer:WarConflict', 'actor', ['WarConflict'], { note: "The same tank as the War & Conflict layer's own glyph." }),
      k('conflict:forces:aircraft', 'Military aircraft: sorties, patrols, incursions into airspace.', 'lucide:plane', 'actor', ['WarConflict']),
      k('conflict:forces:helicopter', 'Military helicopters.', 'tabler:helicopter', 'actor', ['WarConflict']),
      k('conflict:forces:navy', 'Warships and naval deployments.', 'lucide:ship', 'actor', ['WarConflict'], { note: 'One ship: a disc for a clash at sea, a diamond for a fleet on the move.' }),
      k('conflict:forces:submarine', 'Submarines.', 'tabler:submarine', 'actor', ['WarConflict']),
      k('conflict:forces:convoy', 'Forces on the move: a convoy, a column, a redeployment.', 'lucide:truck', 'actor', ['WarConflict']),
      k('conflict:effects:captives', 'Hostages, prisoners of war or detentions.', 'tabler:prison', 'event', ['WarConflict'], { today: 'lucide:lock', note: "Lucide's lock is close to AI safety's lock-keyhole." }),
      k('conflict:effects:displacement', 'People forced from their homes: refugees, evacuations, camps.', 'lucide:tent', 'event', ['WarConflict', 'Relief', 'ConflictZones']),
      k('conflict:effects:mass-violence', 'Mass violence against civilians (GDELT root code 20).', 'lucide:skull', 'event', ['ConflictZones', 'WarConflict']),
      k('conflict:politics:coercion', 'Coercion: threats, blockades, seizures, force shown (GDELT root codes 15 and 17).', 'lucide:octagon-x', 'event', ['ConflictZones']),
      k('conflict:effects:humanitarian', 'Humanitarian need or response in a conflict.', 'lucide:heart', 'event', ['WarConflict'], { today: 'lucide:heart' }),
      k('conflict:politics:ceasefire', 'A ceasefire or truce, agreed or broken.', 'tabler:peace', 'event', ['WarConflict'], { today: 'lucide:handshake' }),
      k('conflict:politics:talks', 'Talks, mediation or a peace deal.', 'glyph:layer:DiplomaticEvents', 'event', ['WarConflict', 'DiplomaticEvents'], { today: 'lucide:handshake' }),
      k('conflict:politics:nuclear', 'A nuclear threat, a test, or an incident at a nuclear site.', 'lucide:radiation', 'event', ['WarConflict'], { today: 'lucide:radiation' }),
      k('conflict:politics:warning', 'A warning: airspace, travel, an emergency.', 'lucide:triangle-alert', 'event', ['WarConflict'], { today: 'lucide:triangle-alert' }),
      k('conflict:report', 'Another report about a conflict.', 'lucide:newspaper', 'event', ['WarConflict'], { today: 'lucide:newspaper' }),
    ],
  },
  {
    id: 'cyber', name: 'Cyber', covers: "Attacks and hostile hosts on the internet, and the internet's own physical places.",
    kinds: [
      k('cyber:threat:botnet', "A botnet's command server.", 'lucide:server-cog', 'actor', ['CyberThreats']),
      k('cyber:threat:malware', 'A host serving malware.', 'lucide:bug', 'actor', ['CyberThreats']),
      k('cyber:threat:phishing', 'A phishing site.', 'lucide:fish', 'actor', ['CyberThreats']),
      k('cyber:threat:scanner', 'A host scanning the internet for weak services.', 'lucide:scan-search', 'actor', ['CyberThreats']),
      k('cyber:threat:spam', 'A source of spam.', 'lucide:mail-warning', 'actor', ['CyberThreats']),
      k('cyber:attack:ddos', 'A denial-of-service attack.', 'lucide:server-crash', 'event', ['CyberThreats']),
      k('cyber:attack:ransomware', 'A ransomware attack.', 'lucide:file-lock', 'event', ['CyberThreats']),
      k('cyber:attack:breach', 'A data breach or leak.', 'lucide:database-zap', 'event', ['CyberThreats']),
      k('cyber:attack:outage', 'A major outage of a network or service.', 'lucide:unplug', 'event', ['CyberThreats', 'CommHubs']),
      k('cyber:infra:data-centre', 'A data centre.', 'lucide:server', 'asset', ['CommHubs']),
      k('cyber:infra:exchange', 'An internet exchange point.', 'lucide:router', 'asset', ['CommHubs']),
      k('cyber:infra:cable-landing', 'Where a submarine cable comes ashore.', 'lucide:cable', 'asset', ['CommHubs']),
    ],
  },
  {
    id: 'space', name: 'Space', covers: 'What orbits, what the Sun throws at the Earth, and what falls in.',
    kinds: [
      k('space:satellite:station', 'A crewed space station.', 'draw:a hub with two pairs of solar panels', 'asset', ['Satellites']),
      k('space:satellite:communications', 'A communications satellite.', 'lucide:antenna', 'asset', ['Satellites']),
      k('space:satellite:navigation', 'A navigation satellite: GPS, Galileo, GLONASS, BeiDou.', 'lucide:locate-fixed', 'asset', ['Satellites']),
      k('space:satellite:weather', 'A weather satellite.', 'lucide:cloud-sun', 'asset', ['Satellites']),
      k('space:satellite:observation', 'An Earth-observation satellite.', 'lucide:scan-eye', 'asset', ['Satellites']),
      k('space:satellite:science', 'A science mission.', 'lucide:telescope', 'asset', ['Satellites']),
      k('space:satellite:military', 'A military satellite.', 'lucide:shield-half', 'asset', ['Satellites']),
      k('space:satellite:other', 'Any other satellite, or one whose role is not known.', 'glyph:layer:Satellites', 'asset', ['Satellites'], { note: "The Satellites layer's own glyph." }),
      k('space:satellite:debris', 'Debris: a spent stage or a fragment.', 'draw:three small shards scattered on a short arc', 'asset', ['Satellites']),
      k('space:object:launch', 'A rocket launch.', 'lucide:rocket', 'event', ['Satellites']),
      k('space:object:reentry', 'A spacecraft or debris coming back through the atmosphere.', 'tabler:comet', 'event', ['Satellites']),
      k('space:object:meteor', 'A bright meteor or fireball.', 'tabler:meteor', 'event', ['EcologicalDisasters']),
      k('space:sun:flare', 'A solar flare.', 'lucide:sun', 'event', ['SpaceWeather']),
      k('space:sun:cme', 'A coronal mass ejection leaving the Sun.', 'draw:the Sun\'s limb with a loop thrown off it', 'event', ['SpaceWeather']),
      k('space:sun:cme-arrival', "A CME's forecast arrival at the Earth.", 'draw:the Sun\'s limb with a loop thrown off it', 'forecast', ['SpaceWeather'], { note: 'The same mark as the CME, in the forecast\'s open ring.' }),
      k('space:field:geomagnetic-storm', 'A geomagnetic storm, Kp 5 or more.', 'draw:the Earth with its field lines buckled on one side', 'event', ['SpaceWeather']),
      k('space:field:aurora', 'The aurora, where it is seen.', 'glyph:sw:aurora', 'area', ['SpaceWeather']),
      k('space:field:e-field', 'The electric field at the ground.', 'glyph:sw:electricField', 'area', ['SpaceWeather']),
      k('space:field:magnetopause', "The magnetopause, the edge of the Earth's field.", 'glyph:sw:magnetopause', 'area', ['SpaceWeather']),
      k('space:field:bow-shock', 'The bow shock, where the solar wind meets the field.', 'glyph:sw:bowShock', 'area', ['SpaceWeather']),
      k('space:field:belts', 'The radiation belts.', 'lucide:orbit', 'area', ['SpaceWeather']),
    ],
  },
  {
    id: 'infra', name: 'Infrastructure', covers: 'What powers, moves and connects places.',
    kinds: [
      k('infra:energy:power-plant', 'A power plant burning coal, gas or oil.', 'lucide:factory', 'asset', ['ResourceZones']),
      k('infra:energy:nuclear', 'A nuclear power plant.', 'lucide:atom', 'asset', ['ResourceZones']),
      k('infra:energy:wind', 'A wind farm.', 'tabler:wind-electricity', 'asset', ['ResourceZones']),
      k('infra:energy:solar', 'A solar farm.', 'tabler:solar-panel', 'asset', ['ResourceZones']),
      k('infra:energy:hydro', 'A dam or hydroelectric plant.', 'lucide:dam', 'asset', ['ResourceZones']),
      k('infra:energy:oil-gas', 'An oil or gas field, refinery or terminal.', 'lucide:fuel', 'asset', ['ResourceZones']),
      k('infra:energy:grid', 'The power grid: a substation or a major line.', 'lucide:utility-pole', 'asset', ['ResourceZones']),
      k('infra:energy:pipeline', 'A pipeline.', 'draw:a pipe run with two flanged joints', 'asset', ['ResourceZones']),
      k('infra:transport:port', 'A seaport.', 'lucide:anchor', 'asset', ['CommHubs']),
      k('infra:transport:airport', 'An airport.', 'lucide:plane-landing', 'asset', ['CommHubs']),
      k('infra:transport:rail', 'A railway station or line.', 'lucide:train-front', 'asset', ['CommHubs']),
      k('infra:transport:bridge', 'A bridge.', 'tabler:building-bridge', 'asset', ['CommHubs']),
      k('infra:comms:tower', 'A broadcast or mobile tower.', 'glyph:layer:CommHubs', 'asset', ['CommHubs'], { note: "The Communication Hubs layer's own glyph." }),
    ],
  },
  {
    id: 'earth', name: 'Earth & hazards', covers: 'What the ground, the sea and the sky do, and what people do to them.',
    kinds: [
      k('earth:geo:earthquake', 'An earthquake.', 'lucide:audio-waveform', 'event', ['EcologicalDisasters'], { note: "Lucide's activity, the closer trace, is System status's." }),
      k('earth:geo:volcano', 'A volcano erupting or restless.', 'glyph:layer:EcologicalDisasters', 'event', ['EcologicalDisasters'], { note: "The layer's own volcano, drawn for Starcom; Tabler has one too." }),
      k('earth:geo:tsunami', 'A tsunami.', 'lucide:waves', 'event', ['EcologicalDisasters']),
      k('earth:geo:landslide', 'A landslide or mudslide.', 'draw:a slope with three stones tumbling down it', 'event', ['EcologicalDisasters']),
      k('earth:weather:storm', 'A severe thunderstorm.', 'lucide:cloud-lightning', 'event', ['EarthWeather']),
      k('earth:weather:cyclone', 'A tropical cyclone: a hurricane or a typhoon.', 'tabler:storm', 'event', ['EarthWeather', 'EcologicalDisasters']),
      k('earth:weather:cyclone-track', "A cyclone's forecast track.", 'tabler:storm', 'forecast', ['EarthWeather', 'EcologicalDisasters']),
      k('earth:weather:tornado', 'A tornado.', 'lucide:tornado', 'event', ['EarthWeather']),
      k('earth:weather:flood', 'A flood.', 'draw:a house up to its door in two water lines', 'event', ['EcologicalDisasters']),
      k('earth:weather:drought', 'A drought.', 'tabler:droplet-off', 'area', ['EcologicalDisasters']),
      k('earth:weather:heat', 'Extreme heat.', 'lucide:thermometer', 'area', ['EarthWeather'], { note: "The thermometer with the sun is heat risk to people; this is the weather, as the cold's thermometer is." }),
      k('earth:weather:cold', 'Extreme cold.', 'lucide:thermometer-snowflake', 'area', ['EarthWeather']),
      k('earth:weather:snow', 'Heavy snow or a blizzard.', 'lucide:snowflake', 'event', ['EarthWeather']),
      k('earth:weather:rain', 'Heavy rain.', 'lucide:cloud-rain', 'event', ['EarthWeather']),
      k('earth:fire:wildfire', 'A wildfire.', 'lucide:flame', 'event', ['EcologicalDisasters']),
      k('earth:env:spill', 'An oil or chemical spill.', 'tabler:barrel', 'event', ['EcologicalDisasters']),
      k('earth:env:pollution', 'Air pollution or smog.', 'lucide:cloud-fog', 'area', ['EcologicalDisasters']),
      k('earth:env:deforestation', 'Forest lost to clearing or fire.', 'draw:two pines and a stump', 'area', ['EcologicalDisasters']),
    ],
  },
  {
    id: 'health', name: 'Health & harm reduction', covers: 'Disease, drugs, heat, and the places that keep people safe.',
    kinds: [
      k('health:disease:outbreak', 'A disease outbreak.', 'lucide:biohazard', 'event', ['EcologicalDisasters', 'IntelReports']),
      k('health:drugs:lab-alert', "A drug-checking lab's warning about a substance.", 'lucide:flask-conical', 'event', ['DrugCheckAlerts'], { today: 'lucide:flask-conical' }),
      k('health:drugs:report', 'A report about drugs at an event.', 'glyph:layer:DrugCheckAlerts', 'event', ['DrugCheckAlerts'], { today: 'lucide:pill', note: "The Drug-check alerts layer's own glyph." }),
      k('health:place:harm-reduction', 'A harm-reduction site.', 'glyph:layer:HarmReductionSites', 'protective', ['HarmReductionSites']),
      k('health:place:clinic', 'A clinic or hospital.', 'lucide:hospital', 'protective', ['Relief']),
      k('health:place:water', 'Safe drinking water.', 'lucide:glass-water', 'protective', ['RaverWatch', 'Relief']),
      k('health:heat:risk', 'Heat risk to people, by place.', 'glyph:layer:HeatRisk', 'area', ['HeatRisk'], { today: 'lucide:thermometer', note: "Raver Watch's heat glyph today is the plain thermometer, which the lexicon gives to extreme heat." }),
    ],
  },
  {
    id: 'society', name: 'Society & civic', covers: 'What people do together and to each other: votes, courts, rights, rescue and the scene.',
    kinds: [
      k('society:civic:protest', 'A protest, a strike or civil unrest.', 'tabler:speakerphone', 'event', ['WarConflict', 'IntelReports', 'CivilUnrest', 'ConflictZones'], { today: 'lucide:megaphone', note: "Lucide's megaphone is Campaigns and operations'." }),
      k('society:unrest:riot', 'A riot: violence or arson in unrest.', 'lucide:flame', 'event', ['CivilUnrest', 'ConflictZones']),
      k('society:unrest:strike', 'A strike or a walkout.', 'lucide:hand', 'event', ['CivilUnrest']),
      k('society:unrest:crackdown', 'A crackdown: force used on protesters, arrests en masse.', 'lucide:shield-ban', 'event', ['CivilUnrest', 'ConflictZones']),
      k('society:unrest:curfew', 'A curfew or a state of emergency.', 'lucide:clock-alert', 'event', ['CivilUnrest']),
      k('society:unrest:surge', 'A surge: protests rising week on week in a country (OR5).', 'lucide:trending-up', 'area', ['CivilUnrest']),
      k('society:civic:election', 'An election or a referendum.', 'lucide:vote', 'event', ['DiplomaticEvents', 'IntelReports']),
      k('society:civic:court', 'A court ruling or a trial.', 'lucide:gavel', 'event', ['DiplomaticEvents', 'IntelReports']),
      k('society:rights:shutdown', 'An internet or phone shutdown.', 'lucide:wifi-off', 'event', ['WarConflict', 'CyberThreats'], { today: 'lucide:wifi-off' }),
      k('society:rights:censorship', 'Censorship or a press freedom case.', 'lucide:eye-off', 'event', ['IntelReports']),
      k('society:aid:relief', 'Relief: aid delivered or appealed for.', 'glyph:layer:Relief', 'protective', ['Relief']),
      k('society:aid:charity', 'A charity at work.', 'symbol:intel-category:charity', 'actor', ['IntelReports']),
      k('society:rescue:lifeboat', 'A lifeboat station, or a launch.', 'glyph:layer:Lifeboats', 'protective', ['Lifeboats']),
      k('society:rescue:rlsh', 'A real-life superhero on record.', 'glyph:layer:RLSH', 'actor', ['RLSH']),
      k('society:scene:incident', 'An incident at a party or festival.', 'glyph:layer:SceneIncidents', 'event', ['SceneIncidents'], { today: 'lucide:triangle-alert' }),
      k('society:scene:violence', 'Violence or a threat at an event.', 'lucide:octagon-alert', 'event', ['SceneIncidents'], { today: 'lucide:shield-alert', note: "The shield with a bang is Threat Assessment's panel and the cyber emblem's." }),
      k('society:scene:crowd', 'A crowd risk: a crush, overcrowding.', 'lucide:users', 'event', ['SceneIncidents'], { today: 'lucide:users', note: "RLSH's 'Everyone on record' shares it." }),
      k('society:scene:closure', 'A venue closed or raided.', 'lucide:door-closed', 'event', ['SceneEvents'], { today: 'lucide:ban', note: 'The ban is sanctions\'.' }),
      k('society:scene:event', 'A party, a festival, a night out.', 'glyph:layer:SceneEvents', 'event', ['SceneEvents'], { today: 'lucide:music' }),
      k('society:scene:cancelled', 'An event cancelled.', 'glyph:layer:SceneEvents', 'event', ['SceneEvents'], { today: 'lucide:music', modifier: 'struck', note: "The event's ticket with the grammar's strike-through, as today's music note is struck through." }),
    ],
  },
  {
    id: 'economy', name: 'Economy & resources', covers: 'Money, trade, the rules on both, and what the ground gives.',
    kinds: [
      k('economy:money:funding', 'Funding: a grant, an investment, a budget.', 'symbol:intel-category:funding', 'event', ['IntelReports']),
      k('economy:trade:shipping', 'Trade and shipping.', 'lucide:container', 'event', ['DiplomaticEvents']),
      k('economy:policy:sanctions', 'Sanctions or export controls.', 'lucide:ban', 'event', ['WarConflict', 'DiplomaticEvents'], { today: 'lucide:ban' }),
      k('economy:market:prices', 'Prices moving: food, fuel, currency.', 'lucide:trending-up', 'event', ['IntelReports']),
      k('economy:resources:minerals', 'Minerals and mining.', 'glyph:layer:ResourceZones', 'area', ['ResourceZones']),
      k('economy:resources:oil-gas', 'Oil and gas reserves.', 'lucide:fuel', 'area', ['ResourceZones'], { note: 'One pump: a square for the facility, a hexagon for the field.' }),
      k('economy:resources:water', 'Water: rivers, aquifers, scarcity.', 'lucide:droplets', 'area', ['ResourceZones']),
      k('economy:resources:food', 'Food and farming.', 'lucide:wheat', 'area', ['ResourceZones']),
    ],
  },
  {
    id: 'ai', name: 'AI & technology', covers: "AI's makers, uses and harms, as Mecha Jono's AI Watch reports them.",
    kinds: [
      k('ai:frontier:chips', 'Chips and compute.', 'glyph:layer:AiFrontier', 'asset', ['AiFrontier']),
      k('ai:frontier:models', 'Models and the labs that make them.', 'lucide:brain-circuit', 'actor', ['AiFrontier']),
      k('ai:frontier:robots', 'Robots.', 'tabler:robot', 'asset', ['AiFrontier'], { note: "Lucide's bot is AI Watch's own glyph." }),
      k('ai:war:military', 'AI in war: targeting, drones, command.', 'glyph:layer:AiWar', 'event', ['AiWar']),
      k('ai:harm:incident', 'An AI incident: harm done by a system.', 'lucide:bot-off', 'event', ['AiIncidents'], { today: 'lucide:triangle-alert', note: 'The triangle is the general warning\'s.' }),
      k('ai:harm:deepfake', 'A deepfake or synthetic media.', 'lucide:scan-face', 'event', ['AiIncidents']),
      k('ai:harm:surveillance', 'Surveillance: face recognition, tracking.', 'lucide:cctv', 'event', ['AiIncidents']),
      k('ai:society:jobs', 'Work and jobs changed by AI.', 'lucide:briefcase', 'event', ['AiFrontier']),
      k('ai:safety:security', 'AI safety and security.', 'glyph:layer:AiSafety', 'protective', ['AiSafety']),
      k('ai:safety:law', 'Law and regulation of AI.', 'lucide:scale', 'event', ['AiSafety']),
    ],
  },
  {
    id: 'work', name: 'Missions & work', covers: 'What Starcom people do: missions and their steps, the roster, and the reports they rest on.',
    kinds: [
      k('work:mission:mission', 'A mission.', 'glyph:app:teamworkspace', 'event', ['Missions']),
      k('work:mission:open', 'A mission open to take, at its place.', 'glyph:layer:OpenMissions', 'event', ['OpenMissions']),
      k('work:mission:field', 'A field mission, safety limits stated.', 'glyph:layer:FieldMissions', 'event', ['FieldMissions']),
      k('work:mission:step', "A step of a mission, taken by a team.", 'lucide:square-check-big', 'event', ['Missions'], { note: "Lucide's list-checks is the note 'Matched'." }),
      k('work:roster:campaign', 'A campaign.', 'glyph:layer:CampaignsOperations', 'actor', ['CampaignsOperations']),
      k('work:roster:operation', 'An operation.', 'lucide:route', 'actor', ['CampaignsOperations']),
      k('work:roster:cause', 'A cause: a concern people work toward.', 'lucide:compass', 'area', ['Missions']),
      k('work:roster:initiative', 'An initiative: a problem and its first step.', 'lucide:lightbulb', 'actor', ['Missions']),
      k('work:roster:story', 'A story: the account of a piece of work.', 'lucide:book-open', 'event', ['Missions']),
      k('work:roster:saga', 'A saga: the stories of a place, a phenomenon or a group.', 'lucide:library', 'area', ['Missions']),
      k('work:roster:epic', 'An epic: a long effort grown from an initiative.', 'lucide:milestone', 'actor', ['Missions']),
      k('work:intel:report', 'An Intel Report.', 'glyph:layer:IntelReports', 'event', ['IntelReports'], { today: 'intel:raw', note: 'The globe draws a report as a page whose marks say how it was assessed; nearly every report today is the blank, unassessed page.' }),
      k('work:intel:observation', "A NavCom operator's field observation.", 'lucide:binoculars', 'event', ['IntelReports']),
      k('work:intel:finding', 'A finding: a claim with its evidence and weight.', 'lucide:search-check', 'event', ['IntelReports']),
      k('work:intel:package', 'A Mission Package.', 'lucide:package-check', 'asset', ['Missions'], { note: "The plain package is Diplomacy's material cooperation." }),
    ],
  },
];
