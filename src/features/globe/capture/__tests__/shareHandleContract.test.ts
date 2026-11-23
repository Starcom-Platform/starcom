/**
 * The contract cannot change quietly.
 *
 * ─── WHAT EACH MECHANISM COVERS ────────────────────────────────────────────
 *
 * Three checks guard this interface and they cover different mistakes, which
 * is why none of them is redundant:
 *
 *   the build      a compile-time assertion in useGlobeShareCard proves the
 *                  ShareHandle interface and the declared contract describe
 *                  the same set of names, in both directions.
 *   this file      proves the DECLARATION itself has not been edited without
 *                  the version being reconsidered.
 *   the smoke      proves the DEPLOYMENT serves a handle matching the
 *                  contract it publishes — the only one that can catch a
 *                  bundling or wiring failure.
 *
 * A version nobody is obliged to change is decoration. The fingerprint below
 * is the obligation.
 */
import { describe, it, expect } from 'vitest';
import {
  SHARE_HANDLE_CONTRACT,
  SHARE_HANDLE_FINGERPRINT,
  SHARE_HANDLE_NAME,
  SHARE_HANDLE_VERSION,
  expectedHandleKeys,
  stableContractString,
} from '../shareHandleContract';

describe('the share handle contract', () => {
  it('matches its recorded fingerprint', () => {
    const actual = stableContractString(SHARE_HANDLE_CONTRACT);
    if (actual !== SHARE_HANDLE_FINGERPRINT) {
      throw new Error(
        'The share handle contract has changed.\n\n'
        + `  declared:  ${actual}\n`
        + `  recorded:  ${SHARE_HANDLE_FINGERPRINT}\n\n`
        + 'This is not a failure to fix by updating the fingerprint alone. Mecha Jono '
        + 'reads this contract from a deployed URL and cannot be recompiled when it '
        + 'moves. Decide whether the change is additive or breaking, bump '
        + 'SHARE_HANDLE_VERSION, THEN update SHARE_HANDLE_FINGERPRINT to match.',
      );
    }
    expect(actual).toBe(SHARE_HANDLE_FINGERPRINT);
  });

  it('carries the version inside the fingerprint, so a bump cannot be silent', () => {
    // If version were outside the fingerprinted object, bumping it would leave
    // the fingerprint valid and the obligation above would be unenforceable.
    expect(SHARE_HANDLE_FINGERPRINT).toContain(`"version":${SHARE_HANDLE_VERSION}`);
  });

  it('is insensitive to key order, because reordering a literal is not a change', () => {
    /*
     * Derived by reversing the real contract rather than retyping its keys.
     * The first version listed them by hand and broke the moment a key was
     * added — a test that fails for its own staleness teaches people to edit
     * tests to make them pass, which is the opposite of what this file is for.
     */
    const reordered = Object.fromEntries(Object.entries(SHARE_HANDLE_CONTRACT).reverse());
    expect(stableContractString(reordered)).toBe(stableContractString(SHARE_HANDLE_CONTRACT));
    // And the reversal really did change the key order, or this proves nothing.
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(SHARE_HANDLE_CONTRACT));
  });

  it('IS sensitive to an actual change, so the test above is not vacuous', () => {
    const changed = { ...SHARE_HANDLE_CONTRACT, properties: ['version', 'somethingNew'] };
    expect(stableContractString(changed)).not.toBe(SHARE_HANDLE_FINGERPRINT);
  });

  it('names every key the live handle may expose, and no others', () => {
    // v4 added the five controls that decide WHAT is drawn. Listed in full
    // rather than derived from the contract: this is the assertion that would
    // catch a method appearing on the handle without anyone declaring it, and
    // deriving it from the same source it checks would make it agree with
    // itself by construction.
    expect(expectedHandleKeys()).toEqual(
      [
        'version', 'compose', 'captureFrame', 'getView', 'setView', 'recordClip',
        'listLayers', 'setLayer', 'pinLayers', 'setMarkerStyle', 'whenReady',
        'listReports', 'listGroups', 'listAreas', 'frameReports', 'frameArea', 'focusReport', 'describeView', 'planReportTour',
        'setTimeWindow', 'getTimeWindow', 'renderBatch', 'planShot', 'renderShot', 'layersFor', 'composeFor',
        // v25: the report cap (BA5–BA7).
        'setReportCap', 'getReportCap', 'setReportLook', 'getReportLook',
        // v31: Earth Weather's look (WX9).
        'setWeather', 'getWeather',
        // v39: a briefing playlist as a clip (BP16).
        'recordTour',
        // v57: what is new since a moment (plan H10).
        'whatsNew',
        // v68: a layer's own choices on the second left rail (critique-2026-11-01, OR12).
        'setLayerChoices', 'getLayerChoices',
        // v72: the solar system's scale (critique-2026-11-01, OR9, OR31).
        'setScale', 'getScale',
        // v74: where Sky from a place looks (plan D5).
        'setSky', 'getSky',
        // v78: two layers side by side (D-CM, CM3).
        'setCompare', 'getCompare',
        // v81: a story as one clip (D-ST, ST8).
        'recordStory',
      ].sort(),
    );
  });

  it('keeps the API version separate from the provenance schema version', async () => {
    // They move for different reasons; see the header of shareHandleContract.
    const { GLOBE_CAPTURE_SCHEMA_VERSION } = await import('../shareCardProvenance');
    expect(typeof SHARE_HANDLE_VERSION).toBe('number');
    expect(typeof GLOBE_CAPTURE_SCHEMA_VERSION).toBe('number');
    expect(SHARE_HANDLE_NAME).toBe('__starcomShareCard');
  });
});
