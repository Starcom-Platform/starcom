/**
 * The PsiOps Briefing on a card (D-PW, PW62, PW77): the week from the card's moment, built from the kit's own notes
 * and Kp: its windows with their Zones, Kp's largest and its day, the Psi Alerts open; facing its places; nothing
 * beside the notes' words.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { PsiNote } from '../../../../services/psiWatch/psiEvents';
import { kpRecord } from '../../../../services/psiWatch/timestream/kp';
import { psiBriefing } from '../psiBriefing';

const DIR = 'src/services/psiWatch/kit-v0/fixtures/psi';
const NOTES = readdirSync(DIR).map((f) => (JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as { event: PsiNote }).event);
const tagOf = (note: PsiNote, name: string) => note.tags.find((t) => t[0] === name)?.[1];
const ALERT = NOTES.find((n) => tagOf(n, 'd')?.startsWith('psi-alert-'))!;
// The alert's own start: it is open then, and the kit's windows of the following week stand ahead.
const AT = Number(tagOf(ALERT, 'valid_from'));
const KP = kpRecord(null, [
  { fromMs: (AT + 86_400) * 1000, untilMs: (AT + 86_400 + 10_800) * 1000, kp: 5.67, basis: 'predicted' },
  { fromMs: (AT + 3 * 86_400) * 1000, untilMs: (AT + 3 * 86_400 + 10_800) * 1000, kp: 3, basis: 'predicted' },
], []);
const centres = (id: string) => (id === 'zone:sahel' ? { lat: 15, lng: 5 } : null);

describe('psiBriefing', () => {
  it('names the week\'s windows soonest first, with their Zones, then Kp\'s largest and the Psi Alerts open', () => {
    const { page } = psiBriefing(NOTES, KP, AT, centres);
    expect(page).toMatchObject({ kind: 'psi_briefing', fromS: AT, untilS: AT + 7 * 86_400, alerts: 1 });
    expect(page.title).toMatch(/^PsiOps Briefing · \d+ \w{3} to \d+ \w{3} 2026$/);
    expect(page.windows).toBeGreaterThan(0);
    const windowLines = page.lines.filter((l) => / · exact /.test(l));
    expect(windowLines.length).toBe(Math.min(5, page.windows));
    expect(page.lines).toContain(`Kp, the week's largest: 6− on ${new Date((AT + 86_400) * 1000).getUTCDate()} ${new Date((AT + 86_400) * 1000).toUTCString().slice(8, 11)}, expected`);
    expect(page.lines.at(-1)).toMatch(/^Psi Alert open in Sahel Zone until /);
    expect(page.kpTop).toMatchObject({ kp: 5.666666666666667, basis: 'predicted' });
    expect(page.lines.join(' ')).not.toMatch(/correlation|cause|Mecha Jono/i);
  });

  it('faces the week\'s places, and opens its first sky event', () => {
    const staged = psiBriefing(NOTES, KP, AT, centres);
    expect(staged.view).toMatchObject({ altitude: 2.5 });
    expect(staged.view!.lat).toBeCloseTo(15, 6);
    expect(staged.sky?.address).toMatch(/^31923:[0-9a-f]{64}:psi-sky-/);
  });

  it('says so when the week holds no window and no alert, and gives no Kp it does not know', () => {
    const { page, sky } = psiBriefing(NOTES, null, AT + 400 * 86_400, () => null);
    expect(page.lines).toEqual(['No window in the week.', 'No Psi Alert open.']);
    expect(page.kpTop).toBeNull();
    expect(sky).toBeNull();
  });
});
