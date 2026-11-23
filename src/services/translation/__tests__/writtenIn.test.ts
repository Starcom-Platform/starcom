/**
 * Which language a report seems to be written in, without a model (decision D-ML, T1): by its script, and
 * by its commonest short words; nothing claimed for a few words.
 */
import { describe, expect, it } from 'vitest';
import { seemsWrittenIn } from '../writtenIn';

describe('seemsWrittenIn', () => {
  it('reads the Latin-script languages by their common short words', () => {
    expect(seemsWrittenIn('The river rose three metres overnight and the bridge at the old mill is closed.')[0]).toBe('en');
    expect(seemsWrittenIn('Der Fluss ist über Nacht um drei Meter gestiegen, und die Brücke an der alten Mühle ist gesperrt.')[0]).toBe('de');
    expect(seemsWrittenIn('O rio subiu três metros durante a noite e a ponte do moinho velho foi fechada pela defesa civil.')[0]).toBe('pt');
    expect(seemsWrittenIn('Mto umefurika usiku na daraja la kinu cha zamani limefungwa kwa sababu ya maji mengi sana.')[0]).toBe('sw');
  });

  it('reads Hindi by its script, and tells Ukrainian from Russian by their own letters', () => {
    expect(seemsWrittenIn('रात भर में नदी तीन मीटर बढ़ गई और पुराने पुल को बंद कर दिया गया।')).toEqual(['hi']);
    expect(seemsWrittenIn('Річка піднялася на три метри за ніч, і міст біля старого млина закрито.')).toEqual(['uk']);
    expect(seemsWrittenIn('Река поднялась на три метра за ночь, и мост у старой мельницы закрыт, ёлки.')).toEqual(['ru']);
  });

  it('claims nothing for a few words', () => {
    expect(seemsWrittenIn('Flood')).toEqual([]);
    expect(seemsWrittenIn('')).toEqual([]);
  });
});
