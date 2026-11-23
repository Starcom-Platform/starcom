/**
 * ZSP 2.0: the twelve Terrae on the 0.1° grid, their edges, Zones and Sectors (decision D-ZR, ZR5–ZR7, ZR16, ZR19,
 * ZR20; docs/missions/01-architecture-decisions/zones-reslice.md). Writes the Terrae marked `build`.
 *
 *   npx tsx scripts/zones/build-terrae.ts <data dir> <out dir> [--test-maria=<scratch dir>] [--maria=<labels dir>]
 *
 * Reads Stage 1's container raster (data/zsp2/containers/) for the land side, and from the data dir:
 *   ne/ (Natural Earth land and lakes, public domain), etopo/etopo2022-0.1.i16 (ETOPO 2022, CC0);
 *   pb2002/PB2002_plates.json (Bird 2003, through Ahlenius's conversion, ODC-BY 1.0): the plates;
 *   usgs-world/WEP_PRVG/WEP_PRVG (Geologic Provinces of the World, 2000; Osmonson, Persits, Steinshouer and Klett,
 *   USGS, public domain): the provinces the Zones are made of;
 *   resolve/Ecoregions2017 (RESOLVE, CC BY 4.0); ne-physical/ (Natural Earth's regions and seas, public domain).
 *
 * Every province is given a Terra, so a Zone (whole provinces) is never split by a Terra's edge (ZR5). A province
 * that straddles a line the owner drew is split by that line's rule: by plate (the Red Sea, the Mediterranean
 * east of Sicily), the Suez line (ZR19), the Ural River (ZR20), the Caspian's water to Tethyana, or the median
 * (the Black Sea, ZR20). A province no Zone names takes its plate's Terra. Then, over the provinces: ZR19's islands
 * (Malta to Europaea, a margin of shallow water with it), water cut off from its Terra's land joined to the Terra
 * it borders most, and any cell in no province given its nearest.
 *
 * The Maria are Mecha Jono's (ZR16): their labels, in data/zsp2/maria/ (maria.ts), are traced in the same pass as
 * the Terrae, so every coast is one edge. Until they land, --test-maria cuts test Maria from Stage 1 and writes them
 * to a scratch folder, so the whole set's checks run; the served set then holds the Terrae alone.
 *
 * Since the swap (ZR8, ZR25) the partition is written where it is served, public/geopolitical/zones/, with the 1.0
 * Zones it retired listed in its manifest (RETIRED).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  W, H, CELL, latOf, lonOf, colOf, rowOf, cellKm2, newMask, fillRings, fillGeoJson, polygonsOf, forEachShape,
  components, writePng, type Ring,
} from './grid';
import { cutSectors, neighbours, SECTOR_MIN_KM2, SECTOR_MAX_KM2 } from './sectors';
import { describeSectors, containerDoc, type EdgeOut, type ZspSourceOut } from './terra-file';
import { traceArcs, COARSE_TOLERANCE } from './vectorise';
import { readMaria, syntheticMaria, mariaDocs, mariaZoneIds } from './maria';
import { checkPartition } from '../../src/geopolitical/zones/zspChecks';

/** Where the partition is written: the served set (ZR8, ZR25). */
const ZONES_DIR = 'public/geopolitical/zones';

/**
 * The 1.0 Zones the swap retired (ZR8), each with the 2.0 Zones that now hold its place, largest share first, as
 * scripts/zones/retired-coverage.ts measures them (ZR28): a Zone holding 5% of it, or 1% of it with a tenth of the
 * Zone itself inside it. The other six 1.0 ids are 2.0 Zones of their own.
 */
const RETIRED: Array<{ id: string; name: string; covered_by: string[] }> = [
  { id: 'zone:bahia-coast-reconcavo', name: 'Bahia Coast and Recôncavo Zone', covered_by: ['zone:brazilian-shield', 'zone:east-brazilian-margin'] },
  { id: 'zone:central-american-dry-corridor', name: 'Central American Dry Corridor Zone', covered_by: ['zone:central-america'] },
  { id: 'zone:golden-triangle', name: 'Golden Triangle Zone', covered_by: ['zone:shan-tenasserim', 'zone:malay-peninsula', 'zone:annamite-khorat'] },
  {
    id: 'zone:ring-of-fire', name: 'Pacific Ring of Fire Zone', covered_by: [
      'zone:andes', 'zone:alaska-bering', 'zone:izu-bonin-mariana', 'zone:sunda-arc', 'zone:tonga-kermadec', 'zone:melanesian-arcs',
      'zone:wallacea', 'zone:philippines', 'zone:japan', 'zone:new-guinea-highlands', 'zone:basin-and-range', 'zone:pacific-coast',
      'zone:sierras-madres', 'zone:pacific-forearc', 'zone:central-america', 'zone:new-zealand', 'zone:galapagos',
      'zone:east-china-sea-taiwan', 'zone:cordillera', 'zone:arafura-papua', 'zone:philippine-sea', 'zone:kamchatka-koryak',
      'zone:northern-andes',
    ],
  },
  {
    id: 'zone:sahel', name: 'Sahel Zone', covered_by: [
      'zone:central-african-rifts', 'zone:reguibat-taoudeni', 'zone:tuareg-shield', 'zone:senegal-basin', 'zone:leo-man', 'zone:nubian-shield',
    ],
  },
];

interface ZoneDef { slug: string; name: string; system: string; provinces: string[]; rgb: [number, number, number] }
interface TerraDef { slug: string; name: string; build: boolean; plates: string[]; principle?: string; zones?: ZoneDef[] }

const TERRAE: TerraDef[] = [
  {
    slug: 'africana', name: 'Terra Africana', build: true, plates: ['Africa', 'Somalia'],
    principle: 'Africa to its continental margin, with Madagascar and the Seychelles: the African and Somali plates\' land and seas, ending at the Gulf of Suez and the isthmus, the Sicily Channel and the Strait of Gibraltar (ZR19).',
    zones: [
      { slug: 'atlas', name: 'Atlas', system: 'orogen', provinces: ['Atlas Uplift', 'Atlas Basin', 'Rif Basin', 'Tellian Uplift', 'Tellian Foredeep', 'Hauts Basin', 'Guercif Basin', 'Rabat Basin', 'Essaouni Basin'], rgb: [196, 120, 92] },
      { slug: 'reguibat-taoudeni', name: 'Reguibat and Taoudeni', system: 'basin', provinces: ['Taoudeni Basin', 'Reguibate Uplift', 'Tindouf Basin', 'Ougarta Uplift', 'Aaiun-Tarfaya Basin', 'Reggane Basin'], rgb: [226, 190, 120] },
      { slug: 'senegal-basin', name: 'Senegal Basin', system: 'basin', provinces: ['Senegal', 'Baffa'], rgb: [170, 196, 110] },
      { slug: 'leo-man', name: 'Leo–Man Shield and the Guinea Coast', system: 'shield', provinces: ['West African Shield', 'Volta', 'Gulf of Guinea', 'West African Coastal'], rgb: [96, 160, 104] },
      { slug: 'saharan-basins', name: 'Ghadames, Illizi and Murzuq', system: 'basin', provinces: ['Grand Erg/Ahnet Basin', 'Trias/Ghadames Basin', 'Illizi Basin', 'Hamra Basin', 'Nefusn Uplift', 'Murzuk Basin', 'Fezzan Uplift'], rgb: [236, 168, 96] },
      { slug: 'tuareg-shield', name: 'Tuareg Shield and Iullemmeden', system: 'shield', provinces: ['Hoggar', 'Thiemboka Uplift', 'Iullemmeden'], rgb: [176, 108, 70] },
      { slug: 'sirte-ionian', name: 'Sirte and the Ionian–Levantine Sea', system: 'basin', provinces: ['Sirte Basin', 'Cyrenacia Basin', 'Cyrenacia Uplift', 'Pelagian Basin', 'Mediterranean Basin'], rgb: [120, 150, 190] },
      { slug: 'libyan-desert-nile', name: 'Libyan Desert and the Nile Delta', system: 'basin', provinces: ['Erdis Kufra', 'Nubian Uplift', 'Upper Egypt Basin', 'North Egypt Basin', 'Abu Gharadiq Basin', 'Nile Delta Basin', 'Syrian Arch'], rgb: [240, 210, 150] },
      // The Red Sea Hills and the Eastern Desert; USGS's Western Nubian Shield (Darfur, Kordofan) lies far from them, between the rifts.
      { slug: 'nubian-shield', name: 'Nubian Shield', system: 'shield', provinces: ['North Red Sea Shield', 'South Red Sea Shield'], rgb: [168, 120, 150] },
      { slug: 'red-sea-aden-africa', name: 'Red Sea and Gulf of Aden, African Margin', system: 'rift', provinces: ['Red Sea Basin'], rgb: [90, 170, 180] },
      { slug: 'central-african-rifts', name: 'Chad, Darfur and the Sudanese Rifts', system: 'rift', provinces: ['Chad', 'Sud', 'Khartoum', 'Western Nubian Shield'], rgb: [206, 186, 96] },
      { slug: 'niger-benue', name: 'Niger Delta and the Benue Trough', system: 'delta', provinces: ['Niger Delta', 'Benue', 'Nigerian Massive'], rgb: [130, 186, 80] },
      { slug: 'congo-basin', name: 'Congo Basin', system: 'basin', provinces: ['Zaire', 'East Zaire Precambrian Belt'], rgb: [70, 140, 80] },
      { slug: 'west-congo-angola', name: 'West Congo Belt and the Angolan Margin', system: 'orogen', provinces: ['West Zaire Precambrian Belt', 'West-central Coastal'], rgb: [150, 176, 90] },
      { slug: 'horn-of-africa', name: 'Horn of Africa', system: 'basin', provinces: ['Somali', 'Somali Deep Sea'], rgb: [222, 150, 120] },
      // The owner's reference Zone (the handoff, 17 October): everything the plume shaped, the Ethiopian dome and Afar included.
      { slug: 'east-african-rift', name: 'East African Rift', system: 'rift', provinces: ['East African Rift', 'Amhara Plateau'], rgb: [176, 76, 86] },
      { slug: 'swahili-coast', name: 'Tanzania and Mozambique Coastal Basins', system: 'basin', provinces: ['Tanzania Coastal', 'Mozambique Coastal'], rgb: [110, 176, 160] },
      { slug: 'kalahari-damara', name: 'Kalahari and the Damara Belt', system: 'basin', provinces: ['Kalahari', 'Etosha', 'Luffillian Arch', 'Damer Belt', 'Orange River Coastal'], rgb: [230, 196, 140] },
      { slug: 'kaapvaal-karoo-cape', name: 'Kaapvaal, Karoo and the Cape', system: 'shield', provinces: ['E. Kalahari Precambrian Belt', 'Karoo', 'South African Coastal'], rgb: [186, 140, 96] },
      { slug: 'madagascar-seychelles', name: 'Madagascar and the Seychelles', system: 'plateau', provinces: ['Madagascar', 'Morondava', 'Tamatave', 'Madagascar Offshore', 'Seychelles'], rgb: [150, 110, 180] },
    ],
  },
  {
    slug: 'arabica', name: 'Terra Arabica', build: true, plates: ['Arabia'],
    principle: 'The Arabian plate\'s land and seas to the continental margin: the peninsula, the Levant east of Suez with Sinai, Mesopotamia and the Persian Gulf, ending at the Zagros and Bitlis mountain front (ZR20) and the Red Sea\'s and the Gulf of Aden\'s axes (ZR19).',
    zones: [
      // ZSP 1.0's Levant Zone, the same region grown to the rules (ZR8): its id kept.
      { slug: 'levant', name: 'Levant', system: 'rift', provinces: ['Levantine Basin', 'Sinai Basin', 'Beirut', 'Palmyra Zone', 'Haleb', 'Jafr-Tabuk Basin', 'Wadi-Surhan Basin', 'North Harrah Volcanics'], rgb: [200, 150, 110] },
      { slug: 'arabian-shield', name: 'Arabian Shield', system: 'shield', provinces: ['Arabian Shield', 'South Harrah Volcanics'], rgb: [170, 110, 90] },
      { slug: 'red-sea-aden-arabia', name: 'Red Sea, Arabian Margin', system: 'rift', provinces: [], rgb: [90, 170, 180] },
      { slug: 'yemen-aden', name: 'Yemen Highlands and the Gulf of Aden', system: 'rift', provinces: ['Yemen Volcanic Basin (North)', 'Yemen Volcanic Basin (South)', 'Hays Structural Belt', "Ma'Rib-Al Jawf Basin", 'Mukalla Rift Basin', 'Shabwah Basin', 'Sharmah Rift Basin', 'Masila-Jeza Basin'], rgb: [190, 120, 140] },
      { slug: 'rub-al-khali', name: "Rub' al Khali", system: 'basin', provinces: ['Rub Al Khali Basin', 'Ghudun-Khasfeh Flank Province', 'Mirbat Precambrian Basement'], rgb: [236, 200, 130] },
      { slug: 'oman', name: 'Oman Mountains and Salt Basins', system: 'orogen', provinces: ['South Oman Salt Basin', 'East Flank Oman Sub-basin', 'Huqf-Haushi Uplift', 'Ghaba Salt Basin', 'Central Oman Platform', 'Fahud Salt Basin', 'Oman Mountains', 'Masirah Trough', 'Gulf of Oman Basin'], rgb: [150, 120, 100] },
      { slug: 'central-arabian-arch', name: 'Central Arabian Arch', system: 'basin', provinces: ['Interior Homocline-Central Arch', 'Greater Ghawar Uplift', 'Qatar Arch'], rgb: [220, 170, 110] },
      { slug: 'mesopotamia-gulf', name: 'Mesopotamia and the Persian Gulf', system: 'basin', provinces: ['Mesopotamian Foredeep Basin', 'Euphrates/Mardin', 'Anah Graben', 'Khleisha Uplift'], rgb: [140, 170, 150] },
      { slug: 'widyan-arches', name: 'Widyan and the Northern Arches', system: 'basin', provinces: ['Widyan Basin-Int. Platform', "Hail-Ga'Ara Arch", 'Rutbah Uplift'], rgb: [210, 190, 150] },
    ],
  },
  {
    slug: 'europaea', name: 'Terra Europaea', build: true, plates: ['Eurasia', 'Aegean Sea'],
    principle: 'Europe west of the Urals to its continental margin, with the Ural belt and Novaya Zemlya, the Mediterranean\'s northern half, the Black Sea\'s north to its median line and the steppe to the Greater Caucasus\'s northern foot (ZR20).',
    zones: [
      { slug: 'fennoscandian-shield', name: 'Fennoscandian Shield and the Caledonides', system: 'shield', provinces: ['Baltic Shield-Norwegian Caledonides', 'Vestford-Helgeland', 'Kola Monocline-Finnmark Platform'], rgb: [120, 150, 170] },
      { slug: 'barents-shelf', name: 'Barents Shelf', system: 'basin', provinces: ['Svalbard High', 'Central Barents Platform', 'Barents Continental Slope', 'Troms-Bjornoya Basin', 'Hammerfest-Varanger Basin', 'South Barents Basin', 'Ludlov Saddle', 'North Barents Basin', 'Grumant Uplift'], rgb: [150, 180, 200] },
      { slug: 'urals-novaya-zemlya', name: 'Urals and Novaya Zemlya', system: 'orogen', provinces: ['Ural-Novaya Zemlya Foldbelt', 'Admiralty Arch', 'Novaya Zemlya Monocline', 'North Novaya Zemlya Basin'], rgb: [150, 110, 100] },
      { slug: 'timan-pechora', name: 'Timan–Pechora', system: 'basin', provinces: ['Mezen Basin', 'Timan High', 'Timan-Pechora Basin'], rgb: [170, 160, 120] },
      { slug: 'volga-ural', name: 'Volga–Ural', system: 'basin', provinces: ['Volga-Ural Region', 'Kotelnich Arch'], rgb: [190, 170, 110] },
      { slug: 'moscow-voronezh', name: 'Moscow Basin and the Voronezh High', system: 'basin', provinces: ['Moscow Basin', 'Belorussian-Voronezh High'], rgb: [160, 180, 120] },
      { slug: 'ukrainian-shield', name: 'Ukrainian Shield and the Dnieper–Donets', system: 'shield', provinces: ['Ukrainian Shield', 'Dnieper-Donets Basin', 'Donbass Foldbelt', 'Pripyat Basin', 'Poles Saddle', 'Russian Craton Margin'], rgb: [200, 190, 120] },
      { slug: 'pontic-caspian-steppe', name: 'Pontic–Caspian Steppe', system: 'basin', provinces: ['North Caspian Basin', 'Azov-Kuban Basin', 'Middle Caspian Basin', 'North Crimea Basin', 'Crimea High', 'Northeast Black Sea Shelf', 'Dobrogea Foreland'], rgb: [210, 200, 150] },
      { slug: 'black-sea-north', name: 'Black Sea, European Margin', system: 'basin', provinces: ['Black Sea Deep-Water Basin', 'Black Sea Continental Slope', 'West Black Sea Basin'], rgb: [100, 140, 180] },
      { slug: 'north-european-plain', name: 'North European Plain and the Baltic', system: 'basin', provinces: ['Baltic Depression', 'Fennoscandian Border-Danish-Polish Margin', 'German-Polish Basin', 'Northwest German Basin', 'Munsterland Basin', 'Horda-Norwegian-Danish Basin'], rgb: [170, 190, 150] },
      { slug: 'north-sea-british-isles', name: 'North Sea and the British Isles', system: 'basin', provinces: ['Faeroes-Shetland-Orkney Basin', 'North Sea Graben', 'Ireland-Scotland Platform', 'Midland Valley-Forth Approaches Basin', 'Mid-North Sea High', 'Irish Sea', 'Anglo-Dutch Basin', 'London-Brabant Platform'], rgb: [120, 170, 140] },
      { slug: 'paris-basin-massifs', name: 'Paris Basin and the Hercynian Massifs', system: 'basin', provinces: ['Anglo-Paris Basin', 'Armoricia', 'Massif Central', 'Aquitaine Basin', 'Southwest German Basin', 'Trans-graben', 'Rhine Graben', 'Bresse Depression', 'Bohemia'], rgb: [180, 160, 130] },
      { slug: 'alps', name: 'Alps', system: 'orogen', provinces: ['Alps', 'Molasse Basin', 'Jura', 'Po Basin'], rgb: [200, 120, 110] },
      { slug: 'carpathians-pannonian', name: 'Carpathians and the Pannonian Basin', system: 'orogen', provinces: ['North Carpathian Basin', 'Pannonian Basin', 'Transylvania', 'Carpathian-Balkanian Basin', 'Dobrogean Orogen'], rgb: [180, 130, 140] },
      { slug: 'apennines-tyrrhenian', name: 'Apennines and the Tyrrhenian Sea', system: 'orogen', provinces: ['Tuscany-Latium-Paola', 'Tyrrhenian Basin', 'Sicily', 'Adriatic Basin', 'Apulia Platform', 'Corsican-Sardinian Basins'], rgb: [190, 150, 110] },
      // ZSP 1.0's Balkans Zone, the same region grown to the rules (ZR8): its id kept.
      { slug: 'balkans', name: 'Balkans', system: 'orogen', provinces: ['Dinaric Alps', 'Aegean', 'Crete'], rgb: [170, 120, 120] },
      { slug: 'iberia', name: 'Iberian Massif and the Betics', system: 'shield', provinces: ['Iberian Massif', 'Tajo-Duero Basin', 'Iberic Cordillera', 'Spanish Trough-Cantabrian Zone', 'Galician Basin', 'Lusitanian Basin', 'Alentejo-Guadalquivir Basin', 'Betic Zone', 'Andalucia', 'Pyrenean Foothills-Ebro Basin'], rgb: [210, 160, 100] },
      { slug: 'western-mediterranean', name: 'Western Mediterranean Basin', system: 'basin', provinces: ['Provence Basin', 'Lion-Camargue'], rgb: [110, 150, 190] },
    ],
  },
  {
    slug: 'tethyana', name: 'Terra Tethyana', build: true, plates: ['Anatolia', 'Eurasia'],
    principle: 'Where the Tethys Ocean closed: Anatolia, the Caucasus, the Caspian, the Zagros and the Iranian Plateau, the Hindu Kush, the Pamirs, the Tian Shan and the Turan lowland, from the Bosporus and the Black Sea\'s median to the Tarim, the Kazakh steppe and the Chaman fault (ZR20, ZR21).',
    zones: [
      { slug: 'anatolian-plateau', name: 'Anatolian Plateau and the Taurus', system: 'plateau', provinces: ['Tuz/Corum', 'Adana/Sivas'], rgb: [200, 150, 110] },
      { slug: 'pontides', name: 'Pontic Mountains', system: 'orogen', provinces: ['Thrace/Samsun'], rgb: [150, 140, 100] },
      { slug: 'western-anatolia', name: 'Western Anatolia and the Menderes Massif', system: 'rift', provinces: ['Kardiff/Menders Massif'], rgb: [210, 170, 120] },
      { slug: 'lesser-caucasus', name: 'Lesser Caucasus and the Armenian Highlands', system: 'orogen', provinces: ['Lesser Caucasus', 'Araks'], rgb: [170, 110, 100] },
      // ZSP 1.0's Caucasus Zone, the same region grown to the rules (ZR8): its id kept.
      { slug: 'caucasus', name: 'Caucasus', system: 'orogen', provinces: ['Great Caucasus Foldbelt', 'Rioni Basin', 'Kura Basin'], rgb: [140, 100, 110] },
      { slug: 'caspian-sea', name: 'Caspian Sea', system: 'basin', provinces: ['South Caspian Basin'], rgb: [100, 150, 190] },
      { slug: 'black-sea-south', name: 'Black Sea, Anatolian Margin', system: 'basin', provinces: [], rgb: [90, 140, 180] },
      { slug: 'zagros', name: 'Zagros', system: 'orogen', provinces: ['Zagros Fold Belt', 'Zagros Thrust Zone'], rgb: [180, 120, 90] },
      { slug: 'iranian-plateau', name: 'Iranian Plateau', system: 'plateau', provinces: ['Central Iranian Basins', 'Cen. Iranian Microcontinents', 'Lut Block and Depression'], rgb: [220, 180, 120] },
      { slug: 'alborz-kopet-dag', name: 'Alborz and Kopet Dag', system: 'orogen', provinces: ['Alborz Fold Belt', 'Kopet-Dag Foldbelt'], rgb: [160, 120, 120] },
      { slug: 'makran-baluchistan', name: 'Makran and Baluchistan', system: 'arc', provinces: ['Makran', 'Baluchistan'], rgb: [190, 160, 110] },
      { slug: 'hindu-kush', name: 'Hindu Kush and the Afghan Blocks', system: 'orogen', provinces: ['Central Afghanistan', 'Southeast Afghanistan', 'Afghan-Tajik Basin'], rgb: [150, 110, 90] },
      { slug: 'pamirs', name: 'Pamirs', system: 'orogen', provinces: ['Pamir High', 'Alay Basin'], rgb: [130, 100, 120] },
      { slug: 'tian-shan', name: 'Tian Shan', system: 'orogen', provinces: ['Tian Shan Foldbelt', 'Fergana Basin', 'Naryn Basin', 'Issyk-Kul Basin', 'West Ili Basin', 'East Ili Basin', 'Bogdashan Fold Belt', 'Turpan Basin'], rgb: [120, 120, 150] },
      { slug: 'karakum-amu-darya', name: 'Karakum and the Amu Darya', system: 'basin', provinces: ['Amu-Darya Basin', 'Karabogaz-Karakum High'], rgb: [230, 200, 140] },
      { slug: 'aral-syr-darya', name: 'Aral Sea, the Syr Darya and the Ustyurt', system: 'basin', provinces: ['Syr-Darya Basin', 'East Aral Slope', 'East Aral Basin', 'North Ustyurt Basin', 'Mangyshlak-Ustyurt Foldbelt', 'Mugodzhary-South Emba', 'Chu-Sarysu Basin'], rgb: [210, 190, 150] },
    ],
  },
  {
    slug: 'borealis', name: 'Terra Borealis', build: true, plates: ['Eurasia', 'North America', 'Okhotsk'],
    principle: 'Northern Eurasia east of the Urals to its continental margin: the West Siberian Basin, the Siberian craton, the Kazakh steppe, Verkhoyansk and Chukotka, Kamchatka and the Arctic shelf seas, ending at the craton\'s southern rim (ZR22), the Kazakh steppe\'s edge (ZR21) and the Sea of Okhotsk\'s median (ZR22).',
    zones: [
      { slug: 'west-siberian-basin', name: 'West Siberian Basin', system: 'basin', provinces: ['West Siberian Basin'], rgb: [150, 170, 140] },
      { slug: 'taimyr-kara', name: 'Taimyr and the Kara Sea', system: 'orogen', provinces: ['Yenisey-Khatanga Basin', 'Taimyr-Kara High', 'Severnaya Zemlya High', 'St. Anna Basin', 'Vize High', 'Ushakov High', 'Uedineniya Basin', 'Central Kara High', 'Schmidt Basin'], rgb: [140, 150, 170] },
      { slug: 'tunguska', name: 'Tunguska Basin and the Yenisey Ridge', system: 'basin', provinces: ['Tunguska Basin', 'Turukhan-Norilsk Folded Zone', 'Turukhan-Igarka Uplift', 'Yenisey Ridge', 'Baykit Arch'], rgb: [170, 150, 120] },
      { slug: 'angara-lena', name: 'Angara–Lena Platform', system: 'basin', provinces: ['Cis-Sayan Basin', 'Angara-Lena Terrace', 'Nepa-Botuoba Arch', 'Cis-Patom Foredeep', 'Kempendiay Region'], rgb: [190, 170, 120] },
      { slug: 'anabar', name: 'Anabar Shield', system: 'shield', provinces: ['Anabar-Olenek High', 'Anabar Basin', 'Khatanga Saddle'], rgb: [160, 130, 110] },
      { slug: 'lena-vilyuy', name: 'Lena–Vilyuy Basin', system: 'basin', provinces: ['Lena-Vilyuy Basin'], rgb: [180, 180, 130] },
      { slug: 'aldan-stanovoy', name: 'Aldan Shield and the Stanovoy', system: 'shield', provinces: ['Aldan Uplift', 'Aldan Shield'], rgb: [150, 110, 100] },
      { slug: 'baikal-patom', name: 'Baikal–Patom Highlands', system: 'orogen', provinces: ['Baikal-Patom Folded Region'], rgb: [130, 120, 150] },
      { slug: 'altai-sayan', name: 'Altai, Sayan and Kuznetsk', system: 'orogen', provinces: ['Altay-Sayan Folded Region', 'Kuznetsk Basin', 'North Minusa Basin', 'South Minusa Basin'], rgb: [140, 110, 120] },
      { slug: 'kazakh-uplands', name: 'Kazakh Uplands and the Turgay', system: 'shield', provinces: ['Central Kazakhstan Folded Region', 'Turgay Depression', 'South Turgay Basin', 'Alakol Basin', 'Zaysan Basin'], rgb: [210, 190, 140] },
      { slug: 'verkhoyansk-chukotka', name: 'Verkhoyansk and Chukotka', system: 'orogen', provinces: ['Verkhoyan-Chukotka Folded Region', 'Zyryanka Basin', 'Moma Basin', 'Ayon Basin', 'Anadyr Basin', 'Gangut High', 'Khatyrka Basin', 'Penzhina Basin'], rgb: [160, 140, 140] },
      { slug: 'laptev-east-siberian', name: 'Laptev and East Siberian Shelves', system: 'basin', provinces: ['Laptev Shelf', 'Novosibirsk Basin', 'De Long High', 'Anzhu Uplift', 'Blagoveshchensk Basin', 'North Chukchi Basin', 'Wrangel Basin', 'Wrangel-Herald Uplift', 'South Chukchi-Hope Basin'], rgb: [150, 180, 200] },
      { slug: 'kamchatka-koryak', name: 'Kamchatka and the Koryak Highlands', system: 'arc', provinces: ['Koryak-Kamchatka Foldbelt', 'Kinkil Basin', 'Talov Uplift', 'West Kamchatka Basin', 'Central Kamchatka Group of Basins', 'East Kamchatka Uplift', 'Olyutor Basin', 'East Kamchatka Basin'], rgb: [170, 120, 110] },
      { slug: 'okhotsk-north', name: 'Sea of Okhotsk, Northern Margin', system: 'basin', provinces: ['North Okhotsk Group of Basins', 'Tinro Basin', 'Gizhigin Basin', 'Koni-Tayganos Uplift'], rgb: [110, 150, 190] },
    ],
  },
  {
    slug: 'sinica', name: 'Terra Sinica', build: true, plates: ['Eurasia', 'Amur', 'Yangtze', 'Okhotsk', 'Okinawa'],
    principle: 'East Asia to its continental margin: China east of the Indus–Yarlung suture with Tibet (ZR21), Mongolia and Transbaikalia, the Amur and Manchuria, Korea, Japan, Sakhalin and the Kurils, and the Yellow, East China and Japan seas, ending at the Siberian craton\'s rim, the Sea of Okhotsk\'s median and the Red River fault (ZR22).',
    zones: [
      { slug: 'tarim', name: 'Tarim Basin', system: 'basin', provinces: ['Tarim Basin'], rgb: [230, 200, 140] },
      { slug: 'dzungaria', name: 'Dzungaria', system: 'basin', provinces: ['Junggar Basin', 'Karamay Thrust Belt'], rgb: [210, 190, 130] },
      { slug: 'qiangtang', name: 'Qiangtang and the Changtang', system: 'plateau', provinces: ['Qiangtang Terrane', 'Qiangtang Tanggula Basin'], rgb: [190, 170, 150] },
      { slug: 'lhasa-block', name: 'Lhasa Block and the Tsangpo', system: 'plateau', provinces: ['Lhasa Terrane', 'Lhasa Basin', 'Cuoqing Lunpola Basin', 'Qabdu Basin'], rgb: [170, 140, 130] },
      { slug: 'kunlun-qaidam', name: 'Kunlun and the Qaidam', system: 'orogen', provinces: ['Kunlunshan Fold Belt', 'Altunshan Fold Belt', 'Qaidam Basin', 'Kumukulig Basin'], rgb: [160, 130, 110] },
      { slug: 'qilian-alxa', name: 'Qilian Shan and the Alxa', system: 'orogen', provinces: ['Qilianshan Fold Belt', 'Jiuquan Minle Wuwei Basin', 'Alashan Yinshan Fold Belt'], rgb: [180, 150, 120] },
      { slug: 'songpan-ganzi', name: 'Songpan–Ganzi and the Longmen Shan', system: 'orogen', provinces: ['Songpan Ganzi Fold Belt', 'Longmenshan Dabashan Fold Belt', 'Sulongshan Fold Belt'], rgb: [150, 120, 130] },
      { slug: 'sichuan', name: 'Sichuan Basin', system: 'basin', provinces: ['Sichuan Basin'], rgb: [190, 160, 100] },
      { slug: 'ordos-loess', name: 'Ordos and the Loess Plateau', system: 'basin', provinces: ['Ordos Basin', 'Shanxi Plateau'], rgb: [220, 190, 120] },
      { slug: 'north-china-plain', name: 'North China Plain and the Yellow Sea', system: 'basin', provinces: ['Bohaiwan Basin', 'Taihangshan Yanshan Fold Belt', 'Taikang Hefei Basin', 'Nanyang Basin', 'Subei Yellow Sea Basin', 'Korea Bay Basin', 'Luxi Jiaoliao Uplift'], rgb: [200, 200, 140] },
      { slug: 'qinling-dabie', name: 'Qinling–Dabie', system: 'orogen', provinces: ['Qinling Dabieshan Fold Belt'], rgb: [140, 140, 110] },
      { slug: 'yangtze', name: 'Yangtze Platform', system: 'basin', provinces: ['Jianghan Basin', 'Jiangnan South Jiangsu Fold Belt', 'Yunnan Guizhou Hubei Fold Belt', 'Xichang Yunnan Fold Belt', 'Chuxiong Basin', 'Nanpanjiang Depression', 'Bose Basin'], rgb: [150, 180, 120] },
      { slug: 'south-china', name: 'South China and the Pearl River', system: 'orogen', provinces: ['South China Fold Belt', 'Pearl River Mouth Basin', 'Sanshui Basin', 'Shiwan Dashan Basin', 'Beibuwan Basin', 'Leidong Basin', 'Qiongdongnan Basin', 'Taixinan Basin', 'Bijianan Basin'], rgb: [120, 170, 120] },
      { slug: 'east-china-sea-taiwan', name: 'East China Sea, Taiwan and the Ryukyus', system: 'arc', provinces: ['East China Sea Basin', 'Taiwan Thrust and Fold Belt', 'Taiwan Melange Belt', 'Okinawa Trough', 'Ryukyu Volcanic Arc', 'Sinzi Uplift'], rgb: [110, 160, 180] },
      { slug: 'korean-peninsula', name: 'Korean Peninsula', system: 'shield', provinces: ['Korean Craton', 'Gyeongsang Basin', 'Gensan Basin', 'Korean Continental Shelf', 'Huksan Platform'], rgb: [170, 160, 140] },
      { slug: 'japan', name: 'Japan Arc and the Sea of Japan', system: 'arc', provinces: ['Japan Volcanic Arc/Accreted Terrane', 'Akita Basin', 'Honshu Ridge', 'Ishikari Hidaka Basin', 'Joban Basin', 'Kanto Basin', 'Miyazaki Basin', 'Niigata Basin', 'Sagara Basin', 'Tokachi Basin', 'Tottori Basin', 'Tsushima Basin', 'Sea of Japan Backarc Basin'], rgb: [180, 120, 130] },
      { slug: 'manchuria', name: 'Manchuria and the Greater Khingan', system: 'basin', provinces: ['Songliao Basin', 'Yinshan Da&Xiao Hingganling Uplift', 'Zhangguangcailing Uplift', 'Yitong Graben', 'Erlian Basin', 'Temtsag Hailar Basin', 'Mohe Basin', 'Heilongjiang Basin', 'Ushumun Basin'], rgb: [160, 190, 140] },
      { slug: 'mongolian-plateau', name: 'Mongolian Plateau', system: 'plateau', provinces: ['Mongol-Okhotsk Folded Region', 'Gobi Basin', 'Great Lake Basin', 'Great Lake Uplift', 'Ulan Bator Basin', 'Nyalga Basin', 'Choybalsan Basin', 'Erlian Uplift'], rgb: [210, 180, 130] },
      { slug: 'amur-sikhote-alin', name: 'Amur and the Sikhote-Alin', system: 'orogen', provinces: ['Sikhote-Alin Folded Region', 'Khanka Basin', 'Suifun Basin', 'Middle Amur Basin', 'Bureya-Dunbey Region', 'Zeya-Bureya Basin', 'Upper Bureya Basin', 'Upper Zeya Basin'], rgb: [130, 160, 130] },
      { slug: 'sakhalin-okhotsk', name: 'Sakhalin, the Kurils and the Sea of Okhotsk', system: 'arc', provinces: ['North Sakhalin Basin', 'East Sakhalin Uplift', 'Terpeniya Bay Basin', 'West Sakhalin Uplift', 'Susunay Uplift', 'Aniva Basin', 'Tatar Strait Basin', 'Onekotan Basin', 'South Kuril Basin'], rgb: [120, 140, 170] },
    ],
  },
  {
    slug: 'indica', name: 'Terra Indica', build: true, plates: ['India'],
    principle: 'The Indian subcontinent to its continental margin, with Sri Lanka and the Himalaya: the Indian plate\'s land and seas, ending at the Chaman fault (ZR22), the Indus–Yarlung suture (ZR21) and the Indo-Burman ranges\' western foot (ZR22).',
    zones: [
      { slug: 'himalaya', name: 'Himalaya', system: 'orogen', provinces: ['Himalayan'], rgb: [170, 130, 140] },
      { slug: 'ganges-plain', name: 'Ganges Plain', system: 'basin', provinces: ['Himalayan Foreland'], rgb: [190, 200, 130] },
      { slug: 'indus', name: 'Indus Basin', system: 'basin', provinces: ['Indus', 'Kohat-Potwar'], rgb: [220, 190, 130] },
      { slug: 'sulaiman-kirthar', name: 'Sulaiman and Kirthar Ranges', system: 'orogen', provinces: ['Sulaiman-Kirthar'], rgb: [180, 140, 110] },
      { slug: 'cambay-bombay', name: 'Cambay Rift and Bombay High', system: 'rift', provinces: ['Bombay'], rgb: [200, 160, 120] },
      { slug: 'konkan', name: 'Konkan and the Western Margin', system: 'basin', provinces: ['Konkan'], rgb: [120, 170, 150] },
      // The Gondwana rift basins lie within the shield, its own fractures: one Zone with it.
      { slug: 'indian-shield', name: 'Deccan, the Indian Shield and the Gondwana Rifts', system: 'shield', provinces: ['Indian Shield', 'Chindwara', 'Satpura_Brahmani', 'Damodar', 'Pranhita-Godavari'], rgb: [180, 120, 100] },
      { slug: 'east-coast-basins', name: 'East Coast Basins', system: 'basin', provinces: ['Cauvery', 'Krishna-Godavari', 'Mahanadi'], rgb: [140, 180, 130] },
      { slug: 'bengal-assam', name: 'Bengal Basin and Assam', system: 'delta', provinces: ['Ganges-Brahmaputra Delta', 'Assam'], rgb: [120, 180, 110] },
      { slug: 'sri-lanka', name: 'Sri Lanka', system: 'shield', provinces: ['Sri Lanka'], rgb: [150, 130, 170] },
    ],
  },
  {
    slug: 'sundaica', name: 'Terra Sundaica', build: true, plates: ['Sunda', 'Burma', 'Molucca Sea', 'Banda Sea', 'Philippine Sea'],
    principle: 'Southeast Asia to its continental margin: Myanmar with the Indo-Burman ranges, Indochina, the Malay Peninsula, Sumatra, Java, Borneo, the Philippines, the South China Sea and all of Wallacea, from the Red River fault (ZR22) to Lydekker\'s Line at the Sahul shelf\'s edge (ZR23).',
    zones: [
      { slug: 'indo-burman-irrawaddy', name: 'Indo-Burman Ranges and the Irrawaddy', system: 'arc', provinces: ['Indo-Burman', 'Irrawaddy', 'North Burma'], rgb: [170, 130, 120] },
      { slug: 'shan-tenasserim', name: 'Shan Plateau and the Tenasserim', system: 'plateau', provinces: ['Tenasserim-Shan', 'Lanping Simao Basin'], rgb: [160, 150, 110] },
      { slug: 'annamite-khorat', name: 'Annamite Range and the Khorat Plateau', system: 'orogen', provinces: ['Truong Son Fold Belt', 'Khorat Platform', 'Tonle Sap-Phnom Penh Basin'], rgb: [150, 170, 120] },
      { slug: 'mekong-gulf-thailand', name: 'Mekong Delta and the Gulf of Thailand', system: 'delta', provinces: ['Mekong/Cuulong/Vung Tau Basin', 'Saigon Basin', 'Panjang/Cardomomes Basin', 'Thai Basin', 'Central Vietnam Basin'], rgb: [120, 170, 150] },
      { slug: 'malay-peninsula', name: 'Malay Peninsula and the Thai Basins', system: 'orogen', provinces: ['Thailand Mesozoic Basin Belt', 'Malay Peninsula', 'Malay Basin'], rgb: [130, 160, 110] },
      { slug: 'sunda-arc', name: 'Sunda Arc: Sumatra, Java and the Lesser Sundas', system: 'arc', provinces: ['North Sumatra Basin', 'Central Sumatra Basin', 'South Sumatra Basin', 'Sumatra/Java Magmatic Arc', 'Sumatra/Java Accretionary Prism', 'Sumatra/Java Fore-Arc Basins', 'Northwest Java Basin', 'East Java Basin'], rgb: [180, 120, 110] },
      { slug: 'sunda-shelf', name: 'Sunda Shelf and the Java Sea', system: 'basin', provinces: ['Sunda Platform', 'Penyu/West Natuna Basin', 'East Natuna Basin'], rgb: [120, 160, 170] },
      { slug: 'borneo', name: 'Borneo', system: 'shield', provinces: ['Greater Sarawak Basin', 'Rajang-Crocker Accretionary Prism', 'Baram Delta/Brunei-Sabah Basin', 'Ketuneau/Sintang Terrane', 'Kutei Basin', 'Barito Basin', 'Melawi Basin', 'Meratus High', 'Pamusian Tarakan Basin'], rgb: [110, 150, 100] },
      { slug: 'south-china-sea', name: 'South China Sea', system: 'basin', provinces: ['South China Ocean Basin', 'South China Sea Platform', 'Reed Bank Basin', 'Xisha Trough'], rgb: [100, 140, 180] },
      { slug: 'philippines', name: 'Philippine Mobile Belt and the Sulu Sea', system: 'arc', provinces: ['Philippine Accretionary Prism', 'Philippine Magmatic Arc', 'Visayan', 'Cagayan Basin', 'Bicol Shelf Basin', 'Cotabato Basin', 'Zambalez/Central Luzon Basin', 'Palawan Shelf', 'Sulu Arch', 'Sulu Sea Basin'], rgb: [170, 140, 150] },
      // All of Wallacea, one Zone (ZR23): Sulawesi, the Moluccas, Halmahera, the Banda arc and Timor, Sumba.
      { slug: 'wallacea', name: 'Wallacea', system: 'arc', provinces: ['Sulawesi Accretionary Prism', 'Sulawesi Magmatic Arc', 'Banda Arc', 'North Banda Basin', 'South Banda Basin', 'Weber Basin', 'Halmahera Basin', 'Halmahera Platform', 'Bone Basin', 'Gorontalo Basin', 'Flores Basin', 'Sumba Province', 'Celebes Sea', 'South Makassar Basin', 'Bali Basin', 'Java/Banda Sea'], rgb: [150, 120, 160] },
    ],
  },
  {
    slug: 'sahulica', name: 'Terra Sahulica', build: true, plates: ['Australia', 'Woodlark', 'Birds Head', 'Pacific'],
    principle: 'The Sahul shelf to its continental margin, from Lydekker\'s Line (ZR23): Australia, Tasmania, New Guinea with the Bird\'s Head and Aru, and Zealandia\'s land and shelf, New Zealand and New Caledonia (ZR18).',
    zones: [
      { slug: 'yilgarn-pilbara', name: 'Yilgarn and Pilbara Cratons', system: 'shield', provinces: ['Yilgarn Block', 'Pilbara Block', 'Gascoyne Block', 'Bangemall and Nabberu Basins', 'Albany-Fraser Province', 'Paterson Province'], rgb: [190, 120, 90] },
      { slug: 'western-margin', name: 'Western Margin and the North West Shelf', system: 'basin', provinces: ['Perth Basin', 'Carnarvon Basin', 'Northwest Shelf'], rgb: [110, 160, 170] },
      { slug: 'kimberley-canning', name: 'Kimberley and the Canning Basin', system: 'basin', provinces: ['Canning Basin', 'Kimberley Basin', 'Halls Creek Province', 'Browse Basin'], rgb: [200, 150, 100] },
      { slug: 'north-australian-craton', name: 'North Australian Craton', system: 'shield', provinces: ['Bonaparte Gulf Basin', 'Pine Creek Geosyncline', 'Daly River Basin', 'Money Shoal Basin', 'Victoria River Basin', 'Birrindudu Basin and Tanami Block', 'McArthur Basin', 'Wiso Basin', 'Tennant Creek Block', 'Australian Arafura Basin'], rgb: [180, 130, 100] },
      { slug: 'central-australia', name: 'Central Australian Basins and Ranges', system: 'basin', provinces: ['Amadeus Basin', 'Arunta Block', 'Ngalia Basin', 'Musgrave Block', 'Officer Basin', 'Georgina Basin', 'Mt.Isa Block'], rgb: [220, 160, 110] },
      { slug: 'gawler-eucla', name: 'Gawler Craton and the Eucla', system: 'shield', provinces: ['Eucla Basin', 'Gawler Block', 'Great Australian Bight Basin', 'Bremer Basin', 'Stuart Shelf'], rgb: [200, 180, 130] },
      { slug: 'great-artesian', name: 'Great Artesian Basin', system: 'basin', provinces: ['Eromanga Basin', 'Carpentaria Basin', 'Surat Basin', 'Galilee Basin', 'Laura Basin', 'Coen-Yambo Block'], rgb: [230, 200, 140] },
      { slug: 'murray-darling', name: 'Murray–Darling and the Flinders Ranges', system: 'basin', provinces: ['Murray Basin', 'Darling Basin', 'Adelaide & Kanmantoo Fold Belts'], rgb: [180, 190, 130] },
      { slug: 'tasmanides', name: 'Great Dividing Range and the Tasmanides', system: 'orogen', provinces: ['Lacklan Fold Belt', 'New England Fold Belt', 'Hodgkinson/Lachlan Fold Belt', 'Drummond Fold Belt and Anakie High', 'Bowen Basin', 'Sydney Basin', 'Clarence-Moreton Basin', 'Maryborough Basin'], rgb: [150, 150, 110] },
      { slug: 'tasmania-bass', name: 'Tasmania and Bass Strait', system: 'basin', provinces: ['Bass Basin', 'Bassian Rise', 'Gippsland Basin', 'Otway Basin', 'Tasmania Basin', 'Rocky Cape Block/Dundas Trough'], rgb: [120, 150, 140] },
      { slug: 'coral-sea', name: 'Coral Sea Plateaus and the Great Barrier Reef', system: 'plateau', provinces: ['Queensland Plateau', 'Marion Terrain', 'Halifax Basin', 'Capricorn Basin'], rgb: [100, 160, 180] },
      { slug: 'new-guinea-highlands', name: 'New Guinea Highlands and the Mobile Belt', system: 'orogen', provinces: ['New Guinea Mobile Belt', 'New Guinea Foreland Basin-Fold Belt', 'Sepik-Ramu Basin', 'Cape Vogel Basin', 'Northern Irian Jaya Waropen Basin', 'New Ireland Basin', 'South Bismarck Volcanic Arc'], rgb: [130, 110, 140] },
      { slug: 'arafura-papua', name: 'Arafura Shelf, Papua and the Bird\'s Head', system: 'basin', provinces: ['Arafura Basin-Irian Jaya', 'Merauke Platform', 'Papuan Basin-Shelf Platform', 'Bintuni/Sulawati Province'], rgb: [120, 170, 130] },
      { slug: 'new-zealand', name: 'New Zealand', system: 'orogen', provinces: ['New Zealand Orogenic Belt', 'New Zealand East Coast Basin', 'Northland Basin', 'Solander-Waiau Basin', 'Taranaki Basin', 'Wanganui Basin', 'Waikato Basin', 'Hikurani Trough', 'Great South Basin', 'Challenger Plateau', 'Chatham Rise', 'Three Kings Rise'], rgb: [150, 120, 160] },
      { slug: 'new-caledonia', name: 'New Caledonia and the Norfolk Ridge', system: 'ridge', provinces: ['New Caledonia', 'Loyalty Island Ridge', 'Norfolk Island Ridge', 'Lord Howe Rise'], rgb: [160, 130, 150] },
    ],
  },
  {
    slug: 'laurentia', name: 'Terra Laurentia', build: true, plates: ['North America', 'Caribbean', 'Panama', 'Pacific'],
    principle: 'North and Central America to their continental margin, with Greenland, the Canadian Arctic islands, the Caribbean and its volcanic arc (ZR23), the Gulf of Mexico and Hudson Bay, Baja California by the margin rule, ending at the Darién (ZR23) and the Bering and Chukchi seas\' median (ZR23).',
    zones: [
      { slug: 'canadian-shield', name: 'Canadian Shield', system: 'shield', provinces: ['Canadian Shield'], rgb: [170, 120, 110] },
      { slug: 'hudson-bay', name: 'Hudson Bay', system: 'basin', provinces: ['Hudson Bay Basin', 'Hudson Strait Basin', 'Foxe Basin'], rgb: [100, 140, 180] },
      { slug: 'arctic-archipelago', name: 'Arctic Archipelago and Baffin Bay', system: 'basin', provinces: ['Sverdrup Basin', 'Parry Island Foldbelt', 'Cornwallis Foldbelt', 'Ellesmere Foldbelt', 'Boothia Basin', 'South Arctic Basin', 'Wollaston Basin', 'Banks Basin', 'Minto Arch', 'Arctic Coastal Shelf', 'Baffin Basin', 'West Greenland Basin', 'Kane Basin'], rgb: [140, 160, 180] },
      { slug: 'greenland-shield', name: 'Greenland Shield', system: 'shield', provinces: ['Greenland Shield', 'North Greenland Platform', 'Southeast Greenland Basin'], rgb: [190, 190, 200] },
      { slug: 'east-greenland', name: 'East Greenland Caledonides', system: 'orogen', provinces: ['East Greenland Rift Basins', 'East Greenland Foldbelt', 'North Greenland Foldbelt', 'Wandel Sea Basin'], rgb: [160, 150, 170] },
      { slug: 'mackenzie', name: 'Mackenzie Basin and Mountains', system: 'basin', provinces: ['Mackenzie Delta', 'Mackenzie Delta Slope', 'Northern Interior Basins', 'Mackenzie Foldbelt', 'Yukon Basin', 'Canada Basin-Beaufort Slope OCS', 'Beaufort Shelf OCS'], rgb: [150, 170, 130] },
      { slug: 'interior-plains', name: 'Interior Plains: Alberta and Williston', system: 'basin', provinces: ['Alberta Basin', 'Williston Basin', 'Sioux Arch', 'North-Central Montana', 'Powder River Basin'], rgb: [210, 200, 140] },
      { slug: 'cordillera', name: 'Canadian Cordillera', system: 'orogen', provinces: ['Canadian Cordillera', 'Rocky Mountain Deformed Belt', 'Whitehorse Basin', 'Bowser Basin', 'Quesnel Basin', 'Georgia Basin', 'Queen Charlotte Basin', 'Tofino Basin'], rgb: [140, 120, 140] },
      { slug: 'alaska-bering', name: 'Alaska and the Bering Shelf', system: 'orogen', provinces: ['Northern Alaska', 'Central Alaska', 'Southern Alaska', 'Cook Inlet OCS', 'Gulf of Alaska Shelf OCS', 'Shumagin-Kodiak Shelf OCS', 'Chukchi Shelf OCS', 'Chukchi Borderland OCS', 'Hope Basin OCS', 'Bering Shelf-Margin Basins OCS', 'Navarin Basin OCS', 'North Aleutian Basin OCS', 'St. George Basin OCS', 'Norton Basin OCS', 'St. Matthew-Hall Basin OCS', 'Aleutian Arc OCS'], rgb: [130, 150, 160] },
      { slug: 'pacific-coast', name: 'Pacific Coast Ranges and the Central Valley', system: 'orogen', provinces: ['Western Oregon-Washington', 'Eastern Oregon-Washington', 'Klamath-Sierra Nevada', 'Northern Coastal', 'Sonoma-Livermore Basin', 'Sacramento Basin', 'San Joaquin Basin', 'Central Coastal', 'Santa Maria Basin', 'Ventura Basin', 'Los Angeles Basin', 'San Diego-Oceanside', 'Pacific Northwest OCS', 'Central California OCS', 'Santa Barbara-Ventura Basin OCS', 'Los Angeles Basin OCS', 'Inner Borderland OCS', 'Outer Borderland OCS'], rgb: [160, 140, 110] },
      { slug: 'basin-and-range', name: 'Basin and Range and the Gulf of California', system: 'rift', provinces: ['Western Great Basin', 'Eastern Great Basin', 'Idaho-Snake River Downwarp', 'Southern Arizona-Southwestern New Mexico', 'South-Central New Mexico', 'Sonoran Basin and Range', 'Chihuahuan Basin and Range', 'Salton Trough', 'Baja California Backbone', 'Vizcaino Basin', 'Purisima-Iray Basin', 'Guaymas-Topolobambo Basin'], rgb: [220, 170, 120] },
      { slug: 'rockies-colorado-plateau', name: 'Rocky Mountains and the Colorado Plateau', system: 'orogen', provinces: ['Uinta-Piceance Basins', 'Paradox Basin', 'San Juan Basin', 'Northern Arizona', 'Albuquerque-Santa Fe Rift', 'Montana Thrust Belt', 'Southwest Montana', 'Big Horn Basin', 'Wind River Basin', 'Wyoming Thrust Belt', 'Southwestern Wyoming', 'Park Basins', 'Raton Basin-Rio Grande Uplift', 'Pedernal Uplift'], rgb: [180, 120, 100] },
      { slug: 'great-plains', name: 'Great Plains and the Midcontinent', system: 'basin', provinces: ['Denver Basin', 'Las Animas Arch', 'Palo Duro Basin', 'Andarko Basin', 'Cambridge Arch-Central Kansas Uplift', 'Salina Basin', 'Nemaha Uplift', 'Forest City Basin', 'Sedgwick Basin', 'Cherokee Platform', 'Southern Oklahoma', 'Arkoma Basin', 'Ozark Uplift', 'Iowa Shelf', 'Bend Arch-Fort Worth Basin', 'Permian Basin', 'Marathon Thrust Belt'], rgb: [200, 190, 120] },
      { slug: 'gulf-of-mexico', name: 'Gulf of Mexico Basin and Yucatán', system: 'basin', provinces: ['Western Gulf', 'East Texas Basin', 'Louisiana-Mississippi Salt Basins', 'Gulf Cenozoic OCS', 'Gulf Mesozoic OCS', 'Florida Peninsula', 'Burgos Basin', 'Campeche-Sigsbee Salt Basin', 'Tampico-Misantla Basin', 'Veracruz Basin', 'Yucatan Platform', 'Saline-Comalcalco Basin', 'Villahermosa Uplift', 'Macuspana Basin', 'Tuxla Uplift'], rgb: [110, 160, 170] },
      { slug: 'great-lakes', name: 'Great Lakes and the Interior Lowlands', system: 'basin', provinces: ['Superior', 'Michigan Basin', 'Illinois Basin', 'Cincinnati Arch', 'Algonquin Arch-Michigan Basin', 'St. Lawrence Lowlands'], rgb: [140, 180, 130] },
      { slug: 'appalachians', name: 'Appalachians', system: 'orogen', provinces: ['Appalachian Basin', 'Blue Ridge Thrust Belt', 'Piedmont', 'Adirondack Uplift', 'New England', 'Appalachian Foldbelt', 'Magdalen Basin', 'Sidney Basin', 'Fundy Basin', 'Anticosti Basin', 'Black Warrior Basin'], rgb: [150, 130, 120] },
      { slug: 'atlantic-margin', name: 'Atlantic Margin and the Grand Banks', system: 'basin', provinces: ['Atlantic Coastal Plain', 'Atlantic Mesozoic OCS', 'Georges Bank', 'Scotian Shelf', 'Southern Newfoundland Shelf', 'Labrador-Newfoundland Shelf'], rgb: [120, 160, 150] },
      { slug: 'sierras-madres', name: 'Sierras Madres and the Mexican Plateau', system: 'orogen', provinces: ['Sierra Madre Occidental Volcanic Plateau', 'Mazatlan Basin', 'Sinaloa', 'Central Mesa', 'Torrecon-Sierra Madre Oriental Foldbelt', 'Parras Basin', 'Coahuila Platform', 'Burros Uplift', 'Sabinas Basin', 'Tamaulipas Arch', 'Magiscatzin Basin', 'Chicontepec Basin', 'Sierra Madre Oriental Foldbelt', 'Trans-mexican Neovolcanic Axis', 'Jalisco-Oaxaca Platform', 'Guerrero Basin'], rgb: [190, 140, 100] },
      { slug: 'central-america', name: 'Central American Isthmus', system: 'arc', provinces: ['Sierra Madre de Chiapas-Peten Foldbelt', 'Chiapas Massif', 'Chiapas Massif-Nuclear Central America', 'Maya Mountains', 'Middle America Province'], rgb: [160, 170, 110] },
      { slug: 'caribbean', name: 'Caribbean Sea and the Antilles', system: 'arc', provinces: ['Greater Antilles Deformed Belt', 'North Carribean Deformed Belt', 'Puerto Rico Trench', 'Bahama Platform', 'Cayman Trough', 'Cayman Ridge', 'Yucatan Basin', 'North Nicaraguan Rise', 'South Nicaraguan Rise', 'Columbian Basin', 'Venezuelan Basin', 'Beata Ridge', 'Aves Ridge', 'Neogene Volcanic Belt', 'Lesser Antilles Deformed Belt'], rgb: [100, 150, 190] },
    ],
  },
  {
    slug: 'amazonia', name: 'Terra Amazonia', build: true, plates: ['South America', 'North Andes', 'Altiplano', 'Scotia'],
    principle: 'South America to its continental margin: the Andes, the Amazon, the Brazilian and Guiana shields, Patagonia, the Falklands and South Georgia, Trinidad and Tobago and the ABC islands (ZR23), from the Darién (ZR23).',
    zones: [
      { slug: 'guiana-shield', name: 'Guiana Shield', system: 'shield', provinces: ['Guyana Shield', 'Tacutu Basin'], rgb: [150, 120, 100] },
      { slug: 'brazilian-shield', name: 'Brazilian Shield', system: 'shield', provinces: ['Brazilian Shield', 'Sucunduri Province', 'Xingu Province', 'Diamantina Province', 'Araripe Province', 'Parecis Province'], rgb: [180, 130, 100] },
      // ZSP 1.0's Amazon Basin Zone, the same region grown to the rules (ZR8; the handoff names it): its id kept.
      { slug: 'amazon-basin', name: 'Amazon Basin', system: 'basin', provinces: ['Solimoes Basin', 'Amazonas Basin'], rgb: [90, 150, 90] },
      { slug: 'equatorial-margin', name: 'Amazon Fan and the Equatorial Margin', system: 'basin', provinces: ['Foz de Amazonas Basin', 'Santana Platform', 'Guyana-Suriname Basin', 'San Luis Basin', 'Barreieinas Basin', 'Caera Basin', 'Potigar Basin'], rgb: [110, 170, 160] },
      { slug: 'parnaiba-sao-francisco', name: 'Parnaíba and São Francisco Basins', system: 'basin', provinces: ['Parnaiba Basin', 'Sao Francisco Basin'], rgb: [200, 170, 110] },
      { slug: 'east-brazilian-margin', name: 'East Brazilian Margin', system: 'basin', provinces: ['Pernambuco Basin', 'Sergipe-Alagoas Basin', 'Jatoba Basin', 'Tucano Basin', 'Reconcavo Basin', 'Bahia Sul Basin', 'Espirito Santo Basin', 'Campos Basin', 'Santos Basin'], rgb: [120, 160, 140] },
      { slug: 'parana', name: 'Paraná Basin and the Pelotas Margin', system: 'basin', provinces: ['Parana Basin', 'Pelotas Basin'], rgb: [170, 170, 110] },
      { slug: 'chaco-pampas', name: 'Chaco and the Pampas', system: 'basin', provinces: ['Chaco Basin', 'Oran-Olmedo Basin', 'Santa Cruz-Tarija Basin', 'Laboulaye-Macachin Basin', 'Salado Basin', 'Mercedes Basin'], rgb: [210, 190, 130] },
      { slug: 'sub-andean-foreland', name: 'Sub-Andean Foreland Basins', system: 'basin', provinces: ['Putumayo-Oriente-Maranon Basin', 'Ucayali Basin', 'Huallaga Basin', 'Acre Basin', 'Madre dos Dios Basin', 'Beni Basin', 'Santiago Basin'], rgb: [130, 170, 100] },
      { slug: 'northern-andes', name: 'Northern Andes and the Caribbean Coast', system: 'orogen', provinces: ['West-Central Cordillera', 'Eastern Cordillera Basin', 'Upper Magdelena', 'Middle Magdelena', 'Lower Magdelena', 'Cauca Basin', 'Cesar Basin', 'Sierra Nevada de Santa Marta', 'Perija-Venezuela-Coastal Ranges', 'Maracaibo Basin', 'Falcon Basin', 'Guajira Basin', 'Bonaire Basin', 'Cariaco Basin', 'Tobago Trough'], rgb: [160, 110, 120] },
      { slug: 'llanos-orinoco', name: 'Llanos and the Orinoco', system: 'basin', provinces: ['Llanos Basin', 'Barinas-Apure Basin', 'East Venezuela Basin'], rgb: [190, 190, 120] },
      { slug: 'andes', name: 'Central and Southern Andes', system: 'orogen', provinces: ['Andean Province', 'Altiplano Basin', 'Familina Province', 'Salar de Atacama Basin', 'Cuyo Basin', 'Bermejo Basin', 'Bolsones Basin', 'Mascasin Basin', 'Neuquen Basin'], rgb: [150, 100, 110] },
      { slug: 'pacific-forearc', name: 'Pacific Forearc Basins', system: 'basin', provinces: ['Central Chile Forearc Basin', 'Temuco Basin', 'Curico Basin', 'Osorno-Llanquihue Basin', 'Mollendo-Tarapaca Basin', 'Moquegua-Tamaruga Basin', 'Pisco Basin', 'Lima Basin', 'Salaverry Basin', 'Trujillo Basin', 'Sechura Basin', 'Talara Basin', 'Lancones Basin', 'Progreso Basin', 'Manabi Basin', 'Borbon Basin', 'Penas Basin', 'Madre de Dios Basin', 'Diego Ramirez Basin'], rgb: [120, 140, 170] },
      { slug: 'patagonia', name: 'Patagonia', system: 'plateau', provinces: ['Canadon Asfalto', 'Deseado-Falklands Province', 'San Jorge Basin', 'Colorado Basin', 'Nirihuau Basin', 'East Patagonia Basin', 'Magallanes Basin', 'Malvinas Basin'], rgb: [200, 180, 150] },
      { slug: 'falkland-plateau', name: 'Falkland Plateau and the North Scotia Ridge', system: 'plateau', provinces: ['Falklands Plateau', 'Malvinas Plateau', 'Burdwood Bank - North Scotia Ridge'], rgb: [140, 150, 180] },
    ],
  },
  {
    slug: 'antarctica', name: 'Terra Antarctica', build: true, plates: ['Antarctica', 'Shetland'],
    principle: 'Antarctica with its ice shelves to its continental margin, and the South Shetlands and South Orkneys (ZR23): the Antarctic plate\'s land and shelf, the Southern Ocean beyond it Mare Australe\'s.',
    zones: [
      { slug: 'antarctic-peninsula', name: 'Antarctic Peninsula and the South Shetlands', system: 'arc', provinces: ['Antarctica Peninsula', 'Bransfield Offshore', 'Scotia Ridge Offshore'], rgb: [160, 170, 200] },
      { slug: 'weddell', name: 'Weddell Sea and the Filchner–Ronne', system: 'basin', provinces: ['Weddell Offshore'], rgb: [180, 200, 220] },
      { slug: 'queen-maud-land', name: 'Queen Maud Land', system: 'shield', provinces: ['Queen Maud Onshore', 'Queen Maud/Enderby Offshore'], rgb: [200, 200, 220] },
      // The shelf: Mare Australe's Amundsen–Bellingshausen Zone holds the abyssal plains beyond the margin (ZR26).
      { slug: 'amundsen-bellingshausen-shelf', name: 'Amundsen and Bellingshausen Shelf', system: 'basin', provinces: ['Amundsen/Bellingshausen Offshore'], rgb: [170, 190, 210] },
      { slug: 'polar-plateau', name: 'Polar Plateau', system: 'plateau', provinces: ['Polar Province'], rgb: [225, 230, 240] },
      { slug: 'marie-byrd-land', name: 'Marie Byrd Land', system: 'rift', provinces: ['Marie Byrd Onshore'], rgb: [190, 200, 225] },
      { slug: 'transantarctic-mountains', name: 'Transantarctic Mountains', system: 'orogen', provinces: ['Transantarctica Mountains'], rgb: [170, 170, 190] },
      { slug: 'wilkes-land', name: 'Wilkes Land and the East Antarctic Shield', system: 'shield', provinces: ['Wilkes Onshore', 'Scott Offshore'], rgb: [210, 215, 230] },
      { slug: 'ross', name: 'Ross Sea and the Ross Ice Shelf', system: 'basin', provinces: ['Ross Offshore'], rgb: [180, 195, 215] },
    ],
  },
];
const terraCode = (slug: string) => TERRAE.findIndex((t) => t.slug === slug) + 1;

/** A plate's Terra where the plate has one; the Eurasian plate has several, so its provinces say. */
const TERRA_OF_PLATE: Record<string, string> = {
  AF: 'africana', SO: 'africana', AR: 'arabica', AS: 'europaea', AT: 'tethyana', IN: 'indica', AU: 'sahulica', SU: 'sundaica',
  BU: 'sundaica', NA: 'laurentia', CA: 'laurentia', SA: 'amazonia', ND: 'amazonia', AP: 'amazonia', AN: 'antarctica',
  YA: 'sinica', AM: 'sinica', ON: 'sinica', OK: 'borealis', PS: 'sundaica',
  // Wallacea's and Melanesia's small plates, provisionally, until Wallace's Line is drawn: the Molucca Sea's and the
  // Banda Sea's with Sundaica, Timor's, the Bird's Head's and Melanesia's continental islands with Sahulica.
  MS: 'sundaica', BS: 'sundaica', TI: 'sahulica', BH: 'sahulica', WL: 'sahulica', MO: 'sahulica', SB: 'sahulica', NB: 'sahulica', SS: 'sahulica', MN: 'sahulica',
  // The Isthmus with Laurentia, the line at the Darién (ZR23); Tierra del Fuego's Scotia plate with Amazonia, the South
  // Shetlands' with Antarctica. The Pacific plate has no Terra: Baja's provinces are Laurentia's, eastern New Zealand's Sahulica's.
  PM: 'laurentia', SC: 'amazonia', SL: 'antarctica',
};
/** Provinces of a Terra not built yet, named so the built ones end where the owner drew (ZR20). */
const PROVINCE_TERRA: Record<string, string> = {
  'Zagros Fold Belt': 'tethyana', 'Zagros Thrust Zone': 'tethyana', 'Great Caucasus Foldbelt': 'tethyana', 'Rioni Basin': 'tethyana',
  'Kura Basin': 'tethyana', 'South Caspian Basin': 'tethyana', 'Lesser Caucasus': 'tethyana', 'Adana/Sivas': 'tethyana', 'Araks': 'tethyana',
  'Tuz/Corum': 'tethyana', 'Kardiff/Menders Massif': 'tethyana', 'Central Iranian Basins': 'tethyana', 'Alborz Fold Belt': 'tethyana',
  'Mugodzhary-South Emba': 'tethyana', 'North Ustyurt Basin': 'tethyana', 'Mangyshlak-Ustyurt Foldbelt': 'tethyana',
  // The Kazakh steppe with the West Siberian side (ZR21); the Himalaya to Indica, Tibet behind the suture to Sinica (ZR21).
  'West Siberian Basin': 'borealis', 'Turgay Depression': 'borealis', 'South Turgay Basin': 'borealis', 'Central Kazakhstan Folded Region': 'borealis',
  'Himalayan': 'indica',
  // The Indo-Burman ranges and Myanmar with Sundaica (ZR22); western Yunnan's Simao block and Indochina too.
  'Indo-Burman': 'sundaica', 'North Burma': 'sundaica', 'Irrawaddy': 'sundaica', 'Tenasserim-Shan': 'sundaica',
  'Lanping Simao Basin': 'sundaica', 'Truong Son Fold Belt': 'sundaica',
};
/** Provinces split by a line's rule, not given whole to one Terra. */
const SPLIT: Record<string, 'plate' | 'barrier' | 'caspian-west' | 'median' | 'straits' | 'lat24'> = {
  'Red Sea Basin': 'plate', 'Mediterranean Basin': 'plate', 'Syrian Arch': 'plate', 'Nile Delta Basin': 'plate', 'Pelagian Basin': 'plate',
  'Middle Caspian Basin': 'caspian-west',
  'Black Sea Deep-Water Basin': 'median', 'Black Sea Continental Slope': 'median', 'Northeast Black Sea Shelf': 'median',
  'Thrace/Samsun': 'straits',
  // The Sea of Okhotsk at its median (ZR22); the Gulf of Tonkin and the South China Sea's shelf between their lands.
  'Central Okhotsk High': 'median', 'South Okhotsk Basin': 'median', 'Deryugin Basin': 'median', 'Kuril-Kamchatka Slope': 'median',
  'Yinggehai Basin': 'median', 'South China Continental Shelf Slope': 'median',
  // The Jinsha–Ailao Shan–Song Ma belt, along the Red River fault: Sinica's north of 24° N, Sundaica's south (ZR22).
  'Sulongshan Fold Belt': 'lat24',
  // The Bering and Chukchi seas at their median between Asia's and America's coasts (ZR23).
  'Bering Shelf-Margin Basins OCS': 'median', 'Navarin Basin OCS': 'median', 'North Aleutian Basin OCS': 'median', 'St. George Basin OCS': 'median',
  'Norton Basin OCS': 'median', 'St. Matthew-Hall Basin OCS': 'median', 'Hope Basin OCS': 'median', 'Chukchi Shelf OCS': 'median', 'Chukchi Borderland OCS': 'median',
  'South Chukchi-Hope Basin': 'median', 'North Chukchi Basin': 'median', 'Wrangel Basin': 'median', 'Wrangel-Herald Uplift': 'median', 'Gangut High': 'median', 'Khatyrka Basin': 'median',
  // Across the Darién and South America's Caribbean shelf: the Panama plate Laurentia's, the North Andes' Amazonia's (ZR23).
  'Choco Pacific Basin': 'plate', 'Pacific Offshore Basin': 'plate', 'South Caribbean Deformed Belt': 'plate',
  'North Caspian Basin': 'barrier', 'Volga-Ural Region': 'barrier', 'Altay-Sayan Folded Region': 'barrier',
};
/**
 * Provinces split by a drawn line: flooded from the first Terra's seeds up to the line, the rest the second's.
 * The Ural River from Natural Earth's course (ZR20); the Altai and Sayan crests from approximate points (ZR22).
 */
const BARRIERS: Array<{ name: string; provinces: string[]; river?: string; line?: Ring; seeds: Array<[number, number]>; first: string; second: string }> = [
  { name: 'the Ural River', provinces: ['North Caspian Basin', 'Volga-Ural Region'], river: 'Ural', seeds: [[48.7, 44.5], [56, 50]], first: 'europaea', second: 'tethyana' },
  {
    name: 'the Altai and Sayan crests (approximate)', provinces: ['Altay-Sayan Folded Region'], seeds: [[53.3, 85.0], [54.5, 90.0]], first: 'borealis', second: 'sinica',
    line: [[80.0, 46.0], [84.0, 47.2], [85.6, 47.9], [86.8, 48.9], [87.8, 49.17], [89.0, 49.7], [90.0, 50.3], [91.5, 51.3], [92.5, 52.0], [94.5, 52.5], [96.5, 52.6], [98.5, 52.4], [100.6, 51.7], [102.5, 51.6], [104.0, 51.6], [106.5, 51.6]],
  },
];
/** The Red River delta, Sundaica's though its province is South China's (ZR22). [lon, lat]. */
const RED_RIVER_DELTA: Ring = [[105.2, 20.0], [107.0, 20.0], [107.0, 21.3], [106.0, 21.45], [105.2, 21.2], [105.2, 20.0]];
/** Thrace, west of the Bosporus, the Sea of Marmara's middle and the Dardanelles: the Balkans', Europaea's. [lon, lat]. */
const EAST_THRACE: Ring = [[23.5, 40.0], [26.4, 40.05], [26.75, 40.3], [27.4, 40.62], [28.2, 40.78], [28.98, 40.98], [29.08, 41.2], [29.2, 41.6], [28.0, 42.8], [23.5, 42.8], [23.5, 40.0]];

/** USGS's catch-all for the open ocean: no province, so its land-side cells take their plate's Terra or their nearest. */
const OCEAN = 'Ocean';
/** The line Africana ends at in the north-east (ZR19): the Gulf of Suez's axis, the canal, then north to sea. [lon, lat]. */
const SUEZ_LINE: Ring = [[33.9, 27.68], [33.45, 28.0], [33.1, 28.5], [32.75, 29.2], [32.55, 29.93], [32.55, 29.97], [32.37, 30.35], [32.3, 30.6], [32.32, 30.86], [32.31, 31.26], [32.32, 31.4]];
function suezLon(lat: number): number | null {
  if (lat < SUEZ_LINE[0][1] || lat > 37) return null;
  if (lat >= SUEZ_LINE[SUEZ_LINE.length - 1][1]) return SUEZ_LINE[SUEZ_LINE.length - 1][0];
  for (let k = 0; k + 1 < SUEZ_LINE.length; k++) {
    const [x1, y1] = SUEZ_LINE[k]; const [x2, y2] = SUEZ_LINE[k + 1];
    if (lat >= y1 && lat <= y2) return y2 === y1 ? x1 : x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1);
  }
  return null;
}
/**
 * Where ZR19 parts a sea at a midline between moved land and its neighbours: the Sicily Channel and Malta's shelf, the
 * Alborán Sea, the Levant's and Suez's waters. Elsewhere water keeps its province's or plate's line (the Ionian, ZR20).
 */
const MARGIN_PROVINCES = ['Pelagian Basin', 'Betic Zone', 'Rif Basin', 'Levantine Basin', 'Sinai Basin', 'Nile Delta Basin', 'Syrian Arch'];
/** A Terra's piece smaller than this, bordering another Terra, is a crumb of the cut, not a place. */
const CRUMB_KM2 = 5_000;
const box = (s: number, w: number, n: number, e: number): Ring => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/** Islands ZR19 puts in Europaea though their province is Africana's: Malta, Gozo and Comino (Sicily's province is Europaea's). */
const MALTA = box(35.78, 14.15, 36.1, 14.6);
/** The owner's reference Zone takes in "the Shire and Lower Zambezi to Beira" (the handoff, 17 October); approximate. */
const SHIRE_LOWER_ZAMBEZI: Ring = [[33.0, -15.5], [35.8, -14.3], [36.2, -16.0], [37.0, -18.3], [36.6, -19.2], [35.0, -20.0], [34.2, -19.6], [33.4, -17.6], [32.6, -16.6], [33.0, -15.5]];
/** The reference Zone's own first cut of its Sectors (the handoff), each at a point it holds. */
const EAR_SECTORS: Array<{ lat: number; lon: number; name: string }> = [
  { lat: 12.6, lon: 41.6, name: 'Afar Triangle' }, { lat: 10.2, lon: 38.4, name: 'Ethiopian Highlands' },
  { lat: 7.6, lon: 38.7, name: 'Main Ethiopian Rift' }, { lat: 3.8, lon: 36.1, name: 'Omo–Turkana' },
  { lat: 0.0, lon: 36.3, name: 'Kenya Rift and Dome' }, { lat: -1.0, lon: 33.0, name: 'Lake Victoria Basin' },
  { lat: 1.6, lon: 30.6, name: 'Albertine Rift' }, { lat: -2.4, lon: 29.0, name: 'Kivu–Ruzizi' },
  { lat: -6.0, lon: 29.7, name: 'Tanganyika' }, { lat: -8.4, lon: 32.6, name: 'Rukwa–Rungwe' },
  { lat: -12.0, lon: 34.5, name: 'Malawi Rift' }, { lat: -17.5, lon: 35.3, name: 'Shire and Lower Zambezi' },
];

const SOURCES: Record<string, ZspSourceOut> = {
  pb2002: { name: 'PB2002 plates (Bird 2003), Hugo Ahlenius\'s GeoJSON conversion', licence: 'ODC-BY-1.0', url: 'https://github.com/fraxen/tectonicplates', for: 'the plates and the lines between Terrae' },
  usgs: { name: 'Geologic Provinces of the World, 2000 (Osmonson, Persits, Steinshouer and Klett, USGS)', licence: 'public domain', url: 'https://doi.org/10.5066/P9RMSU2R', for: 'the Zones' },
  etopo: { name: 'ETOPO 2022 60 arc-second ice surface (NOAA NCEI)', licence: 'CC0-1.0', url: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model', for: 'depths, the margin and the drainage divides' },
  earthbyte: { name: 'EarthByte continental polygons (Müller et al. 2019)', licence: 'CC-BY-3.0', url: 'https://www.earthbyte.org/gplates-2-3-software-and-data-sets/', for: 'the continental margin' },
  resolve: { name: 'RESOLVE Ecoregions 2017 (Dinerstein et al. 2017)', licence: 'CC-BY-4.0', url: 'https://ecoregions.appspot.com/', for: 'the Sectors\' ecoregions and names' },
  naturalEarth: { name: 'Natural Earth 1:10m land, lakes, regions, seas and countries', licence: 'public domain', url: 'https://www.naturalearthdata.com/', for: 'dry land, names and the countries listed' },
};

/** A raster read once and kept: rasterising a large source takes minutes. */
function cached<T>(path: string, make: () => { grid: Int32Array; meta: T }): { grid: Int32Array; meta: T } {
  if (existsSync(`${path}.i32.gz`)) return { grid: new Int32Array(gunzipSync(readFileSync(`${path}.i32.gz`)).buffer.slice(0)), meta: JSON.parse(readFileSync(`${path}.json`, 'utf8')) };
  const made = make();
  writeFileSync(`${path}.i32.gz`, gzipSync(Buffer.from(made.grid.buffer)));
  writeFileSync(`${path}.json`, JSON.stringify(made.meta));
  return made;
}

/** Spreads labels (> 0) to every cell `pass` lets through, nearest first (4-neighbours). */
function spread(labels: Int32Array, pass: (c: number) => boolean): void {
  let queue: number[] = [];
  for (let c = 0; c < W * H; c++) if (labels[c] > 0) queue.push(c);
  while (queue.length) {
    const next: number[] = [];
    for (const c of queue) for (const n of neighbours(c)) if (n >= 0 && labels[n] === 0 && pass(n)) { labels[n] = labels[c]; next.push(n); }
    queue = next;
  }
}

function main(): void {
  const [dataDir, outDir] = process.argv.slice(2);
  if (!dataDir || !outDir) throw new Error('usage: build-terrae.ts <data dir> <out dir>');
  const t0 = Date.now();
  const say = (what: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${what}`);
  // Mecha Jono's Zone ids are theirs (S8): a Terra Zone that takes one is refused before anything is cut.
  const mariaDir = process.argv.find((a) => a.startsWith('--maria='))?.slice('--maria='.length) ?? 'data/zsp2/maria';
  const held = mariaZoneIds(mariaDir);
  const taken = TERRAE.flatMap((t) => t.zones ?? []).map((z) => `zone:${z.slug}`).filter((id) => held.has(id));
  if (taken.length) throw new Error(`Terra Zone ids Mecha Jono's manifest holds: ${taken.join(', ')}`);

  const containers = new Uint32Array(gunzipSync(readFileSync('data/zsp2/containers/containers-0.1.u32.bin.gz')).buffer.slice(0));
  const landSide = (c: number) => containers[c] === 0;
  const ne = (f: string) => join(dataDir, 'ne', `${f}.geojson`);
  const land = fillGeoJson(ne('ne_10m_land')); fillGeoJson(ne('ne_10m_minor_islands'), land);
  const lake = fillGeoJson(ne('ne_10m_lakes'));
  const relief = new Int16Array(readFileSync(join(dataDir, 'etopo', 'etopo2022-0.1.i16')).buffer.slice(0));

  // The plates.
  const platesDoc = JSON.parse(readFileSync(join(dataDir, 'pb2002', 'PB2002_plates.json'), 'utf8')) as { features: Array<{ properties: { Code: string; PlateName: string }; geometry: { type: string; coordinates: unknown } }> };
  const plateCodes = [...new Set(platesDoc.features.map((f) => f.properties.Code))];
  const plateNames = plateCodes.map((code) => platesDoc.features.find((f) => f.properties.Code === code)!.properties.PlateName);
  const plate = new Uint8Array(W * H);
  for (const f of platesDoc.features) {
    const code = plateCodes.indexOf(f.properties.Code) + 1;
    for (const rings of polygonsOf(f.geometry)) fillRings(plate, rings, code);
  }
  const terraOfPlate = (c: number) => (plate[c] ? terraCode(TERRA_OF_PLATE[plateCodes[plate[c] - 1]] ?? '') : 0);

  // The provinces, once.
  const provinces = cached(join(dataDir, 'usgs-world', 'provinces-0.1'), () => {
    const names: string[] = []; const regions: string[] = []; const grid = new Int32Array(W * H);
    forEachShape(join(dataDir, 'usgs-world', 'WEP_PRVG', 'WEP_PRVG'), [-180, -90, 180, 90], (rings, attrs) => {
      let k = names.indexOf(attrs.NAME); if (k < 0) { names.push(attrs.NAME); regions.push(attrs.REG); k = names.length - 1; }
      fillRings(grid, rings, k + 1);
    });
    return { grid, meta: { names, regions } };
  });
  const provinceOf = provinces.grid; const provinceNames = provinces.meta.names; const provinceRegion = provinces.meta.regions;
  say(`${plateCodes.length} plates, ${provinceNames.length} provinces`);

  // Each province's Terra: the Zone that names it, else the list above, else its plate's (by most of its cells).
  const provinceTerra = new Int32Array(provinceNames.length + 1);
  const zoneOfProvince = new Map<number, { terra: number; zone: number }>();
  for (const t of TERRAE) (t.zones ?? []).forEach((z, k) => z.provinces.forEach((name) => {
    const p = provinceNames.indexOf(name) + 1;
    if (!p) throw new Error(`no province named "${name}"`);
    zoneOfProvince.set(p, { terra: terraCode(t.slug), zone: k + 1 }); provinceTerra[p] = terraCode(t.slug);
  }));
  for (const [name, slug] of Object.entries(PROVINCE_TERRA)) { const p = provinceNames.indexOf(name) + 1; if (p && !provinceTerra[p]) provinceTerra[p] = terraCode(slug); }
  // The former Soviet Union's provinces Borealis's and Europe's Europaea's unless named above: Chukotka lies on PB2002's
  // North American plate, and its vote would make it Laurentia's.
  for (let p = 1; p <= provinceNames.length; p++) {
    if (provinceTerra[p] || provinceNames[p - 1] === OCEAN) continue;
    if (provinceRegion[p - 1] === '1') provinceTerra[p] = terraCode('borealis');
    if (provinceRegion[p - 1] === '4') provinceTerra[p] = terraCode('europaea');
    if (provinceRegion[p - 1] === '5') provinceTerra[p] = terraCode('laurentia');
  }
  {
    const votes = new Map<number, Map<number, number>>();
    for (let c = 0; c < W * H; c++) {
      const p = provinceOf[c]; if (!p || provinceTerra[p] || !landSide(c) || provinceNames[p - 1] === OCEAN) continue;
      const t = terraOfPlate(c); if (!t) continue;
      const m = votes.get(p) ?? new Map<number, number>(); m.set(t, (m.get(t) ?? 0) + 1); votes.set(p, m);
    }
    for (const [p, m] of votes) provinceTerra[p] = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // The Eurasian plate has several Terrae: a province mostly on it that no Zone names takes its USGS region's, for
    // now (the Middle East's and South Asia's Tethyana, Asia-Pacific's Sinica). A province mostly on a plate with no
    // Terra (the Pacific's) takes none: its cells their plate's or their nearest's.
    const EU_BY_REGION: Record<string, string> = { 4: 'europaea', 2: 'tethyana', 8: 'tethyana', 3: 'sinica', 1: 'borealis' };
    const EU = plateCodes.indexOf('EU') + 1;
    const onEu = new Map<number, [number, number]>();
    for (let c = 0; c < W * H; c++) {
      const p = provinceOf[c]; if (!p || provinceTerra[p] || !landSide(c)) continue;
      const m = onEu.get(p) ?? [0, 0]; m[plate[c] === EU ? 0 : 1]++; onEu.set(p, m);
    }
    for (const [p, [eu, other]] of onEu) {
      if (provinceNames[p - 1] !== OCEAN && eu > other && EU_BY_REGION[provinceRegion[p - 1]]) provinceTerra[p] = terraCode(EU_BY_REGION[provinceRegion[p - 1]]);
    }
  }

  // 1. The land side's cells: by province, a split province by its rule.
  const terra = new Int32Array(W * H);
  const AFRICANA = terraCode('africana'); const ARABICA = terraCode('arabica'); const EUROPAEA = terraCode('europaea'); const TETHYANA = terraCode('tethyana');
  const caspian = (() => {
    const water = newMask(); for (let c = 0; c < W * H; c++) water[c] = landSide(c) && !land[c] ? 1 : 0;
    const parts = components(water); const seed = rowOf(42) * W + colOf(50.5);
    const m = newMask(); for (let c = 0; c < W * H; c++) if (parts[c] && parts[c] === parts[seed]) m[c] = 1; return m;
  })();
  // The barriers: a river from Natural Earth's course, or a line from points.
  const barrierLines = BARRIERS.map(() => newMask());
  forEachShapeLines(join(dataDir, 'ne-physical', 'ne_10m_rivers_lake_centerlines'), (points, attrs) => {
    BARRIERS.forEach((b, k) => { if (b.river && attrs.name === b.river) for (let s = 0; s + 1 < points.length; s++) drawSegment(barrierLines[k], points[s], points[s + 1]); });
  });
  BARRIERS.forEach((b, k) => { if (b.line) for (let s = 0; s + 1 < b.line.length; s++) drawSegment(barrierLines[k], b.line[s], b.line[s + 1]); });
  const barrierOf = new Map<number, number>();
  BARRIERS.forEach((b, k) => b.provinces.forEach((n) => barrierOf.set(provinceNames.indexOf(n) + 1, k)));
  const eastThrace = newMask(); fillRings(eastThrace, [EAST_THRACE]);
  const needsMedian: number[] = [];
  for (let c = 0; c < W * H; c++) {
    if (!landSide(c)) continue;
    const p = provinceOf[c] && provinceNames[provinceOf[c] - 1] !== OCEAN ? provinceOf[c] : 0;
    const rule = p ? SPLIT[provinceNames[p - 1]] : undefined;
    if (caspian[c]) { terra[c] = TETHYANA; continue; }
    if (rule === 'plate') terra[c] = terraOfPlate(c);
    // A median province's land too: its coast is Anatolia's on one side and Europe's on the other.
    else if (rule === 'median') needsMedian.push(c);
    else if (rule === 'caspian-west') terra[c] = lonOf(c % W) < 50 ? EUROPAEA : TETHYANA;
    else if (rule === 'barrier') terra[c] = -1 - barrierOf.get(p)!;   // flooded below
    else if (rule === 'straits') terra[c] = eastThrace[c] ? EUROPAEA : TETHYANA;
    else if (rule === 'lat24') terra[c] = latOf(Math.floor(c / W)) < 24 ? terraCode('sundaica') : terraCode('sinica');
    else terra[c] = p ? provinceTerra[p] : terraOfPlate(c);
  }
  // Each barrier's provinces: the first Terra's from its seeds up to the line, the rest the second's.
  BARRIERS.forEach((b, k) => {
    const mark = -1 - k; const first = terraCode(b.first); const second = terraCode(b.second);
    const stack = b.seeds.map(([la, lo]) => rowOf(la) * W + colOf(lo)).filter((s) => terra[s] === mark);
    for (const s of stack) terra[s] = first;
    while (stack.length) {
      const c = stack.pop()!;
      for (const n of neighbours(c)) if (n >= 0 && terra[n] === mark && !barrierLines[k][n]) { terra[n] = first; stack.push(n); }
    }
    for (let c = 0; c < W * H; c++) if (terra[c] === mark) terra[c] = barrierLines[k][c] ? first : second;
  });
  // ZR22: the Red River delta Sundaica's.
  const delta = newMask(); fillRings(delta, [RED_RIVER_DELTA]);
  for (let c = 0; c < W * H; c++) if (delta[c] && landSide(c) && terra[c] === terraCode('sinica')) terra[c] = terraCode('sundaica');
  // ZR19: Africana ends at the Suez line, water included.
  let suez = 0;
  for (let c = 0; c < W * H; c++) {
    if (terra[c] !== AFRICANA) continue;
    const lon = suezLon(latOf(Math.floor(c / W)));
    if (lon !== null && lonOf(c % W) > lon && lonOf(c % W) < 37) { terra[c] = ARABICA; suez++; }
  }
  // ZR19: Malta to Europaea. Then the land ZR19 moved off its plate's Terra (Sicily and Malta, Sinai and the Levant, the
  // Rif) keeps a margin: shallow water nearest to it goes with it, so the Sicily Channel, the Gulf of Suez and the
  // Alborán Sea part at their midlines. Whatever its province says: Malta lies across two.
  const malta = newMask(); fillRings(malta, [MALTA]);
  let maltaCells = 0;
  for (let c = 0; c < W * H; c++) if (malta[c] && land[c] && landSide(c) && terra[c] !== EUROPAEA) { terra[c] = EUROPAEA; maltaCells++; }
  const AF = plateCodes.indexOf('AF') + 1; const EU = plateCodes.indexOf('EU') + 1;
  const moved = newMask();
  for (let c = 0; c < W * H; c++) {
    if (!land[c] || !landSide(c)) continue;
    if ((plate[c] === AF && (terra[c] === EUROPAEA || terra[c] === ARABICA)) || (plate[c] === EU && terra[c] === AFRICANA)) moved[c] = 1;
  }
  // A median sea's land: the Terra of the land it joins, nearest first over land (Turkey's Pontic coast, Crimea); an
  // island wholly in the sea's provinces its own province's (St Lawrence Island America's, Wrangel Island Asia's),
  // wherever its nearest coast. Nearest, not a vote: Africa and Eurasia are one landmass at Suez.
  const median = newMask(); for (const c of needsMedian) median[c] = 1;
  {
    const overLand = new Int32Array(W * H);
    for (let c = 0; c < W * H; c++) if (landSide(c) && land[c] && !median[c] && terra[c] > 0) overLand[c] = terra[c];
    spread(overLand, (n) => landSide(n) && land[n] === 1 && median[n] === 1);
    for (const c of needsMedian) {
      if (!land[c]) continue;
      terra[c] = overLand[c] || provinceTerra[provinceOf[c]];
      median[c] = 0;
    }
  }
  // Any land-side cell still without a Terra (no province, no plate) takes its nearest's; the median seas their nearest land's.
  const nearestLand = new Int32Array(W * H);
  for (let c = 0; c < W * H; c++) if (landSide(c) && land[c] && terra[c] > 0 && !median[c]) nearestLand[c] = c + 1;
  spread(nearestLand, (n) => landSide(n) && (!land[n] || median[n] === 1));
  for (const c of needsMedian) if (median[c]) terra[c] = nearestLand[c] ? terra[nearestLand[c] - 1] : 0;
  // A margin is shallow water joined to its land: nearest measured through water shallower than 2,000 m only.
  const nearestShallow = new Int32Array(W * H);
  for (let c = 0; c < W * H; c++) if (landSide(c) && land[c] && terra[c] > 0) nearestShallow[c] = c + 1;
  spread(nearestShallow, (n) => landSide(n) && !land[n] && relief[n] >= -2000);
  let margin = 0;
  const marginProvinces = new Set(MARGIN_PROVINCES.map((n) => provinceNames.indexOf(n) + 1));
  for (let c = 0; c < W * H; c++) {
    if (!landSide(c) || land[c] || !nearestShallow[c] || !marginProvinces.has(provinceOf[c])) continue;
    const from = nearestShallow[c] - 1;
    if (moved[from] && terra[c] !== terra[from]) { terra[c] = terra[from]; margin++; }
  }
  {
    const fill = Int32Array.from(terra, (t, c) => (landSide(c) && t > 0 ? t : 0));
    spread(fill, (n) => landSide(n));
    for (let c = 0; c < W * H; c++) if (landSide(c) && terra[c] <= 0) terra[c] = fill[c];
  }
  // Water cut off from all its Terra's land joins the Terra it borders most.
  let stranded = 0;
  for (let t = 1; t <= TERRAE.length; t++) {
    const mine = newMask(); for (let c = 0; c < W * H; c++) if (terra[c] === t && landSide(c)) mine[c] = 1;
    const bits = components(mine);
    const hasLand = new Set<number>(); for (let c = 0; c < W * H; c++) if (bits[c] && land[c]) hasLand.add(bits[c]);
    const border = new Map<number, Map<number, number>>();
    for (let c = 0; c < W * H; c++) {
      if (!bits[c] || hasLand.has(bits[c])) continue;
      for (const n of neighbours(c)) if (n >= 0 && landSide(n) && terra[n] && terra[n] !== t) {
        const m = border.get(bits[c]) ?? new Map<number, number>(); m.set(terra[n], (m.get(terra[n]) ?? 0) + 1); border.set(bits[c], m);
      }
    }
    for (let c = 0; c < W * H; c++) {
      const m = bits[c] && !hasLand.has(bits[c]) ? border.get(bits[c]) : undefined;
      if (m) { terra[c] = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]; stranded++; }
    }
  }
  // A crumb of a Terra under CRUMB_KM2, left by a median or a province's edge, joins the Terra it borders most.
  let crumbs = 0;
  for (let t = 1; t <= TERRAE.length; t++) {
    const mine = newMask(); for (let c = 0; c < W * H; c++) if (terra[c] === t && landSide(c)) mine[c] = 1;
    const bits = components(mine);
    const size = new Map<number, number>(); for (let c = 0; c < W * H; c++) if (bits[c]) size.set(bits[c], (size.get(bits[c]) ?? 0) + cellKm2(Math.floor(c / W)));
    const border = new Map<number, Map<number, number>>();
    for (let c = 0; c < W * H; c++) {
      if (!bits[c] || (size.get(bits[c]) ?? 0) >= CRUMB_KM2) continue;
      for (const n of neighbours(c)) if (n >= 0 && landSide(n) && terra[n] && terra[n] !== t) {
        const m = border.get(bits[c]) ?? new Map<number, number>(); m.set(terra[n], (m.get(terra[n]) ?? 0) + 1); border.set(bits[c], m);
      }
    }
    for (let c = 0; c < W * H; c++) {
      const m = bits[c] ? border.get(bits[c]) : undefined;
      if (m) { terra[c] = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]; crumbs++; }
    }
  }
  say(`the barriers drawn: ${BARRIERS.map((b, k) => `${b.name} ${barrierLines[k].reduce((a, x) => a + x, 0)} cells`).join(', ')}; the land side coded: ${suez} cells to Arabica at the Suez line, ${maltaCells} of Malta to Europaea with ${margin} of margin, ${needsMedian.length} by the median, ${stranded} stranded water joined, ${crumbs} cells of crumbs joined`);

  // Shared grids for naming and describing.
  const resolve = cached(join(dataDir, 'resolve', 'ecoregions-world-0.1'), () => {
    const names: Array<{ name: string; biome: string }> = [{ name: '', biome: '' }]; const grid = new Int32Array(W * H);
    forEachShape(join(dataDir, 'resolve', 'Ecoregions2017'), [-180, -90, 180, 90], (rings, attrs) => {
      names.push({ name: attrs.ECO_NAME, biome: attrs.BIOME_NAME }); fillRings(grid, rings, names.length - 1);
    });
    return { grid, meta: names };
  });
  const named = (base: string, field: string) => {
    const names: string[] = []; const grid = new Int32Array(W * H);
    forEachShape(join(dataDir, 'ne-physical', base), [-180, -90, 180, 90], (rings, attrs) => {
      const n = attrs[field] || attrs.name || attrs.NAME; if (!n) return;
      names.push(n); fillRings(grid, rings, names.length);
    });
    return { grid, names };
  };
  const marine = named('ne_10m_geography_marine_polys', 'name_en');
  const regions = named('ne_10m_geography_regions_polys', 'NAME_EN');
  const lakes = (() => {
    const doc = JSON.parse(readFileSync(ne('ne_10m_lakes'), 'utf8')) as { features: Array<{ properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }> };
    const names: string[] = []; const grid = new Int32Array(W * H);
    for (const f of doc.features) {
      const n = f.properties.name_en || f.properties.name; if (!n || !f.geometry) continue;
      names.push(n); for (const rings of polygonsOf(f.geometry)) fillRings(grid, rings, names.length);
    }
    return { grid, names };
  })();
  const countries = (() => {
    const doc = JSON.parse(readFileSync('public/geopolitical/world-territories-lod1.geojson', 'utf8')) as { features: Array<{ properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }> };
    const codes: string[] = []; const grid = new Int32Array(W * H);
    for (const f of doc.features) {
      const code = [f.properties.ISO_A2_EH, f.properties.ISO_A2].find((x) => x && x !== '-99');
      if (!code || !f.geometry) continue;
      let k = codes.indexOf(code.toLowerCase()); if (k < 0) { codes.push(code.toLowerCase()); k = codes.length - 1; }
      for (const rings of polygonsOf(f.geometry)) fillRings(grid, rings, k + 1);
    }
    return { grid, codes };
  })();
  say(`${resolve.meta.length - 1} ecoregions, ${marine.names.length} seas, ${regions.names.length} regions, ${lakes.names.length} lakes, ${countries.codes.length} countries`);

  // How a built Terra's edge to another is named, by which line it is.
  const edgeTo = (c: number, n: number): EdgeOut => {
    if (containers[n] >= 1) return { follows: 'margin', name: 'the continental margin', source: 'ETOPO 2022 and EarthByte (ZSP 2.0 Stage 1)' };
    const a = terra[c]; const b = terra[n];
    const j = Math.floor(n / W); const lat = latOf(j); const lon = lonOf(n - j * W);
    const pair = new Set([a, b]);
    const is = (x: string, y: string) => pair.has(terraCode(x)) && pair.has(terraCode(y));
    if (is('africana', 'arabica')) return lat >= 27.6 && lon < 35.5 ? { follows: 'divide', name: 'the Gulf of Suez and the isthmus (ZR19)' } : { follows: 'plate', name: 'the axis of the Red Sea or the Gulf of Aden, the Africa–Arabia plate boundary', source: 'PB2002' };
    if (is('africana', 'europaea')) {
      if (lon < 0) return { follows: 'margin', name: 'the Alborán Sea, parted on its axis (ZR19)' };
      if (lon > 10 && lon < 16.5 && lat < 38.6) return { follows: 'margin', name: 'the Sicily Channel, parted at its midline (ZR19)' };
      return { follows: 'plate', name: 'the Africa–Eurasia plate boundary', source: 'PB2002' };
    }
    if (is('africana', 'tethyana')) return { follows: 'plate', name: 'the Africa–Anatolia plate boundary, the Cyprus arc', source: 'PB2002' };
    if (is('arabica', 'tethyana')) return { follows: 'divide', name: 'the Zagros and Bitlis mountain front (ZR20)', source: 'USGS, Geologic Provinces of the World' };
    if (is('europaea', 'tethyana')) {
      if (caspian[c] || caspian[n]) return { follows: 'margin', name: 'the Caspian\'s shore' };
      if (!land[c] && !land[n]) return { follows: 'margin', name: 'the Black Sea\'s median line (ZR20)' };
      if (lon > 36) return { follows: 'divide', name: 'the Greater Caucasus\'s northern foot (ZR20)', source: 'USGS, Geologic Provinces of the World' };
      if (lat < 50 && lon < 30) return { follows: 'margin', name: 'the Bosporus, the Sea of Marmara and the Dardanelles, or the Aegean between Greek and Anatolian provinces' };
      return { follows: 'divide', name: 'the Ural River (ZR20)', source: 'Natural Earth' };
    }
    if (is('europaea', 'borealis')) return { follows: 'divide', name: 'the Urals\' eastern foot (ZR20)', source: 'USGS, Geologic Provinces of the World' };
    if (is('tethyana', 'borealis')) return { follows: 'divide', name: 'the edge of the Kazakh steppe (ZR21)', source: 'USGS, Geologic Provinces of the World' };
    if (is('tethyana', 'sinica')) return { follows: 'divide', name: 'the Tian Shan\'s and the Pamirs\' feet, at the Tarim, Dzungaria and Tibet (ZR21)', source: 'USGS, Geologic Provinces of the World' };
    if (is('tethyana', 'indica')) return { follows: 'plate', name: 'the Chaman fault and the Himalayan front, the India–Eurasia plate boundary', source: 'PB2002' };
    if (is('borealis', 'sinica')) {
      if (!land[c] && !land[n]) return { follows: 'margin', name: 'the Sea of Okhotsk\'s median line (ZR22)' };
      return lon < 106.5 && lat < 54
        ? { follows: 'divide', name: 'the Altai and Sayan crests (ZR22; approximate)' }
        : { follows: 'divide', name: 'the Siberian craton\'s southern rim, the Baikal and Stanovoy ranges (ZR22)', source: 'USGS, Geologic Provinces of the World' };
    }
    if (is('borealis', 'laurentia')) return { follows: 'margin', name: 'the Bering and Chukchi seas, between Asia\'s and America\'s provinces' };
    if (is('sinica', 'indica')) return { follows: 'divide', name: 'the Indus–Yarlung suture (ZR21)', source: 'USGS, Geologic Provinces of the World' };
    if (is('sinica', 'sundaica')) return !land[c] && !land[n]
      ? { follows: 'margin', name: 'the Gulf of Tonkin and the South China Sea\'s shelf, between their lands' }
      : { follows: 'divide', name: 'the Red River fault and the Ailao Shan (ZR22)', source: 'USGS, Geologic Provinces of the World' };
    if (is('sundaica', 'sahulica')) return { follows: 'margin', name: 'Lydekker\'s Line, the Sahul shelf\'s edge (ZR23)', source: 'ETOPO 2022, USGS' };
    if (is('laurentia', 'amazonia')) return land[c] && land[n]
      ? { follows: 'plate', name: 'the Darién, the Panama plate\'s edge with the North Andes\' (ZR23)', source: 'PB2002' }
      : { follows: 'margin', name: 'the Caribbean, between its arc and South America\'s shelf islands (ZR23)' };
    if (is('borealis', 'laurentia') && !land[c] && !land[n]) return { follows: 'margin', name: 'the Bering and Chukchi seas\' median line (ZR23)' };
    if (is('indica', 'sundaica')) return { follows: 'divide', name: 'the Indo-Burman ranges\' western foot (ZR22)', source: 'USGS, Geologic Provinces of the World' };
    return { follows: 'margin', name: `the edge of ${TERRAE[b - 1]?.name ?? 'the land side'}` };
  };

  const manifest = {
    zsp: '2.0', generated: new Date().toISOString(), generator: 'scripts/zones/build-terrae.ts', licence: 'CC-BY-4.0',
    containers: [] as Array<Record<string, unknown>>, retired: RETIRED,
  };
  const files: Record<string, string> = {};
  mkdirSync(ZONES_DIR, { recursive: true }); mkdirSync(outDir, { recursive: true });

  // Every built Terra's Sectors on one grid, numbered globe-wide, traced once after: neighbours share every edge.
  const globeSector = new Int32Array(W * H);
  let globeSectors = 0;
  const pending: Array<() => void> = [];
  let arcsOfGlobe: ReturnType<typeof traceArcs>['arcs'] = [];
  for (const t of TERRAE) {
    if (!t.build || !t.zones) continue;
    const code = terraCode(t.slug); const tz = t.zones;
    // Its Zones: whole provinces; a cell in none takes its nearest Zone; a sliver joins the neighbour it borders most.
    const zoneOf = new Int32Array(W * H);
    for (let c = 0; c < W * H; c++) {
      if (terra[c] !== code || !landSide(c)) continue;
      const z = zoneOfProvince.get(provinceOf[c]);
      if (z && z.terra === code) zoneOf[c] = z.zone;
    }
    if (t.slug === 'arabica') {
      // The Red Sea's Arabian half is its own margin Zone (ZR19), as Africana's is.
      const rs = provinceNames.indexOf('Red Sea Basin') + 1; const k = t.zones.findIndex((z) => z.slug === 'red-sea-aden-arabia') + 1;
      for (let c = 0; c < W * H; c++) if (terra[c] === code && provinceOf[c] === rs) zoneOf[c] = k;
    }
    if (t.slug === 'tethyana') {
      // The Caspian's water is the Caspian's Zone; Tethyana's half of the Black Sea its own margin Zone, as Europaea's is.
      const cz = t.zones.findIndex((z) => z.slug === 'caspian-sea') + 1; const bz = t.zones.findIndex((z) => z.slug === 'black-sea-south') + 1;
      const black = new Set(['Black Sea Deep-Water Basin', 'Black Sea Continental Slope', 'Northeast Black Sea Shelf'].map((n) => provinceNames.indexOf(n) + 1));
      for (let c = 0; c < W * H; c++) {
        if (terra[c] !== code) continue;
        if (caspian[c]) zoneOf[c] = cz; else if (!land[c] && black.has(provinceOf[c])) zoneOf[c] = bz;
      }
    }
    if (t.slug === 'africana') {
      const ear = t.zones.findIndex((z) => z.slug === 'east-african-rift') + 1;
      const m = newMask(); fillRings(m, [SHIRE_LOWER_ZAMBEZI]);
      for (let c = 0; c < W * H; c++) if (m[c] && terra[c] === code) zoneOf[c] = ear;
    }
    const near = Int32Array.from(zoneOf); spread(near, () => true);
    for (let c = 0; c < W * H; c++) if (terra[c] === code && landSide(c) && !zoneOf[c]) zoneOf[c] = near[c];
    rejoinSlivers(zoneOf, t.zones.length);
    const zoneKm2 = t.zones.map(() => 0); let km2 = 0;
    for (let c = 0; c < W * H; c++) if (zoneOf[c]) { const k = cellKm2(Math.floor(c / W)); zoneKm2[zoneOf[c] - 1] += k; km2 += k; }
    say(`${t.name}: ${(km2 / 1e6).toFixed(2)} M km², ${t.zones.length} Zones: ${t.zones.map((z, k) => `${z.slug} ${(zoneKm2[k] / 1e6).toFixed(2)}`).join(', ')}`);

    const { sectorOf, pieces: sectors, basinOf } = cutSectors({ zoneOf, land, relief, plateOf: plate, ecoregionOf: resolve.grid, say });
    const sorted = sectors.map((p) => p.km2).sort((a, b) => a - b);
    say(`${t.name}: ${sectors.length} Sectors; median ${Math.round(sorted[Math.floor(sorted.length / 2)] / 1000)}k km², ${sorted.filter((k) => k < SECTOR_MIN_KM2).length} under 50k, ${sorted.filter((k) => k > SECTOR_MAX_KM2).length} over 500k`);
    const facts = describeSectors(
      {
        sectorOf, zoneOf, land, relief, plateOf: plate, plateNames, basinOf, ecoregionOf: resolve.grid, ecoregions: resolve.meta,
        marineOf: marine.grid, marineNames: marine.names, lake, countryOf: countries.grid, countryCodes: countries.codes,
        landmarks: [{ of: regions.grid, names: regions.names }, { of: lakes.grid, names: lakes.names }, { of: marine.grid, names: marine.names }],
      },
      sectors.length, (z) => t.zones![z - 1].name, edgeTo, t.slug === 'africana' ? EAR_SECTORS : [],
    );
    for (const [k, f] of facts.entries()) if (f.sizeReason) say(`  ${f.name} (zone:${t.zones[sectors[k].zone - 1].slug}): ${Math.round(f.km2)} km², ${f.sizeReason}`);
    // Each Zone's plates and countries, for reference (the handoff: "a Zone lists the countries it touches only for reference").
    const zonePlates = t.zones.map(() => new Map<number, number>()); const zoneCountries = t.zones.map(() => new Map<number, number>());
    for (let c = 0; c < W * H; c++) {
      const z = zoneOf[c]; if (!z) continue; const k = cellKm2(Math.floor(c / W));
      if (plate[c]) zonePlates[z - 1].set(plate[c], (zonePlates[z - 1].get(plate[c]) ?? 0) + k);
      if (countries.grid[c]) zoneCountries[z - 1].set(countries.grid[c], (zoneCountries[z - 1].get(countries.grid[c]) ?? 0) + k);
    }
    const base = globeSectors; globeSectors += sectors.length;
    for (let c = 0; c < W * H; c++) if (sectorOf[c]) globeSector[c] = base + sectorOf[c];
    const local = (g: number) => (g > base && g <= base + sectors.length ? g - base : 0);
    pending.push(() => {
    const { doc, points } = containerDoc({
      container: { id: `terra:${t.slug}`, name: t.name, level: 'terra', plates: t.plates, principle: t.principle ?? '', sources: Object.values(SOURCES) },
      zones: tz.map((z, k) => ({
        id: `zone:${z.slug}`, name: `${z.name} Zone`, system: z.system,
        principle: `One ${z.system}: ${z.provinces.length ? `the USGS provinces ${z.provinces.join(', ')}` : 'its Terra\'s half of the Red Sea'}, within ${t.name}.`,
        plates: [...zonePlates[k].entries()].sort((a, b) => b[1] - a[1]).filter(([, x]) => x > zoneKm2[k] * 0.02).map(([p]) => plateNames[p - 1]),
        countries: [...zoneCountries[k].entries()].sort((a, b) => b[1] - a[1]).filter(([, x]) => x > zoneKm2[k] * 0.005).map(([n]) => countries.codes[n - 1]),
        sources: [SOURCES.usgs, SOURCES.etopo],
      })),
      // A Sector names its sources and their licences; the container carries each in full, with its link.
      arcs: arcsOfGlobe, local, sectorZone: [0, ...sectors.map((p) => p.zone)], facts,
      sectorSources: [SOURCES.etopo, SOURCES.resolve, SOURCES.naturalEarth, SOURCES.pb2002].map(({ name, licence }) => ({ name: name.replace(/ \(.*$/, ''), licence })),
    });
    const text = JSON.stringify(doc); const file = `terra-${t.slug}.zsp.geojson`;
    files[file] = text;
    manifest.containers.push({ id: `terra:${t.slug}`, name: t.name, level: 'terra', file, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) });
    writeFileSync(join(ZONES_DIR, file), text);
    writeFileSync(join(outDir, `${t.slug}-zones-0.1.u32.bin.gz`), gzipSync(Buffer.from(new Uint32Array(zoneOf.buffer.slice(0)).buffer)));
    writeFileSync(join(outDir, `${t.slug}-sectors-0.1.u32.bin.gz`), gzipSync(Buffer.from(new Uint32Array(sectorOf.buffer.slice(0)).buffer)));
    writeFileSync(join(outDir, `${t.slug}-0.1.json`), `${JSON.stringify({
      zsp: '2.0', terra: `terra:${t.slug}`,
      grid: { width: W, height: H, cell: CELL, origin: { lat: 90, lon: -180 }, rows: 'row 0 the northernmost', values: 'at cell centres' },
      files: { zones: `${t.slug}-zones-0.1.u32.bin.gz`, sectors: `${t.slug}-sectors-0.1.u32.bin.gz` }, dtype: 'uint32', endianness: 'little', compression: 'gzip',
      areaKm2: Math.round(km2), zones: tz.map((z, k) => ({ id: `zone:${z.slug}`, name: `${z.name} Zone`, system: z.system, provinces: z.provinces, km2: Math.round(zoneKm2[k]) })),
      sectors: sectors.length, bytes: Buffer.byteLength(text), points,
    }, null, 2)}\n`);
    writeTerraPreview(join(outDir, `${t.slug}-preview.png`), sectorOf, zoneOf, land, tz);
    say(`${t.name}: file ${(text.length / 1e6).toFixed(2)} MB, ${points} ring points`);
    });
  }
  // The Maria on the same grid, after the Terrae: Mecha Jono's labels, or test Maria when asked for.
  const testMaria = process.argv.find((a) => a.startsWith('--test-maria='))?.slice('--test-maria='.length);
  const stage1 = JSON.parse(readFileSync('data/zsp2/containers/containers-0.1.json', 'utf8')) as { codes: Record<string, string> };
  const mareIds = Object.keys(stage1.codes).filter((k) => k !== '0').sort((a, b) => Number(a) - Number(b)).map((k) => stage1.codes[k]);
  const mareNames = mareIds.map((id) => `Mare ${id.split(':')[1].replace(/^./, (x) => x.toUpperCase())}`);
  const maria = readMaria(mariaDir)
    ?? (testMaria ? syntheticMaria({ containers, land, relief, plateOf: plate, ecoregionOf: resolve.grid, mareIds, mareNames, say }) : null);
  const mareBase = globeSectors;
  if (maria) {
    let onLandSide = 0; let unlabelled = 0;
    for (let c = 0; c < W * H; c++) {
      const s = maria.labels[c];
      if (s && !landSide(c)) globeSector[c] = mareBase + s;
      else if (s) onLandSide += 1;
      else if (!landSide(c)) unlabelled += 1;
    }
    say(`the Maria${maria.synthetic ? ' (test)' : ''}: ${maria.sectors.length} Sectors; ${onLandSide} labelled cells on the land side (dropped), ${unlabelled} sea cells in none`);
  }
  // One trace for the globe: every edge at about 8 km (ZR24), each checked against the arcs near it.
  const traced = traceArcs(globeSector, () => COARSE_TOLERANCE);
  arcsOfGlobe = traced.arcs;
  say(`the globe traced once: ${traced.arcs.length} arcs, ${traced.keptFine} kept fine where a coarser one would cross`);
  for (const build of pending) build();
  writeFileSync(join(ZONES_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // The served set holds Mecha Jono's Maria when they are in; test Maria are checked with it but written apart.
  const checked = { ...manifest, containers: [...manifest.containers] }; const checkedFiles = { ...files };
  if (maria) {
    const into = maria.synthetic ? testMaria! : ZONES_DIR; mkdirSync(into, { recursive: true });
    for (const { id, doc } of mariaDocs(maria, arcsOfGlobe, (g) => (g > mareBase ? g - mareBase : 0))) {
      const text = JSON.stringify(doc); const file = `mare-${id.split(':')[1]}.zsp.geojson`;
      const entry = { id, name: (doc.features as Array<{ properties: { name: string } }>)[0].properties.name, level: 'mare', file, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) };
      checked.containers.push(entry); checkedFiles[file] = text;
      if (!maria.synthetic) { manifest.containers.push(entry); files[file] = text; }
      writeFileSync(join(into, file), text);
      say(`${entry.name}${maria.synthetic ? ' (test)' : ''}: file ${(text.length / 1e6).toFixed(2)} MB`);
    }
    if (maria.synthetic) writeFileSync(join(into, 'manifest.json'), `${JSON.stringify(checked, null, 2)}\n`);
    else writeFileSync(join(ZONES_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const report = checkPartition(checked, checkedFiles, (x) => createHash('sha256').update(x).digest('hex'));
  const whole = Boolean(maria);
  const other = whole ? report.problems : report.problems.filter((p) => !p.startsWith('coverage:'));
  say(whole
    ? `checks on the whole set${maria!.synthetic ? ' with test Maria' : ''}: ${other.length} problem(s); ${(report.bytes / 1e6).toFixed(2)} MB in all`
    : `checks: ${other.length} problem(s) besides coverage, which a partial set must fail; ${(report.bytes / 1e6).toFixed(2)} MB in all`);
  for (const p of other.slice(0, 40)) say(`  ${p}`);
}

/**
 * A Zone's part cut off from it, smaller than a Sector may be, joins the neighbouring Zone it borders most, on its
 * Terra's own ground; an island with no neighbouring Zone keeps its own.
 */
function rejoinSlivers(zoneOf: Int32Array, zones: number): void {
  for (let k = 1; k <= zones; k++) {
    const mine = newMask(); for (let c = 0; c < W * H; c++) if (zoneOf[c] === k) mine[c] = 1;
    const bits = components(mine);
    const size = new Map<number, number>(); for (let c = 0; c < W * H; c++) if (bits[c]) size.set(bits[c], (size.get(bits[c]) ?? 0) + cellKm2(Math.floor(c / W)));
    const largest = [...size.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const [bit, km2] of size) {
      if (bit === largest || km2 >= SECTOR_MIN_KM2) continue;
      const border = new Map<number, number>(); const members: number[] = [];
      for (let c = 0; c < W * H; c++) if (bits[c] === bit) {
        members.push(c);
        for (const n of neighbours(c)) if (n >= 0 && zoneOf[n] && zoneOf[n] !== k) border.set(zoneOf[n], (border.get(zoneOf[n]) ?? 0) + 1);
      }
      const to = [...border.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (to) for (const c of members) zoneOf[c] = to;
    }
  }
}

/** A polyline shapefile's records (type 3), for the rivers. */
function forEachShapeLines(base: string, each: (points: Ring, attrs: Record<string, string>) => void): void {
  const shp = readFileSync(`${base}.shp`); const dbf = readFileSync(`${base}.dbf`);
  const hlen = dbf.readUInt16LE(8); const rlen = dbf.readUInt16LE(10);
  const fields: Array<{ name: string; len: number }> = [];
  for (let p = 32; dbf[p] !== 0x0d; p += 32) fields.push({ name: dbf.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len: dbf[p + 16] });
  let off = 100; let i = 0;
  while (off < shp.length) {
    const len = shp.readInt32BE(off + 4) * 2; const type = shp.readInt32LE(off + 8);
    if (type === 3) {
      const b = off + 12; const numParts = shp.readInt32LE(b + 32); const numPoints = shp.readInt32LE(b + 36);
      const parts = Array.from({ length: numParts }, (_, k) => shp.readInt32LE(b + 40 + 4 * k)); const pts = b + 40 + 4 * numParts;
      const attrs: Record<string, string> = {}; let pos = hlen + i * rlen + 1;
      for (const f of fields) { attrs[f.name] = dbf.toString('utf8', pos, pos + f.len).replace(/\0/g, '').trim(); pos += f.len; }
      parts.forEach((start, k) => {
        const end = k + 1 < numParts ? parts[k + 1] : numPoints;
        each(Array.from({ length: end - start }, (_, n) => [shp.readDoubleLE(pts + 16 * (start + n)), shp.readDoubleLE(pts + 16 * (start + n) + 8)] as [number, number]), attrs);
      });
    }
    off += 8 + len; i++;
  }
}

/** Marks the cells a segment crosses, 4-connected, so a flood cannot slip through it. */
function drawSegment(mask: Uint8Array, [x1, y1]: [number, number], [x2, y2]: [number, number]): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (CELL / 4)));
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const c = rowOf(y1 + ((y2 - y1) * s) / steps) * W + colOf(x1 + ((x2 - x1) * s) / steps);
    if (last >= 0 && c !== last) {
      const lj = Math.floor(last / W); const li = last - lj * W; const cj = Math.floor(c / W); const ci = c - cj * W;
      if (lj !== cj && li !== ci) mask[lj * W + ci] = 1;
    }
    mask[c] = 1; last = c;
  }
}

/** A Terra over its own box: each Zone its colour, Sectors shaded, Zone edges dark. */
function writeTerraPreview(path: string, sectorOf: Int32Array, zoneOf: Int32Array, land: Uint8Array, zones: ZoneDef[]): void {
  let j0 = H; let j1 = 0; let i0 = W; let i1 = 0;
  for (let c = 0; c < W * H; c++) if (zoneOf[c]) { const j = Math.floor(c / W); const i = c - j * W; j0 = Math.min(j0, j); j1 = Math.max(j1, j); i0 = Math.min(i0, i); i1 = Math.max(i1, i); }
  j0 = Math.max(0, j0 - 20); j1 = Math.min(H - 1, j1 + 20); i0 = Math.max(0, i0 - 20); i1 = Math.min(W - 1, i1 + 20);
  const w = i1 - i0; const h = j1 - j0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = (j0 + y) * W + i0 + x; const s = sectorOf[c]; const z = zoneOf[c];
      let rgb: number[] = land[c] ? [150, 150, 150] : [225, 232, 240];
      if (s) {
        const shade = 0.78 + ((s * 37) % 23) / 50;
        rgb = zones[z - 1].rgb.map((v) => Math.min(255, Math.round(v * shade)));
        if (zoneOf[c + 1] !== z || zoneOf[c + W] !== z) rgb = [20, 20, 20];
        else if (sectorOf[c + 1] !== s || sectorOf[c + W] !== s) rgb = rgb.map((v) => Math.round(v * 0.5));
      }
      raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  writePng(path, w, h, raw);
}

main();
