/**
 * Why a record cannot go, and where it would go, said in another language (decision D-ML, L3): each
 * kind of record has its own whole sentence, so a language that agrees words with the noun's gender can.
 * English stays the default for anything that hands no words in.
 */
import { describe, it, expect } from 'vitest';
import { bundleRefusal, exportRefusal } from '../bundleDistribution';
import { describeDestination, whereItGoes } from '../../../nostr/publishTargets';
import de from '../../../../i18n/app/locales/de';
import uk from '../../../../i18n/app/locales/uk';

describe('the reasons, in another language', () => {
  it('says a Private case and a Private mission stay here, each agreeing with its noun, in German', () => {
    expect(bundleRefusal('case', 'private', de.reasons)).toBe(
      'Dieser Fall ist privat: er bleibt in diesem Arbeitsbereich und wird nie an jemand anderen gesendet oder exportiert. '
      + 'Um es weiterzugeben, ändern Sie zuerst, wer es erhalten darf.',
    );
    expect(exportRefusal('mission', 'private', de.reasons)).toMatch(/^Diese Mission ist privat: sie bleibt .+ unter Ihr Schlüssel\.$/);
  });

  it('says why a record goes nowhere, and where a public one goes, in Ukrainian', () => {
    expect(whereItGoes('FINDING', undefined, 'case', uk.reasons).refusal)
      .toBe('Ніхто не вирішив, хто може отримати цю справу, тож вона поки нікуди не йде. Виберіть Публічно, Обмежено або Приватно.');
    expect(describeDestination(['wss://relay.damus.io'], uk.reasons)).toBe(uk.reasons.destination.public);
  });

  it('keeps English when no words are handed in', () => {
    expect(bundleRefusal('case', undefined)).toBe('Nobody has chosen who may receive this case yet. Choose first: Private stays here, and Limited and Public can go to the people you name.');
  });
});
