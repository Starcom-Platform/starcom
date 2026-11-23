/**
 * Names as published (D-NP): the tag read from a note's own `t` tags, and the words a mission must not carry.
 *
 * The register is module state, fresh for each test file; each test here remembers words of its own.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { tagsNamePeople, rememberNamedNote, carriesNamedWords, mentionsNamedTitle, capturable } from '../namesPeople';

describe('tagsNamePeople', () => {
  it('reads the publisher\'s own t tag, in any case', () => {
    expect(tagsNamePeople([['t', 'starcom_intel'], ['t', 'names_people']])).toBe(true);
    expect(tagsNamePeople([['t', 'Names_People ']])).toBe(true);
  });

  it('does not take it from anything but a t tag', () => {
    expect(tagsNamePeople([['t', 'starcom_intel'], ['L', 'names_people'], ['names_people']])).toBe(false);
    expect(tagsNamePeople(undefined)).toBe(false);
    expect(tagsNamePeople([])).toBe(false);
  });
});

describe('the words of tagged notes', () => {
  it('finds nothing when no tagged note has been read', () => {
    expect(carriesNamedWords('anything at all, quoted from anyone at all')).toBeNull();
    expect(mentionsNamedTitle('anything at all')).toBe(false);
  });

  it('finds a tagged note\'s title or sentence quoted in a text, whatever its case and punctuation', () => {
    rememberNamedNote('n1', 'Minister Jane Roe resigns over the port deal', 'The resignation was announced on Monday by the prime minister\'s office. Short line.');
    expect(carriesNamedWords('Mission: follow up on "minister jane roe resigns over the port deal!"')).toBe('minister jane roe resigns over the port deal');
    expect(carriesNamedWords('Note: the resignation was announced on Monday by the prime minister\'s office')).not.toBeNull();
  });

  it('does not refuse a text for a short passage, or for words that only begin a longer one', () => {
    rememberNamedNote('n2', 'Doe appeals', 'Brief. John Doe said he would appeal the ruling next week.');
    expect(carriesNamedWords('Doe appeals. Brief.')).toBeNull();
    expect(carriesNamedWords('John Doe said he would appeal')).toBeNull();
    expect(carriesNamedWords('John Doe said he would appeal the ruling next week')).not.toBeNull();
  });

  it('keeps one set of words a note, its latest', () => {
    rememberNamedNote('n3', 'Senator Mary Major visits the harbour', '');
    rememberNamedNote('n3', 'Senator Mary Major visits the airfield', '');
    expect(carriesNamedWords('Senator Mary Major visits the harbour')).toBeNull();
    expect(carriesNamedWords('Senator Mary Major visits the airfield')).not.toBeNull();
  });

  it('finds a tagged title in a mark\'s words even when shorter than a mission check would take', () => {
    rememberNamedNote('n4', 'Mayor Lee', '');
    expect(carriesNamedWords('Mayor Lee')).toBeNull();
    expect(mentionsNamedTitle('Protest outside city hall; Mayor Lee')).toBe(true);
    expect(mentionsNamedTitle('Mayor Leeds')).toBe(false);
  });
});

describe('capturable', () => {
  it('keeps everything but the notes that name a person', () => {
    expect(capturable([{ id: 'a' }, { id: 'b', namesPeople: true }, { id: 'c', namesPeople: false }]).map((i) => i.id)).toEqual(['a', 'c']);
  });
});
