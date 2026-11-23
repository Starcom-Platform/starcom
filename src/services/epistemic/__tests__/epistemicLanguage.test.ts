/**
 * The distinctions this vocabulary exists to keep apart.
 *
 * Every honesty defect in this codebase was a wording failure first, so these
 * test SENTENCES rather than structure. Each case below is one that shipped:
 * the point is not that the wording is pretty, it is that two different facts
 * never render as the same claim.
 */
import { describe, it, expect } from 'vitest';
import {
  withheldAsExpired, stalestShown, hiddenByTimeWindow, truncatedMarks,
  unplaceableRecords, computedWhileDegraded, fabricatedInput, emptyBecause,
  matchedVersusShown, hiddenByOperatorFilter, notStated, unattributedActor,
  blindTo, encryptedAtRest, notSearched, labelled,
  singleSourceClaims, singleSourceExplainer, realDataShare, fabricatedRecordLabel,
  linkedRecordsNotDrawn, nothingLinked, notRecorded, couldNotRead, nothingDated, namedForRoom,
  type Disclosure,
} from '../epistemicLanguage';

describe('"not shown" is never "nothing found"', () => {
  it('says an expired layer was WITHHELD, and says so explicitly', () => {
    const d = withheldAsExpired('corroboration', 7_200_000);
    expect(d.text).toContain('withheld');
    expect(d.text).toContain('Not "nothing found"');
    expect(d.tone).toBe('warn');
  });

  it('distinguishes a cap from an operator filter — different causes, different fixes', () => {
    const capped = matchedVersusShown(73, 50);
    const filtered = hiddenByOperatorFilter(12, 'priority filter');

    expect(capped.text).toBe('73 reports matched — showing 50');
    expect(filtered.text).toBe('12 hidden by your priority filter');
    // Phrased "matched — showing", NOT "showing 50 of 73": the total is what
    // passed the SOURCE's filters, and asserting why they differ would claim
    // more than the data supports.
    expect(capped.text).not.toMatch(/showing \d+ of \d+/);
  });

  it('keeps the time cursor separate from both — the operator chose that one', () => {
    expect(hiddenByTimeWindow(4).text).toContain('outside the current time window');
  });
});

describe('an empty view states WHICH kind of empty', () => {
  it('never collapses the three reasons into one sentence', () => {
    const texts = (['no-observations', 'nothing-qualified', 'all-unplaceable'] as const)
      .map((r) => emptyBecause('', r).text);

    expect(new Set(texts).size).toBe(3);
    // Case-insensitive: with no source label the sentence is capitalised,
    // which is `labelled`'s job and not what this test is about.
    expect(texts[0]).toMatch(/nothing of yours to analyse/i);
    expect(texts[1]).toMatch(/nothing qualified/i);
    expect(texts[2]).toMatch(/none could be placed/i);
  });
});

describe('unplaceable records name their reasons individually', () => {
  it('does not reduce distinct causes to a bare count', () => {
    const d = unplaceableRecords('', 4, { 'no coordinates': 3, 'report not found': 1 });

    expect(d.text).toContain('3 no coordinates');
    expect(d.text).toContain('1 report not found');
  });
});

describe('"nobody said" is never "somebody said the lowest value"', () => {
  it('phrases an unstated field as unstated', () => {
    expect(notStated('priority')).toBe('no stated priority');
    expect(notStated('priority')).not.toMatch(/low/i);
  });
});

describe('an unknown actor is never given a name', () => {
  it('records ignorance rather than inventing an operative', () => {
    expect(unattributedActor()).toBe('nobody recorded');
    expect(unattributedActor()).not.toMatch(/operative|unknown user|system/i);
  });
});

describe('an empty field is never shown as a value', () => {
  it('says the record holds nothing, in words no real value uses', () => {
    expect(notRecorded()).toBe('Not recorded');
    expect(notRecorded()).not.toMatch(/unknown|none|unspecified|pending/i);
  });
});

describe('a failed read is never an empty result', () => {
  it('says the read failed, and that this is not "nothing found"', () => {
    expect(couldNotRead('intel items').text).toBe('Intel items could not be read. Not "nothing found".');
  });

  it('explains an empty timeline by its rule, not by a guess', () => {
    expect(nothingDated().text).toContain('event date');
    expect(nothingDated().text).not.toMatch(/ingest|awaiting|no intel events/i);
  });
});

describe('names left off for room still count every event', () => {
  it('gives both numbers, so a few names are not read as a few events', () => {
    expect(namedForRoom(12, 93).text).toBe('12 of 93 events named — the rest would overlap.');
  });
});

describe('structural blindness is declared, not discovered', () => {
  it('says absence is not evidence of absence', () => {
    const d = blindTo('this replay', ['assigned', 'closed']);

    expect(d.text).toContain('assigned, closed');
    // A gap is a log contradicting itself and can be detected. A category
    // nothing ever writes cannot be, so it has to be stated up front.
    expect(d.text).toContain('not evidence they did not happen');
  });
});

describe('encryption does not promise recoverability', () => {
  it('states the fact without offering to open it', () => {
    // decryptCaseDescription returns null when the key is genuinely gone, so
    // "open to view" would be a promise the dialog then retracts.
    expect(encryptedAtRest()).toBe('Description encrypted');
    expect(encryptedAtRest()).not.toMatch(/open|view|click/i);
  });

  it('a search that could not read something says so, with the count', () => {
    expect(notSearched(1, 'classified description', 'they are encrypted at rest').text)
      .toBe('1 classified description not searched — they are encrypted at rest.');
    expect(notSearched(3, 'classified description', 'they are encrypted at rest').text)
      .toContain('3 classified descriptions');
  });
});

describe('a lone source is not a doubtful one', () => {
  it('says single-source, not unverified', () => {
    // Nothing disagrees with these claims — they are alone. "Unverified" and
    // "doubtful" are judgements about truth; this is a prompt for collection.
    const d = singleSourceClaims(12);

    expect(d.text).toBe('Single-source claims (12)');
    expect(d.text).not.toMatch(/unverified|doubtful|unreliable|suspect/i);
    expect(d.tone).toBe('info');
  });

  it('explains what would change it, rather than grading it', () => {
    expect(singleSourceExplainer()).toMatch(/second independent source/i);
  });
});

describe('fabricated provenance is about the record, not the content', () => {
  it('labels the record, and does not call its contents false', () => {
    expect(fabricatedRecordLabel()).toBe('MOCK');
    expect(fabricatedRecordLabel()).not.toMatch(/false|wrong|invalid|fake data/i);
  });

  it('reports real data as a share of the INPUT, not of the conclusions', () => {
    // A run standing on fabricated input does not make its conclusions
    // proportionally wrong; it makes them un-assessable.
    expect(realDataShare(3, 10)).toBe('real data (3/10 recent collections)');
    expect(realDataShare(3, 10)).not.toMatch(/accurate|correct|confidence/i);
  });
});

describe('the tone split, pinned so it is not re-argued per surface', () => {
  /*
   * warn = degraded or missing, and the reader may need to act.
   * info = a normal, expected reduction — their own choice, or a configured cap.
   *
   * Each case carries its reason, because the next person to add a phrasing
   * needs the rule and not just the answer.
   */
  const WARN: Array<[string, Disclosure, string]> = [
    ['withheldAsExpired', withheldAsExpired('corroboration', 7_200_000), 'a layer is being withheld, not empty'],
    ['stalestShown', stalestShown(600_000), 'what IS shown is older than the rest'],
    ['truncatedMarks', truncatedMarks('', 3, 9, false), "the analysis layer's own budget can hide a contradiction"],
    ['unplaceableRecords', unplaceableRecords('', 2, { 'no coordinates': 2 }), 'records exist that could not be drawn'],
    ['computedWhileDegraded', computedWhileDegraded('', ['ucdp']), 'the computation ran without all its inputs'],
    ['fabricatedInput', fabricatedInput('', 0.5), 'the integrity of the input is in question'],
    ['blindTo', blindTo('this replay', ['closed']), 'an entire category of event is unrecorded'],
    ['linkedRecordsNotDrawn', linkedRecordsNotDrawn({ 'no-coordinates': 1 }), 'linked records exist that are not on the map'],
    ['couldNotRead', couldNotRead('intel items'), 'a failed read, which an empty list would hide'],
  ];

  const INFO: Array<[string, Disclosure, string]> = [
    ['hiddenByTimeWindow', hiddenByTimeWindow(4), 'the operator set the time cursor'],
    ['hiddenByOperatorFilter', hiddenByOperatorFilter(3, 'priority filter'), 'the operator set the filter'],
    ['matchedVersusShown', matchedVersusShown(73, 50), 'a maxReports cap doing exactly what it was configured to do'],
    ['emptyBecause', emptyBecause('', 'no-observations'), 'explains an empty state rather than reporting a fault'],
    ['singleSourceClaims', singleSourceClaims(3), 'a prompt for collection, not a fault'],
    ['notSearched', notSearched(1, 'classified description', 'encrypted'), 'expected for encrypted content'],
    ['nothingLinked', nothingLinked('case'), 'an empty case is a state, not a fault'],
    ['nothingDated', nothingDated(), 'explains an empty timeline by the rule that fills it'],
    ['namedForRoom', namedForRoom(12, 93), 'a layout choice about names; every event is still drawn'],
  ];

  it.each(WARN)('%s warns — %s', (_n, d) => expect(d.tone).toBe('warn'));
  it.each(INFO)('%s notes — %s', (_n, d) => expect(d.tone).toBe('info'));

  it('keeps warnings a minority, so amber still means something', () => {
    // If everything warns, nothing does. Five of seven axes rendered amber in
    // the design sketch, which trains a reader to skip the corner where the
    // real problems appear.
    expect(WARN.length).toBeLessThanOrEqual(INFO.length + 1);
  });
});

describe('source labelling', () => {
  it('omits the prefix for a single source, and capitalises instead', () => {
    expect(labelled('', 'showing 2 of 5 marks.')).toBe('Showing 2 of 5 marks.');
  });

  it('names the source when there is more than one, so one cannot vouch for another', () => {
    expect(labelled('gdacs: ', 'showing 2 of 5 marks.')).toBe('gdacs: showing 2 of 5 marks.');
  });
});

describe('degradation and fabrication are stated, not implied by sparseness', () => {
  it('warns that a sparse view during an outage is not a quiet world', () => {
    expect(computedWhileDegraded('', ['ucdp']).text).toContain('sparse does not mean quiet');
  });

  it('reports fabricated input as a share of the input, not of the conclusions', () => {
    expect(fabricatedInput('', 0.75).text).toContain('25% of the input');
  });

  it('separates truncation-by-budget from ordinary truncation', () => {
    const overrun = truncatedMarks('', 3, 9, true).text;
    const ordinary = truncatedMarks('', 3, 9, false).text;

    expect(overrun).not.toBe(ordinary);
    expect(overrun).toContain('contradictions only, all kept');
    expect(ordinary).toContain('contradictions never dropped');
  });

  it('reports the oldest shown analysis without implying the whole view is stale', () => {
    expect(stalestShown(600_000).text).toContain('the rest of the globe is live');
  });
});

describe('the pins of a Case or a Mission say what they leave out', () => {
  it('gives each reason its own count, singular and plural', () => {
    expect(linkedRecordsNotDrawn({ 'no-coordinates': 2, 'intel-item': 1, 'not-found': 1 }).text).toBe(
      '4 linked records not drawn — 2 reports have no coordinates; 1 intel item (the globe pins reports only); 1 not found among reports or intel items.',
    );
    expect(linkedRecordsNotDrawn({ 'no-coordinates': 1, 'intel-item': 2 }).text).toBe(
      '3 linked records not drawn — 1 report has no coordinates; 2 intel items (the globe pins reports only).',
    );
    expect(linkedRecordsNotDrawn({ 'case-not-found': 1 }).text).toBe('1 linked record not drawn — 1 linked case not found.');
    expect(linkedRecordsNotDrawn({ 'case-not-found': 2 }).text).toBe('2 linked records not drawn — 2 linked cases not found.');
  });

  it('does not describe an empty case or mission as a quiet one, and tells a mission with empty cases apart', () => {
    expect(nothingLinked('case').text).toBe('Nothing is linked to this case yet, so it has no pins.');
    expect(nothingLinked('mission').text).toBe('Nothing is linked to this mission yet, so it has no pins.');
    expect(nothingLinked('mission-cases').text).toBe("This mission's cases have nothing linked yet, so it has no pins.");
  });
});
