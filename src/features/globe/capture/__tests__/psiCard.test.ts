/**
 * A Psi Watch sky event or window on a card (D-PW, PW62, PW77): built from the kit's own notes, its page states the
 * event as its note gives it, drawn at its exact moment or inside its window; a window draws its sky event's lines
 * and faces its places; nothing beside the badge.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PsiNote } from '../../../../services/psiWatch/psiEvents';
import { isPsiAddress, psiCard, subPoint } from '../psiCard';

const fixture = (name: string) => (JSON.parse(readFileSync(`src/services/psiWatch/kit-v0/fixtures/psi/${name}.json`, 'utf8')) as { event: PsiNote }).event;
const SKY = fixture('psi_sky_event.aspect.slow');
const WINDOW = fixture('psi_window');
const LUNATION = fixture('psi_sky_event.lunation');
const NOTES = [SKY, WINDOW, LUNATION];
const addressOf = (note: PsiNote) => `${note.kind}:${note.pubkey}:${note.tags.find((t) => t[0] === 'd')![1]}`;
const tagOf = (note: PsiNote, name: string) => note.tags.find((t) => t[0] === name)!;
const nowhere = () => null;

describe('psiCard', () => {
  it('knows a psi address from any other', () => {
    expect(isPsiAddress(addressOf(SKY))).toBe(true);
    expect(isPsiAddress(addressOf(WINDOW))).toBe(true);
    expect(isPsiAddress(`30023:${SKY.pubkey}:psi-field-2026-10-26`)).toBe(false);
  });

  it('states a sky event at its exact moment, drawn on Planet lines, its first body overhead facing us', () => {
    const staged = psiCard(NOTES, addressOf(SKY), 'exact', nowhere);
    if ('refused' in staged) throw new Error(staged.refused);
    const exact = Number(tagOf(SKY, 'exact')[1]);
    expect(staged.primary).toBe('PsiLines');
    expect(staged.page).toMatchObject({ kind: 'psi_event', family: 'psi_sky_event', title: tagOf(SKY, 'title')[1], atS: Math.round(exact), zones: [] });
    expect(staged.page.lines[0]).toMatch(/^Exact \d+ \w{3} 2026 \d\d:\d\dZ · its window .+Z to .+Z$/);
    expect(staged.page.lines.join(' ')).not.toMatch(/correlation|cause|experimental/i);
    const first = staged.page.bodies[0] as Parameters<typeof subPoint>[0];
    expect(staged.view).toEqual({ ...subPoint(first, staged.page.atS), altitude: 2.5 });
  });

  it('draws a window on Windows with its sky event\'s lines, facing its places, at a moment inside it', () => {
    const [, from, , until] = tagOf(WINDOW, 'window').map(Number);
    const at = Math.round((from + until) / 2);
    const staged = psiCard(NOTES, addressOf(WINDOW), at, (id) => (id === tagOf(WINDOW, 'zone')[1] ? { lat: 15, lng: 10 } : null));
    if ('refused' in staged) throw new Error(staged.refused);
    expect(staged.primary).toBe('PsiWindows');
    expect(staged.sky?.address).toBe(tagOf(WINDOW, 'a')[1]);
    expect(staged.page.zones.length).toBeGreaterThan(0);
    expect(staged.page.lines).toContain(`In ${staged.page.zones.map((z) => z.name).join(', ')}`);
    expect(staged.page.lines.at(-1)).toMatch(/^Drawn at /);
    expect(staged.view).toMatchObject({ lng: 10, altitude: 2.5 });
    expect(staged.view?.lat).toBeCloseTo(15, 9);
  });

  it('refuses an address it does not hold, and a moment outside the window', () => {
    expect(psiCard(NOTES, `31923:${SKY.pubkey}:psi-sky-none`, 'exact', nowhere)).toMatchObject({ refused: expect.stringMatching(/No Psi Watch event/) });
    const [, , , until] = tagOf(SKY, 'window').map(Number);
    expect(psiCard(NOTES, addressOf(SKY), Math.ceil(until) + 3600, nowhere)).toMatchObject({ refused: expect.stringMatching(/outside the event's window/) });
  });
});
