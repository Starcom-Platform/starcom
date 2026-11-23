/**
 * The RLSH panel (D-RF, RF1, RF3, RF6, RF7): the person's own card, and the list of cards heroes have published for
 * Starcom. A card is NavCom's: an alias, what they do, a Zone, up to three of NavCom's activity terms, and how it can
 * be found; signed by a key of its own, published through the review, withdrawn in NavCom's words. The list is the
 * cards labelled for Starcom, by alias, each with its key's print and "Nobody has checked this card"; nobody is
 * counted and nothing is placed on the globe.
 */
import React, { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { counted, fill, listed, useMessages } from '../../i18n/app/i18n';
import { utcDateIn } from '../../i18n/app/dates';
import { AREAS, areaByCode } from '../../features/globe/areas/areaRegistry';
import { closeRlshPanel, openRlshPanel, useRlshPanel } from '../../features/rlsh/rlshPanel';
import { rlshResults } from '../../features/rlsh/rlshPalette';
import { registerPaletteSource } from '../../features/palette/palette';
import { reviewRlshCard, reviewRlshWithdrawal } from '../../services/publishing/rlshCards';
import { contactPubkey, subscribeContactKey } from '../../services/rlsh/contactKey';
import { myCard, setDraft, subscribeMyCard } from '../../services/rlsh/myCard';
import { CALLSIGN_MAX, DOES, DOES_MAX, DOING_MAX, FINDINGS, keyPrint, type CardZone, type RlshCardDraft } from '../../services/rlsh/rlshCard';
import { rlshCards, rlshReadStatus, startRlshRead, subscribeRlshCards } from '../../services/rlsh/rlshRoster';
import type { ReviewOutcome } from '../../services/publishing/publishReview';
import styles from './Rlsh.module.css';

type Words = ReturnType<typeof useMessages>['m']['rlsh'];
type Lang = ReturnType<typeof useMessages>['lang'];

/** The Zones a card may name: ZSP 2.0's, as Starcom serves them, retired ones left out. */
const rlshZones = (): CardZone[] => AREAS
  .filter((a) => a.kind === 'zone' && a.from !== 'covered')
  .map((a) => ({ id: a.code, name: a.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** NavCom's terms a person may pick: all but "A crew", as a crew card comes later (RF2). A card read keeps it. */
const PICKABLE = DOES.filter((d) => d.id !== 'crew');

const doesWord = (w: Words, id: string) => w.doesTerms[id as keyof Words['doesTerms']] ?? { label: id, means: '' };

const MyCard: React.FC<{ w: Words; lang: Lang }> = ({ w, lang }) => {
  const card = useSyncExternalStore(subscribeMyCard, myCard, myCard);
  const key = useSyncExternalStore(subscribeContactKey, contactPubkey, contactPubkey);
  const { draft } = card;
  const zones = useMemo(rlshZones, []);
  const [zoneText, setZoneText] = useState(draft.zone?.name ?? '');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const ids = useId();
  const change = (patch: Partial<RlshCardDraft>) => setDraft({ ...myCard().draft, ...patch });

  const pickZone = (text: string) => {
    setZoneText(text);
    const typed = text.trim().toLowerCase();
    change({ zone: zones.find((z) => z.name.toLowerCase() === typed) ?? null });
  };
  const toggle = (id: string) => {
    if (draft.does.includes(id)) { change({ does: draft.does.filter((d) => d !== id) }); setSaid(null); return; }
    if (draft.does.length >= DOES_MAX) { setSaid(w.doesFull); return; }
    change({ does: [...draft.does, id] });
  };
  const run = async (act: () => Promise<ReviewOutcome<unknown>>) => {
    setBusy(true);
    setSaid(null);
    try {
      const out = await act();
      setSaid(out.status === 'sent' ? w.sent : out.status === 'cancelled' ? w.cancelled : out.reason);
    } catch (e) {
      setSaid(fill(w.failed, { why: String((e as Error).message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="rlsh-mine">
      <p className={styles.body}>{w.intro}</p>
      {card.published ? (
        <p className={styles.note} data-testid="rlsh-published">
          {counted(w.published, card.published.relays, { when: utcDateIn(lang, Date.parse(card.published.at), true) })}
          {' '}{w.find[card.published.finding]}.
        </p>
      ) : card.withdrawnAt ? (
        <p className={styles.note}>{fill(w.withdrawn, { when: utcDateIn(lang, Date.parse(card.withdrawnAt), true) })}</p>
      ) : null}
      {key ? <p className={styles.quiet}>{fill(w.yourKey, { print: keyPrint(key) ?? '' })}</p> : null}

      <label className={styles.field}>
        <span>{w.alias}</span>
        <input value={draft.callsign} maxLength={CALLSIGN_MAX} placeholder={w.aliasHint} onChange={(e) => change({ callsign: e.target.value })} data-testid="rlsh-alias" />
      </label>
      <label className={styles.field}>
        <span>{w.doing} <span className={styles.count}>{fill(w.doingLeft, { n: DOING_MAX - draft.doing.length })}</span></span>
        <textarea rows={2} value={draft.doing} maxLength={DOING_MAX} placeholder={w.doingHint} onChange={(e) => change({ doing: e.target.value })} data-testid="rlsh-doing" />
      </label>
      <label className={styles.field}>
        <span>{w.zone}</span>
        <input list={`${ids}-zones`} value={zoneText} placeholder={w.zoneHint} onChange={(e) => pickZone(e.target.value)} data-testid="rlsh-zone" />
        <datalist id={`${ids}-zones`}>{zones.map((z) => <option key={z.id} value={z.name} />)}</datalist>
        {zoneText.trim() && !draft.zone ? <span className={styles.warn}>{w.zoneUnknown}</span> : null}
      </label>

      <fieldset className={styles.set}>
        <legend>{fill(w.does, { n: DOES_MAX })}</legend>
        <div className={styles.chips}>
          {PICKABLE.map((d) => {
            const word = doesWord(w, d.id);
            return (
              <button key={d.id} type="button" className={styles.chip} aria-pressed={draft.does.includes(d.id)} title={word.means} onClick={() => toggle(d.id)} data-testid={`rlsh-does-${d.id}`}>
                {word.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.set}>
        <legend>{w.findBy}</legend>
        {FINDINGS.map((f) => (
          <label key={f} className={styles.choice}>
            <input type="radio" name={`${ids}-finding`} checked={draft.finding === f} onChange={() => change({ finding: f })} data-testid={`rlsh-find-${f}`} />
            <span><strong>{w.find[f]}</strong> <span className={styles.quiet}>{w.findHint[f]}</span></span>
          </label>
        ))}
      </fieldset>

      <p className={styles.quiet}>{w.keyNote}</p>
      <div className={styles.foot}>
        <button type="button" className={styles.primary} disabled={busy || !draft.callsign.trim() || (!!zoneText.trim() && !draft.zone)} onClick={() => run(() => reviewRlshCard(myCard().draft))} data-testid="rlsh-publish">
          {card.published ? w.update : w.publish}
        </button>
      </div>

      {key && card.published ? (
        <div className={styles.withdraw}>
          <p className={styles.quiet}>{w.withdrawHint}</p>
          <label className={styles.choice}>
            <input type="checkbox" checked={discard} onChange={(e) => setDiscard(e.target.checked)} data-testid="rlsh-discard-key" />
            <span>{w.discardKey}</span>
          </label>
          <button type="button" className={styles.minor} disabled={busy} onClick={() => run(() => reviewRlshWithdrawal({ discardKey: discard }))} data-testid="rlsh-withdraw">
            {w.withdraw}
          </button>
        </div>
      ) : null}
      {said ? <p className={styles.warn} role="status">{said}</p> : null}
    </div>
  );
};

const CardList: React.FC<{ w: Words }> = ({ w }) => {
  useEffect(() => startRlshRead(), []);
  const cards = useSyncExternalStore(subscribeRlshCards, rlshCards, rlshCards);
  const status = useSyncExternalStore(subscribeRlshCards, rlshReadStatus, rlshReadStatus);
  const mine = useSyncExternalStore(subscribeContactKey, contactPubkey, contactPubkey);
  return (
    <div data-testid="rlsh-list">
      <p className={styles.body}>{w.listIntro}</p>
      {status.error ? <p className={styles.warn} role="status">{status.error}</p> : null}
      {cards.length ? (
        <ul className={styles.cards}>
          {cards.map((c) => (
            <li key={c.pubkey} className={styles.card} data-testid="rlsh-card">
              <div className={styles.cardHead}>
                <strong className={styles.callsign}>{c.callsign}</strong>
                <code className={styles.print} title={c.pubkey}>{keyPrint(c.pubkey)}</code>
                {c.agent ? <span className={styles.tag}>{w.agent}</span> : null}
                {c.pubkey === mine ? <span className={styles.tag}>{w.yours}</span> : null}
              </div>
              {c.doing ? <p className={styles.doing}>{c.doing}</p> : null}
              <p className={styles.quiet}>
                {c.zone ? (areaByCode(c.zone.id)?.name ?? c.zone.name) : w.noZone}
                {c.does.length ? ` · ${listed(c.does.map((id) => doesWord(w, id).label))}` : ''}
              </p>
              <p className={styles.unchecked}>{w.unchecked}</p>
            </li>
          ))}
        </ul>
      ) : <p className={styles.quiet}>{status.loaded || status.error ? w.empty : w.reading}</p>}
    </div>
  );
};

export const RlshPanel: React.FC = () => {
  const { open, tab } = useRlshPanel();
  const { m, lang } = useMessages();
  const w = m.rlsh;
  useEffect(() => registerPaletteSource({ id: 'rlsh', results: rlshResults }), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRlshPanel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="rlsh-heading" data-testid="rlsh-panel">
      <div className={styles.head}>
        <h2 id="rlsh-heading" className={styles.heading}>{w.heading}</h2>
        <button type="button" className={styles.close} aria-label={w.close} title={w.close} onClick={closeRlshPanel}>×</button>
      </div>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={styles.tab} onClick={() => openRlshPanel('mine')} data-testid="rlsh-tab-mine">{w.tabMine}</button>
        <button type="button" role="tab" aria-selected={tab === 'list'} className={styles.tab} onClick={() => openRlshPanel('list')} data-testid="rlsh-tab-list">{w.tabList}</button>
      </div>
      {tab === 'mine' ? <MyCard w={w} lang={lang} /> : <CardList w={w} />}
    </aside>
  ), document.body);
};
