# Starcom interface sounds

These are the app's interface sounds, from the Starcom sound arsenal. `src/services/audio/sfxLibrary.ts` plays them. When a message or alert file can't play, the old synthesised tone plays instead.

**Off by default.** Nothing plays until the visitor turns sound on, with the header's speaker button or in Settings > Sound (decision N12). Settings also hold the volume and four switches: interface, pointer-over, Globe, and alerts and messages.

**Where they come from.** Mecha Jono's `tools/starcom_sfx.py` (ul_agent) synthesises them from recipes and seeds. The references were functions, not sounds:
- an RTS command interface;
- a tick when the pointer passes over a control;
- a blip on a click;
- a sonar ping on a place pointed out.

Nothing here is sampled from any game or recording. No third-party material is used, and no licence comes with the files.

**What's recorded.** `manifest.json` gives each file's recipe, parameters, seed and SHA-256. The same recipe and seed make the same file again. Each entry also lists the moments that play it, and its loudest 50 ms in LUFS (K-weighted, ITU-R BS.1770 stages 1 and 2). The app sets each moment's gain from that measure, not from the peak: Deny and Select peak alike and measure 13 dB apart.

| Moment | When | File | Loudest 50 ms |
|---|---|---|---|
| hover | the mouse passes onto a control | hover-tick.wav | −21.5 |
| click | a control is used | select.wav | −19.5 |
| switch | another application is opened | select-relay.wav | −17.5 |
| toggleOn | a switch is turned on | toggle-on.wav | −12.0 |
| toggleOff | a switch is turned off | toggle-off.wav | −10.3 |
| open | a dialog, menu or panel opens | panel-open.wav | −12.6 |
| close | one closes | back.wav | −14.3 |
| confirm | a form is submitted | select-confirm.wav | −18.2 |
| deny | a disabled control is pressed | deny.wav | −6.2 |
| spot | the Globe is pointed at a place | target-ping-double.wav | −15.3 |
| designate | a country is picked | designate.wav | −19.3 |
| success | a notice that work is done | confirm-fifth.wav | −13.8 |
| message | a message arrives | data-fsk.wav (Data keyed burst) | −6.6 |
| warning | a warning notice | blend-alert-ground.wav (Alert beeps + Data keyed burst) | −7.3 |
| error | an error notice | alert-low-triple.wav | −2.3 |
| alert | an alert that needs action | alert-beeps.wav | −5.5 |

The files are 48 kHz, 16-bit stereo WAV: the shortest sounds are 20 ms, so no codec's padding is put in front of them.

**Changing a sound means a new file name.** The service worker (`public/sw.js`) serves everything under `/assets/` cache-first, so a visitor keeps a file it has already fetched. New bytes under an old name would never reach them.
