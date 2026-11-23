# Weather on the globe: heat, clouds, wind and rain (decision D-W)

Decided by the owner on 2026-10-05, after block D. Earth Weather was 144 dots on
a 20° grid, which the owner said "visually doesn't convey anything", least of
all in the animated cards Mecha Jono posts. This record holds what was
measured, what was decided, the protocol each data source is used under, and
the build order. Space weather follows in its own section once decided.

## What was there (measured 2026-10-05)

- **Earth Weather:** Open-Meteo, one batched request per visitor every 10
  minutes, 144 points on a 20° grid up to 70° (`EarthWeatherService.ts`); a
  15° grid took 31 s to answer. Each point drawn as a 9 px dot coloured by
  temperature (`useGlobeEarthWeather.ts`); wind as cones, off by default; rain
  as particles. The layer audit: "every mark reads as one orange".
- **Clouds:** a static 2048 × 1024 picture from three-globe's example
  (`clouds.png`), drifting; nothing reads real cloud data.
- **No golden card or shot** covers Earth Weather.

## Decisions (WX1–WX12)

| # | Question | Decision |
|---|---|---|
| WX1 | The heat map: what data, and how dense | **NOAA GFS on a 1° grid, as data only.** No geometry and no drawn dots: the grid's values feed a shader that blends temperature smoothly across the globe. Hovering reads the value. The data is kept an hour in the browser, and forecast hours are kept so a clip can show the day move. Loaded in the browser only, never through a Vercel service. The owner asked that it be tested, the incoming data examined, and each service's protocol researched so it is not overused (below). |
| WX2 | What the cloud layer shows | **Four satellites' infrared, shaded in 3D:** Meteosat (EUMETSAT) and GOES-East, GOES-West and Himawari (NASA GIBS), 70°N to 70°S. Brightness becomes cloud opacity and height, so a shader lights the tops and gives them relief. The old picture fills the poles. **Revised 2026-10-06 by the owner:** the source is EUMETSAT's Geostationary Ring, one global infrared mosaic of all those satellites every 3 hours, in place of GIBS and Meteosat fetched apart; and the poles take GFS cloud cover (WX7). |
| WX3 | How wind moves | **GPU particle flow** through GFS 10 m wind, trails coloured by speed, stepping down on weak devices and in SwiftShader captures. |
| WX4 | Which rain map | **Model rain everywhere, observed radar on top where radar exists:** GFS rain rate in weather-report colours, and RainViewer radar over it; each says which it is. |
| WX5 | Where GFS is read from (decided late on 5 October, after PacIOOS went down) | **NOAA's own copy on AWS first, PacIOOS as the fallback.** The browser reads only the fields it needs, by byte range, from NOAA Open Data Dissemination's GRIB2 files; PacIOOS's netCDF is read only when AWS fails. |
| WX6 | Where observed radar may appear | **On screen and in cards, credited.** Confirmed after the terms review (data-licensing.md, L1–L2): the posts earn nothing, and Starcom is read as small-scale community use. A letter asks RainViewer to confirm. |
| WX7 | What fills the poles, beyond the satellites | **GFS total cloud cover,** drawn softer and labelled "model", so it is never taken for satellite cloud. |
| WX8 | How rain shares the ground with temperature (decided 2026-10-06) | **One ground colour at a time.** Earth Weather's colour mode gains "rain" beside temperature and air quality, as Windy shows one field at a time. Rain gets a weather report's scale (greens to reds to magenta, no cyan); wind and clouds draw over either. |
| WX9 | Whether agents may set Earth Weather's parts (decided 2026-10-06) | **Yes:** the share handle gains `setWeather`, holding for the agent's page only and never saved, as `setReportLook` does. A new contract version. |
| WX10 | How the weather moves between the model's 3-hour steps (decided 2026-10-06) | **Blend smoothly.** The two nearest steps blend on the GPU, and the wind's streaks follow the blended wind, so a clip flows. The hover and the card say which two hours a moment falls between. |
| WX11 | What clouds are drawn at an hour the satellites have not seen, such as any forecast hour (decided 2026-10-06) | **The model's cloud cover everywhere,** shaded like the satellites' clouds and labelled the model's forecast, as the poles already are (WX7). The card says so. |
| WX12 | How a person reaches forecast hours (decided 2026-10-06) | **A forecast strip in Earth Weather's key:** now, +6 h, +12 h, +1 d, +3 d, +7 d. It moves the one shared time cursor (decision D-E), so every layer agrees on the moment. Agents reach any hour through the share handle. |

## The sources, measured and tested

| Source | What | Access | Measured |
|---|---|---|---|
| NOAA GFS via NOAA Open Data Dissemination on AWS (`noaa-gfs-bdp-pds.s3.amazonaws.com`, the 1° `pgrb2.1p00` files) | The same model, 1° on a 360 × 181 grid (90°N to 90°S), each 3-hourly step a GRIB2 file with a text index (`.idx`) giving each field's byte range. Also `TCDC` (total cloud cover) and `RH` | Keyless, CORS `*` on listings, indexes and ranges (206) | Four fields of a step: 47–80 KB each, 74–302 ms each; the whole step, with the day's listing and the index, in about 1 s in Chromium. All packed as GRIB2 template 5.3 (complex packing, second-order spatial differencing). A changed-nothing reload answers 304 to `If-None-Match`. |
| NOAA GFS via PacIOOS ERDDAP (`pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global`; NOAA CoastWatch redirects there) | 0.5° global, 3-hourly, 8-day forecast: `tmp2m` (K), `ugrd10m`/`vgrd10m` (m s⁻¹), `pratesfc` (kg m⁻² s⁻¹, × 3600 = mm h⁻¹), `rh2m`, `prmslmsl` | Keyless, CORS `*` | One step's four variables at 1° (stride 2) as netCDF-3: 432 KB gzipped, 1.0 MB decoded, 2.1–2.6 s warm; temperature alone 87 KB in 0.8 s. Cold reads are slow and uneven: 1.1 s, 6 s, 24 s and 228 s for four variables fetched one after another. |
| NASA GIBS (`gibs.earthdata.nasa.gov`) | Band-13 infrared: `GOES-East_ABI_Band13_Clean_Infrared`, `GOES-West_…`, `Himawari_AHI_Band13_Clean_Infrared` (every 10 min, colour-enhanced); `IMERG_Precipitation_Rate` is daily, latest yesterday | Keyless, CORS `*` | A whole-globe 2048 × 1024 image in 1–2 s. No Meteosat. |
| EUMETSAT EUMETView (`view.eumetsat.int/geoserver/wms`) | `msg_fes:ir108` (Meteosat 0°) and `msg_iodc:ir108` (Indian Ocean), greyscale; also `clm` (cloud mask) and `cth` (cloud-top height) | Keyless, CORS `*` | A whole-globe image in about a second. |
| EUMETSAT Geostationary Ring (`view.eumetsat.int/geoserver/wms`, layer `mumi:worldcloudmap_ir108`; found 2026-10-06) | One infrared (10.8 µm) mosaic of every geostationary weather satellite, 80°N to 80°S, every 3 hours, greys linear in temperature | Keyless, CORS `*`, cacheable a week | A 2048 × 1024 image: 1.85 MB in about 10 s. The newest slot comes about 2 hours late, and EUMETView sometimes answers a slot it published with a 502 for a while (00:00Z on 6 October did for over an hour). Clear sky lies on grey ≈ 102 − 1.39 × T(°C), measured against GFS 2 m temperature over 62,000 cells. |
| RainViewer (`api.rainviewer.com/public/weather-maps.json`) | Radar, the past 2 hours at 10 minutes; no nowcast, no satellite any more | Keyless, CORS `*` | 13 frames; a 256 px tile 7–9 KB. One colour scheme only (Universal Blue: every scheme number returns the same bytes), and every pixel is a colour of its published table, so it reads back to dBZ exactly, apart from 1 to 5 pinks a tile that the table does not hold (mixed precipitation, it seems). Its coverage tiles paint black where no radar reaches. |

**The browser test** (2026-10-05): a page served from localhost fetched the
1° netCDF of all four variables from PacIOOS in 2.6 s, decoded it with a
small netCDF-3 reader in 5 ms, and every value matched the text-format check:
64,800 per variable, 180 latitudes from 89.5 to −89.5, 360 longitudes from 0
to 359, no fill values, no NaNs, all in range. Starcom's CSP allows every
host above (`connect-src` and `img-src` are open to https).

**PacIOOS went down** minutes after that test. From 23:33Z its ERDDAP refused
connections on ports 80 and 443, from this network and from another one,
while the PacIOOS website answered. That is what moved the source to AWS
(WX5): one small academic server cannot be the only way a layer gets its data.

**The GRIB2 test** (2026-10-05, 18Z run, 3-hour step): a decoder written for
templates 5.0 and 5.3 read temperature, both wind components and both rain
rates (instantaneous and the 0–3 h mean). Each matched ECMWF's ecCodes 2.49,
the reference decoder, on all 65,160 values to float32 precision. It decodes a
field in 2–23 ms. Every value on each pole row of temperature is equal, as
it must be; the wind's pole rows differ, as they must, since u and v are
measured against each longitude's own east and north. The same decoder in
headless Chromium fetched and read the step with no preflight and no console
errors.

**The data examined:** fetched at 23:24Z, the latest step at or before then
was 21:00Z. Its temperatures agreed with Open-Meteo's current readings within
a degree at Oslo, Singapore and Denver. Manaus read 36.1 °C at 17:00 local
against Open-Meteo's 28.4 °C at 19:24, two and a half hours later. McMurdo's
1° cell read −11.7 °C against −21.2 °C. A card must name the model hour it
shows, and a cell is not a station.

## Protocol: how each source is used, so it is not overused

**NOAA GFS on AWS (the source).** NOAA's terms: "NOAA data disseminated
through NODD are open to the public and can be used as desired." Attribution
is asked for, endorsement may not be claimed, and modified data may not be
called the original. The heat map is drawn from the data, not the data
itself, so it says "derived from". Amazon carries the load, not NOAA, but
the client is still frugal:

1. One request at a time from a page, through the same queue as the fallback.
2. The newest run is found from the day's listing, read at most once an hour.
   GFS runs every 6 hours and its 1° files land about 3½ hours after the run.
3. A step costs its index (about 31 KB) and one byte range per field on show;
   nothing else is fetched.
4. A run's files never change once written, so a field is cached by run, step
   and name and never fetched twice. What is shown moves to a newer run when
   one appears, checked at most hourly (WX1).
5. A `503 Slow Down` or a failure backs off with jitter, from 30 s doubling
   to 15 minutes. After three failures the fallback is tried.
6. Credit: "NOAA GFS, via NOAA Open Data Dissemination", in the key and in each
   card's provenance, with the run and step it shows.

**NOAA GFS on PacIOOS ERDDAP (the fallback).** Read only when AWS has failed
three times. The licence lets the data be used and redistributed free of
charge; it is not for legal use. ERDDAP's defaults allow an IP address 7
requests in progress, 2 of them active; more are answered "429 Too Many
Requests". A school or office shares one address. So:

1. One request at a time from a page, never two, through one queue.
2. One request per model step, holding only the variables of the layers that
   are on, as netCDF-3, gzipped.
3. Fetched only while Earth Weather is shown.
4. Cached in the browser by model step. A step more than 12 hours past is
   final and never fetched again; the current and next steps are fetched again
   at most once an hour (WX1). ERDDAP answers a conditional request in full,
   so the browser decides when.
5. A 429 or 503 backs off with jitter, from 30 s doubling to 15 minutes, and
   honours `Retry-After`. Never a tight loop. After three failures the layer
   says so and stops.
6. A cold read can take minutes: a real loader says so, and the last cached
   step is shown meanwhile, labelled with its hour.
7. A clip's forecast hours come in one request for one variable, at most 8
   steps (24 hours).
8. Credit: "NOAA NCEP GFS, via PacIOOS ERDDAP", in the key and in each card's
   provenance.

**NASA GIBS.** NASA asks clients to acknowledge it: "We acknowledge the use of
imagery provided by services from NASA's Global Imagery Browse Services
(GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."
GIBS pre-generates its tiles, so tiled (WMTS) requests are the scalable way in.

1. WMTS tiles, not whole-globe WMS images, and only the tiles inside each
   satellite's disk.
2. Fetched again at most every 20 minutes, aligned to the layer's own times.
3. The acknowledgement in the key and each card's provenance.

**EUMETSAT's Geostationary Ring (the cloud source).** One request per 3-hour
slot, for a slot at least two hours old; a slot that fails is stepped back
from at once, at most four (twelve hours), and after four failures nothing is
asked for 15 minutes. A slot is fetched once and kept by the weather cache.
A new slot is looked for every half hour. Credit: "Contains modified
EUMETSAT data", with CC BY 4.0, on the card and in the key.

**EUMETSAT.** Meteosat data is "Core", free and unrestricted under CC BY 4.0,
for every hourly image and every derived product (the cloud mask and
cloud-top height among them). An image between the hours, used within an hour
of its time, is "Recommended" data, which carries fees for service providers
and broadcasters and may not be broadcast even for personal use.

1. Only images on the hour, or more than an hour old.
2. At most one fetch per hour per product.
3. Credit: "Contains modified EUMETSAT Meteosat data 2026", in the key and
   each card's provenance.

**RainViewer.** Free for personal and educational use only, with a link to
rainviewer.com; at most zoom 7 and 100 requests per IP per minute, since
1 January 2026.

1. The map list at most every 10 minutes, and its newest past frame.
2. Zoom 2: sixteen tiles a frame, about a third of a degree at the equator.
3. The coverage tiles, which change rarely, kept a day.
4. Never more than 60 requests in any minute (RainViewer allows 100), one at a
   time; after a failure, nothing for ten minutes.
5. The credit "Weather data by RainViewer", linked, in the key; "RainViewer"
   on each card's Data line (L2).

## Build order

1. **The heat map** (WX1): the GFS client (queue, cache, back-off), the GRIB2
   reader for AWS and the netCDF-3 reader for the fallback, a temperature
   texture blended on the globe by a shader, the value on hover, the key, and
   the card's provenance. The 144 dots go. A golden shot of it.
2. **Wind** (WX3), from the same client: GPU particles and trails.
3. **Clouds** (WX2, WX7): the four satellites into one texture, GFS cloud
   cover at the poles, the shading.
4. **Rain** (WX4): GFS rain rate, then radar on top.
5. **Forecast hours in clips**: the shared time cursor moves the weather.
   A card states the hour of each field it shows. Its key states the wind's
   and the clouds' (in their swatch labels) but not the temperature's or the
   rain's: their rows print only the scale, and the hour is in the legend's
   `colorMeans`, which the card does not draw. The heat map's note says "at
   the hour stated" (found 2026-10-06). In four parts, each shipped alone:
   - **5a. The moment.** Earth Weather follows the shared cursor: now while
     live, else the cursor's moment. GFS loads the two steps around it from
     one run, and the heat map, the model's rain and the wind blend them on
     the GPU (WX10). Clouds are the satellites' image for the slot nearest
     the moment when they have seen it, else the model's cover everywhere
     (WX11). Radar draws only near its newest frame; elsewhere the model's
     rain stands, and the card says so. The hover, the key and the card
     state each field's hours.
   - **5b. The forecast strip** in Earth Weather's key (WX12).
   - **5c. Clips that move through time:** the clip sweeps the shared cursor
     across its frames, every step loaded before the first frame. A new
     contract version.
   - **5d. The golden shot** of Earth Weather: the harness serves NOAA,
     EUMETSAT and RainViewer from kept files, and the shot draws the fields
     for its own moment.

Between steps 4 and 5, WX9: the share handle's `setWeather`, contract v31.

### Step notes

**1. The heat map.** What landed:

- **Data:** the GFS client, the GRIB2 reader and the netCDF fallback reader
  (src/services/weather/gfs).
- **The shell:** a shader on its own band, `WEATHER_FIELDS`, just off the
  ground and under the country fills.
- **What it tells a reader:** the hover reading, the key, the card's source
  with its credit and note, and `whenReady` waiting for the field.
- **Data colours:** the ramp is the first data scale in tokens.ts.
- **The dots:** while temperature is shown, the station dots are hidden, not
  removed.

How it was checked:

- **The data.** Every expected value in the tests came from ecCodes (GRIB2) or
  SciPy (netCDF) reading real responses, never from Starcom's code.
- **Mutations.** 36 mutations: six first survived, each was given a test, and
  all 36 now fail a test.
- **The rendered globe.** The first render looked wrong. THREE.Color had turned
  the ramp's hex into linear light, so every colour was drawn darker and
  redder, and the unit test, built the same way, agreed. The fix writes sRGB
  bytes, and the test reads the hex itself. Afterwards, every heat-map pixel
  checked was the ramp's colour for ecCodes' value at its own place, within 6
  of 255 on average; the only misses lay on the isotherm lines, which are
  meant to darken.
- **The hover.** It read 33.0 °C over Chad where ecCodes gives 33.2, with the
  same order of agreement in Guatemala and the Southern Ocean.
- **The traffic.** A whole load cost four requests to NOAA: two listings, one
  index, one 47 KB range.

**2. Wind.** What landed:

- **The flow:** GFS 10 m wind moves 16,384 particles on the GPU (fewer at
  lower quality steps), each drawn as a comet streak whose length and
  brightness follow its speed. The streaks sit on their own band,
  `WIND_FLOW`, over the fills and under the clouds.
- **The cones:** the Open-Meteo wind cones hide while the flow draws, and
  wind is now on by default, so a fresh browser, such as an agent's, shows
  it.
- **What it tells a reader:**
  - The hover joins temperature and wind in one line, with the shared source
    named once.
  - The key says what the streaks mean.
  - The card names the model and hour, and that the streaks' pace is sped up.
  - `whenReady` waits for the field.
  - A still settles the particles from its own moment.

How it was checked:

- **On the rendered globe:** the particle state was read back from the GPU
  twice, and each particle's movement compared with the wind ecCodes reads at
  its place, from the same bytes the page fetched. 12,533 particles; median
  angle error 0.19°, every one within 20°.
- **Mutations:** 11, all fail a test.
- **A bug the key exposed:** it wrote a forecast hour still to come as "-23m
  ago". It now says "23m ahead".

**3. Clouds.** What landed:

- **The sky as seen:** EUMETSAT's Geostationary Ring is drawn as cloud,
  in place of three-globe's example picture. Cloud is told from clear sky
  against GFS's ground temperature. The colder a top, the higher it is drawn,
  in relief lit by the planet's own sun; by night, a cool moonlit tone.
- **The poles:** they take GFS cloud cover, softer and keyed as the model's.
- **The example picture:** it still shows when Earth Weather is off.
- **What it tells a reader:** the hover reads the tops' temperature beside
  temperature and wind. The key's entries are now "Temperature", "Wind" and
  "Clouds", not "Earth Weather" three times. The card credits EUMETSAT and
  says where the satellites' clouds end.

How it was checked:

- **On the rendered globe:** the cloud shell alone, sampled every 3°, against
  the same image and GFS bytes the page fetched. Over the Pacific, 95.6% of
  points agree (opaque where the calibration says opaque, clear where clear);
  over the Atlantic, 85.8%. Both peak at zero shift: moved 1.5° any way,
  agreement falls to 84% at best. So the clouds land where the satellites saw
  them, and the misses are cloud edges.

**4. Rain.** What landed:

- **The field:** Earth Weather's colour can be rain (WX8). GFS's mean rain
  everywhere and RainViewer's radar where radar reaches make one field, in
  tokens.ts's rain scale. Where radar reaches it decides, rain or none; a
  pixel in a colour its table does not hold is left to the model, never
  guessed at.
- **The radar:** tiles are decoded byte for byte by a small PNG reader. A
  canvas would round half-transparent colours, and a pixel is read by its
  exact colour. The colours read back to dBZ, and dBZ to mm/h by
  Marshall–Palmer (Z = 2000R² for snow, as water).
- **Without radar:** the model's rain draws alone, and the card says the radar
  did not load.
- **What it tells a reader:** the hover says rain or snow, the rate, and radar
  or model. The card names both sources; its record gives each its own time.

How it was checked:

- **The PNG reader:** every byte equal to pngjs's on three real tiles.
- **The radar reading:** all but 1 to 5 pixels of each real tile read.
- **The coverage tiles:** checked against known places, clear over
  Philadelphia, black over the open Atlantic.
- **On the rendered globe:** the rain shell alone, sampled every 2°, against a
  rate worked out in the check itself from the same tiles (pngjs, the
  published table) and GFS bytes. Where the model decides, 91% of wet samples
  and all dry ones agree. Where radar decides, 51% and 84%: radar's speckle
  against the field's third-of-a-degree grid. Agreement peaks at zero shift
  (0.84), so the field lies where the rain is.

Still to come then: the golden shot. The harness answered every feed from
kept notes, and the heat map took the field nearest the wall clock. It had to
take the field for the shot's own moment first, which is step 5's shared time
cursor; the golden came with that, in 5d.

**WX9. The look for an agent's page.** What landed:

- **One look:** Earth Weather draws from one look: the ground's colour
  (temperature, rain, air quality at the stations, or none), the wind and the
  clouds. It is the person's settings, or what the share handle set for its
  page (`setWeather`, contract v31), part by part; never saved.
- **Off means none:** within Earth Weather the old wind cones and the
  decorative cloud picture (clouds.png) never draw. Before, a person who
  turned the clouds off saw that picture in their place.
- **Reading it back:** `getWeather()` says the look in force and, for each
  part, whether the handle or the person's setting set it.

**5a. The moment: heat map, wind and rain.** What landed:

- **One moment:** Earth Weather is drawn for the shared time cursor's moment
  while it is paused, and for now while it is live, kept moving with the
  clock each minute, as the sun's light already was.
- **Two steps, blended (WX10):** the GFS client reads the model's step at or
  before the moment and the step after it, from one run (`loadAround`). The
  heat map, the model's rain and the wind blend them on the GPU by how far
  between them the moment lies. A moment moving between the same steps moves
  a weight and asks NOAA for nothing. On PacIOOS, the fallback, the nearest
  hour is drawn alone.
- **Radar** is drawn only within half an hour of its newest frame, and not
  asked for at all beyond RainViewer's two hours. At any other moment the
  rain is the model's, and the card says so and credits no radar.
- **Saying the moment:** the key and the card print each weather row's moment
  after its name, "forecast for 7 Oct 01:30Z" when it is still to come
  (capture schema 20). The hover names the two hours blended. Every weather
  time now goes through the shared formatter (decision D-E): "6 Oct 22:12Z".
- **Fixed on the way:** runs were listed from the moment's own day, so a
  forecast hour days ahead found no run.

How it was checked:

- **The client:** 12 mutations, the tests serving one run's real 3- and
  6-hour steps.
- **On the rendered globe**, at a forecast moment a third of the way between
  two steps:
  - the heat map's and the wind's weights were a third;
  - the heat map's pixels matched the two steps' temperatures blended by a
    third (decoded from the same byte ranges by the scratchpad decoder)
    better than either step alone;
  - 12,453 wind particles moved with the blended wind, median 0.17° off;
  - moving the moment half an hour asked NOAA for nothing;
  - the rain was the model's alone, and RainViewer was never asked.
- **Found by that check:** when the cursor moved between the wind's two
  loads, its components came for two moments and the wind was not drawn.
  Each load now fixes its moment once.

**5a. The moment: clouds (WX11).** What landed:

- **A moment the satellites have seen** is drawn from the ring's slot
  nearest it. The two hours a slot takes to publish are counted from now,
  not from the moment, so a moment a day ago gets its own slot; before, it
  got one two to five hours earlier. The cloud is lit by the sun of the
  moment, and the poles' model cover is blended for the moment.
- **A moment still to come** is drawn as the model's total cloud cover
  everywhere, blended between its steps, shaded in relief as seen cloud is,
  and keyed and credited as the model's forecast: no satellite is asked for
  it and none is credited.
- **How thick the model's cloud is drawn** was measured, not chosen. On
  6 October at 09Z and 15Z the satellites showed as cloud 25.6% and 25.8% of
  the planet between 60° N and S. The model's cover passed the old midpoint
  over twice that (57%). Its share above 98–99% matched theirs, and there
  the two agreed on 78% of the area. So near-total cover is drawn as cloud
  and partial cover as a thin veil, at the poles too. The cover is averaged
  over each cell's neighbours first, so a 1° grid draws round edges, not
  its cells; nothing is added that the model does not have.

How it was checked, on the rendered globe:

- at a forecast moment a third of the way between two steps, the shell drew
  the model everywhere with a weight of a third, EUMETSAT was not asked,
  and the card credited NOAA alone and carried the model's note;
- at 5 Oct 13:40Z the ring was asked for 15:00Z, the nearest slot, and the
  key said "seen 5 Oct 15:00Z";
- live, the newest published slot;
- 9 mutations, all killed.

Step 5a is complete: every part of Earth Weather follows the moment.

**5b. The forecast strip (WX12).** What landed:

- **In the key, after Earth Weather's last row:** Now, +6 h, +12 h, +1 d,
  +3 d and +7 d. Now returns the shared cursor to live; every other step
  pauses it that many hours from now (decision D-E), so every layer agrees on
  the moment. On hover, each says the UTC moment it chooses.
- **Which step reads as chosen:** Now only while live, not for a cursor
  paused at this moment; any other step while the cursor stays within 45
  minutes of its hour. A moment the strip did not set chooses none.
- **The border in longhands only.** With the shorthand and a chosen colour in
  a longhand, a step losing its choice kept the stylesheet's default border,
  nearly white, so "Now" still looked chosen. Found in the running app, and
  given a test that failed first.

How it was checked, on the rendered globe with NOAA reachable: the key began
"Temperature, for 7 Oct 01:10Z" with Now chosen; +6 h read "forecast for
7 Oct 07:10Z" and +7 d "forecast for 14 Oct 01:11Z", each field loaded
(whenReady); Now returned to live. 9 mutations, all killed.

**5c. Clips that move through time.** What landed, as share-handle contract
v32 and clip schema 5:

- **`recordClip({ sweep: { from, until } })`** moves the shared moment from
  `from` to `until` over the footage, at most 24 hours (data rule 7), so the
  weather's hours flow while the camera moves. Not with `replay`: one time
  track per clip.
- **Every step before the first frame.** The sweep visits the span every
  three hours, the model's step, waiting until each is drawn, so no frame
  waits on a download.
- **Each frame at its own moment.** Each weather layer notes the moment it
  last drew (`weatherDrawn`), and a frame is captured only once every layer
  drawing has drawn that frame's moment: the cursor reaches a layer through
  React, a render later, and a frame taken sooner showed the moment before.
- **What the clip says.** A `moment` track and the span (`sweep`). A source
  drawn for part of the footage only, as radar near its newest frame or the
  satellites' clouds for hours they have seen, is listed with when it was
  drawn and when it was not (`absent`). Each source is judged against the
  moment a frame shows, so a day-old hour is that hour, not stale data. The
  end card says the span, and that hours after the clip was recorded are a
  weather model's forecast.
- **The moment is left as it was found:** live, a dragged range, or a paused
  moment, however the clip ends.

**5d. The golden shots.** What landed:

- **Two shots** in the golden cards (imaging/golden/shots.json):
  `weather-temperature-wide`, the default look over the Atlantic
  (temperature and wind blended between the 18Z run's 03Z and 06Z steps,
  EUMETSAT's clouds with the model's near the poles), and
  `weather-rain-square`, rain over western Europe with wind and clouds off,
  so the rain alone is compared. Both at 7 Oct 03:10Z, the newest radar frame
  when kept. A shot's `look` is set with `setWeather` and cleared after it.
- **Kept feeds:** every answer the two shots asked for, 54 of them, 3.04 MB,
  in imaging/golden/feeds (kept.json lists each URL, byte range, status and
  file): NOAA's listings and indexes (one a 404, the 00Z run not yet out),
  the field ranges, EUMETSAT's ring image (1.84 MB of it), RainViewer's
  frame list and 32 tiles, and the Open-Meteo grid and NASA's sea-ice events,
  which Earth Weather reads whatever the look. Without those two, both cards
  said Open-Meteo had not loaded, which a person never sees.
- **Served as kept:** card-harness.mjs answers the weather page from them and
  starts its clock when they were kept, since the cloud slot and radar are
  judged against it. An answer asked for and not kept stops the run with
  exit 2: with EUMETSAT's removed, the page's four asks (every slot it steps
  back through) were each reported.
- **Kept from a clean build** (62c2c5e9). All twelve shots then matched their
  kept copies, the weather ones at a share of 0.
- **Found on the way, fixed in 62c2c5e9:** `whenReady` at a paused moment
  could say ready on the hour before, because the moment reaches a weather
  layer an effect later. It now waits until each layer has drawn the moment,
  as a sweep's frames did. A paused card judges each source against the
  moment it shows ("3h 10m older than the moment shown"), where it measured
  from the capture, so a card of yesterday's weather called it a day stale.
  And within Earth Weather the quality caveat no longer says "without
  clouds" over the satellites' clouds.
- **Kept again,** with `golden-cards.mjs --keep-feeds --update`, at a new
  moment: radar is kept two hours only, so the shots' `time.at` moves to the
  newest radar frame first, committed, and built clean.

## Open

- ~~**The key's sources and a paused moment.**~~ Done 2026-10-12, the owner's
  choice: while the timeline is paused, the key says both, "as of 16:52Z · 8m
  ago · 2h 52m after the moment shown" (`GlobeLegend.tsx`, `sourcePhrase`).

- **A card's link and the weather look.** A card's link (deeplink v2) carries
  the globe's look, so it opens lit as drawn, but not Earth Weather's: a rain
  card's link opens Earth Weather as the viewer's own settings draw it. The
  report look is not carried either. The grammar is shared with Mecha Jono's
  links, so a change is theirs to agree to as well.
- **Radar** is settled (WX6); the terms review and its decisions are in
  data-licensing.md. RainViewer is asked to confirm in writing.
- PacIOOS is now only the fallback. Tell its contact (listed on its legal
  page) that Starcom may read `ncep_global` from visitors' browsers when AWS
  fails?
