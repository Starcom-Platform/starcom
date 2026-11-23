/**
 * Starcom's own translator from the page's side (decision D-ML, T2): text goes to the model sentence by
 * sentence, within its 512-token limit, its paragraphs kept; and it is offered only for languages it has.
 */
import { describe, expect, it } from 'vitest';
import { modelTranslates, sentencesOf } from '../nllbTranslator';

describe('sentencesOf', () => {
  it('splits each paragraph into its sentences, as the language writes them', () => {
    expect(sentencesOf('Mto umefurika usiku. Daraja limefungwa!\n\nWatu wamehamishwa.', 'sw'))
      .toEqual([['Mto umefurika usiku.', 'Daraja limefungwa!'], ['Watu wamehamishwa.']]);
    expect(sentencesOf('नदी बढ़ गई। पुल बंद है।', 'hi')).toEqual([['नदी बढ़ गई।', 'पुल बंद है।']]);
  });
});

describe('modelTranslates', () => {
  it('reads only the languages it has, and only where a worker can run it', () => {
    // No Worker in this test's environment: a browser without one is never offered the model.
    expect(modelTranslates('sw', 'en')).toBe(typeof Worker !== 'undefined');
    expect(modelTranslates('xx', 'en')).toBe(false);
  });
});
