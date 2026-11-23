/**
 * Why Starcom asks Uplink for something, in the language shown and in English (decision D-ML, ML9):
 * Uplink keeps the first in its activity log, and where it asks the person, shows the English beneath.
 */
import { en, type Messages } from '../i18n/app/en';
import { fill, messagesNow } from '../i18n/app/i18n';
import type { Refusal } from './protocol';

export interface Purpose {
  said: string;
  english: string;
}

/** A purpose from the catalogue, its values filled in both languages. */
export const uplinkPurpose = (key: keyof Messages['uplinkAsks'], values: { said?: Record<string, string>; english?: Record<string, string> } = {}): Purpose => ({
  said: fill(messagesNow().uplinkAsks[key], values.said),
  english: fill(en.uplinkAsks[key], values.english ?? values.said),
});

/** Uplink's refusal as Starcom says it: its kind in the language shown, then Uplink's reason, in Uplink's. */
export const refusalSaid = (refusal: Refusal, reason: string): string =>
  fill(messagesNow().uplink.refusedBecause, { refusal: messagesNow().uplink.refusals[refusal], reason });
