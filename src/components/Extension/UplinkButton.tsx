import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../../symbols/Glyph';
import { CAPABILITY_MEANS } from '../../extension/protocol';
import { askUplink, useStarcomUplink } from '../../extension/useStarcomUplink';
import { useUplinkCaptures } from '../../extension/useUplinkCaptures';
import { useUplinkInboxCount } from '../../extension/useUplinkInboxCount';
import styles from './UplinkButton.module.css';
import { fill, useMessages } from '../../i18n/app/i18n';
import { fillNodes } from '../../i18n/app/fillNodes';
import { uplinkPurpose } from '../../extension/purposes';

/**
 * Starcom Uplink in the header (decision D-EX, E0): whether the browser extension is here, and what it
 * does, one click away. A dot says connected; the panel says what Uplink does now and which sites it
 * may reach, or, when it is not installed, what it is and when it comes. Nothing it says is a feature
 * not yet built.
 *
 * The store's address goes here once Uplink is listed (EX7: Unlisted first).
 */
export const UPLINK_STORE_URL: string | null = null;


const UplinkButton: React.FC<{ className?: string }> = ({ className }) => {
  const state = useStarcomUplink();
  // What the person sent from their browser comes in while Starcom is open (E2).
  useUplinkCaptures();
  // And how many wait to be filed, for Uplink's icon (W7).
  useUplinkInboxCount();
  const [open, setOpen] = useState(false);
  // In the language chosen (D-ML, L3).
  const { m } = useMessages();
  const t = m.uplink;
  /** What it may reach: site addresses, set in the data face, or a sentence about them. */
  const [sites, setSites] = useState<{ addresses: string } | { words: string } | null>(null);

  // What it may reach, asked when the panel opens, with its purpose.
  useEffect(() => {
    if (!open || state.status !== 'connected') return;
    let current = true;
    const why = uplinkPurpose('sites');
    void askUplink('permissions.status', why.said, {}, undefined, why.english).then((answer) => {
      if (!current) return;
      if (answer.ok === false) setSites({ words: fill(t.refused, { why: t.refusals[answer.refusal] }) });
      else if (answer.result.allSites) setSites({ words: t.allSites });
      else if (answer.result.granted.length) setSites({ addresses: answer.result.granted.map((g) => g.replace(/\/\*$/, '')).join(', ') });
      else setSites({ words: t.noSites });
    });
    return () => { current = false; };
  }, [open, state.status, t]);

  const words = state.status === 'connected' ? t.connected : state.status === 'absent' ? t.notInstalled : t.name;

  return (
    <>
      <button
        type="button"
        className={`${className ?? ''} ${styles.button}`}
        aria-label={words}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={words}
        onClick={() => setOpen((was) => !was)}
        data-testid="uplink-button"
      >
        <Glyph name="action:uplink" size={20} />
        {state.status !== 'checking' && <span className={styles.dot} data-status={state.status} aria-hidden="true" />}
      </button>
      {open && createPortal(
        <section className={styles.panel} role="dialog" aria-label={t.name} data-testid="uplink-panel">
          <div className={styles.head}>
            <h2 className={styles.heading}>{t.name}</h2>
            <button type="button" className={styles.close} aria-label={t.close} onClick={() => setOpen(false)}>×</button>
          </div>
          {state.status === 'connected' ? (
            <>
              <p className={styles.body}>{fill(t.version, { version: state.hello.extensionVersion })}</p>
              <p className={styles.body}>{t.doesNow}</p>
              <ul className={styles.list}>
                {/* A capability a newer Uplink has and this page has no words for is said as Uplink says it. */}
                {state.hello.capabilities.map((c) => <li key={c.id}>{(t.capabilities as Record<string, string>)[c.id] ?? CAPABILITY_MEANS[c.id] ?? c.id}</li>)}
              </ul>
              <p className={styles.note}>
                {t.sites}{' '}
                {sites === null ? '…' : 'addresses' in sites ? <span className={styles.site}>{sites.addresses}</span> : sites.words}
              </p>
              <p className={styles.note}>{t.logNote}</p>
            </>
          ) : (
            <>
              <p className={styles.body}>{t.about}</p>
              <p className={styles.body}>{state.status === 'checking' ? t.looking : t.notHere}</p>
              {UPLINK_STORE_URL
                ? <p className={styles.body}>{fillNodes(t.install, { link: <a href={UPLINK_STORE_URL} target="_blank" rel="noreferrer">{t.installLink}</a> })}</p>
                : <p className={styles.note}>{t.coming}</p>}
            </>
          )}
        </section>,
        document.body,
      )}
    </>
  );
};

export default UplinkButton;
