import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPublicKey, nip19 } from 'nostr-tools';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { keyMayExistOnlyHere, recordKeyBackedUp } from '../../services/identity/identityNotice';
import { PASSPHRASE_MIN, subscribeKeyLock } from '../../services/identity/keyLock';
import { decodeNsec } from '../../services/identity/identityBackup';
import { ownName } from '../../services/identity/names';
import { openOwnNamePrompt } from './OwnNameRoot';
import { openCallsignPrompt } from './callsignPrompt';
import { publishedCallsign, publishesAsAgent } from '../../services/identity/callsign';
import styles from './YourKey.module.css';
import WhatIs from '../Help/WhatIs';
import ImportBundleDialog from '../Intel/Bundles/ImportBundleDialog';
import { makeWorkCopy, type CopyLeftOut } from '../../services/intel/copy/workCopy';
import type { BundledType } from '../../services/exchange/bundle';
import { makePortfolio } from '../../services/portfolio/makePortfolio';
import { refreshUplinkSigner, uplinkSigner, uplinkSignerStatus } from '../../extension/uplinkSigner';
import { moveKeyToUplink } from '../../extension/moveKey';
import { useStarcomUplink } from '../../extension/useStarcomUplink';
import { counted, fill, listed, useMessages } from '../../i18n/app/i18n';
import { fillNodes } from '../../i18n/app/fillNodes';
import type { Messages } from '../../i18n/app/en';

/**
 * "Your key", one click away from anywhere (plan item 2.3, step 6).
 *
 * A request for access asks for the person's npub, and after the one-time key
 * notice (IdentityNoticeRoot) the app showed it nowhere. This is where it
 * lives: who you are, your npub to copy, where the key is kept, and, for a
 * key this browser holds, the secret to back up behind its own button.
 *
 * Opening it never makes a key. It asks who signs, which may ask an installed
 * extension, since the person asked; a browser with no key is told so.
 *
 * It is also where a key is brought from another device (plan item 9.11,
 * decision G2), by its nsec. What stays on the other device is said first, and
 * a key this browser already holds is never replaced without asking.
 *
 * And where a person takes all their work with them (plan item 9.13b,
 * decision G8d): one file, Private included, sealed to this key. It sits here
 * because only this key opens it, so a key never backed up is said first.
 *
 * And where they make their portfolio for an advisor (decision D-EX, EX12,
 * EX31): the opposite of the sealed copy, a page anyone can read and check,
 * Public work in full and the rest listed by kind and date only.
 */
const toNpub = (pubkey: string): string | null => {
  try { return nip19.npubEncode(pubkey); } catch { return null; }
};
const short = (npub: string): string => `${npub.slice(0, 14)}…${npub.slice(-6)}`;

/** Who holds the key: a signing extension, this browser, Starcom Uplink, Uplink while it is away (E3), or nobody yet. */
type Holder = 'extension' | 'browser' | 'uplink' | 'away' | 'none';

/** What a copy holds and what it left out, in the words of the language shown. */
function savedWords(t: Messages['yourKey'], holds: Record<BundledType, number>, leftOut: CopyLeftOut): string {
  const { counts } = t;
  const held = listed([
    counted(counts.case, holds.case), counted(counts.mission, holds.mission),
    counted(counts.report, holds.report), counted(counts.intelItem, holds.item),
  ]);
  const left: string[] = [];
  if (leftOut.fromRelays) left.push(fill(t.fromRelays, { reports: counted(counts.report, leftOut.fromRelays) }));
  if (leftOut.sample) left.push(counted(counts.sampleRecord, leftOut.sample));
  if (leftOut.unreadable.length) {
    left.push(fill(t.unreadable, {
      records: counted(counts.protectedRecord, leftOut.unreadable.length),
      titles: listed(leftOut.unreadable.map((title) => fill(t.quoted, { title }))),
    }));
  }
  return fill(t.saved, { held }) + (left.length ? ` ${fill(t.leftOut, { left: left.join('; ') })}` : '');
}

const YourKeyPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { m: { yourKey: t } } = useMessages();
  const [signer, setSigner] = useState<string | null>(() => nostrIdentityService.signerPubkey());
  const [holder, setHolder] = useState<Holder>(() => (nostrIdentityService.hasExtension() ? 'extension' : nostrIdentityService.getPubkey() ? 'browser' : 'none'));
  const [nsec, setNsec] = useState<string | null>(null);
  const [copied, setCopied] = useState<'npub' | 'nsec' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bringing, setBringing] = useState(false);
  const [pasted, setPasted] = useState('');
  /** The npub of the key a brought one would replace, while that is being asked. */
  const [replacing, setReplacing] = useState<string | null>(null);
  const [bringNote, setBringNote] = useState<string | null>(null);
  const [bringError, setBringError] = useState<string | null>(null);
  const [brought, setBrought] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [workSaved, setWorkSaved] = useState<string | null>(null);
  const [workError, setWorkError] = useState<string | null>(null);
  const [openingCopy, setOpeningCopy] = useState(false);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [portfolio, setPortfolio] = useState<{ json: string; words: string } | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // The passphrase lock (D-KL): offered for a key this browser holds, removable once set.
  const [lockState, setLockState] = useState(() => nostrIdentityService.keyLockState());
  const [locking, setLocking] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);
  useEffect(() => subscribeKeyLock(() => setLockState(nostrIdentityService.keyLockState())), []);
  const uplink = useStarcomUplink();
  const uplinkSigns = uplink.status === 'connected' && uplink.hello.capabilities.some((c) => c.id === 'signer.import');

  /** Who signs now, asked afresh: Uplink first, then a signing extension, then this browser. */
  const learnHolder = async (live: () => boolean = () => true) => {
    if (uplinkSigns) await refreshUplinkSigner();
    const { pubkey, source } = await nostrIdentityService.whoAmI();
    if (!live()) return;
    setSigner(pubkey);
    setHolder(uplinkSigner() ? 'uplink'
      : source === 'extension' ? 'extension'
        : nostrIdentityService.heldByUplink() ? 'away'
          : source === 'local' ? 'browser' : 'none');
  };

  // Asked when the panel opens, and again when Uplink arrives or leaves.
  useEffect(() => {
    let live = true;
    void learnHolder(() => live).catch(() => undefined);
    return () => { live = false; };
  }, [uplinkSigns]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async () => {
    setMoving(true);
    setMoveError(null);
    try {
      await moveKeyToUplink();
      setMoved(true);
      setNsec(null);
      await learnHolder();
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoving(false);
    }
  };
  const otherUplinkKey = (() => {
    const status = uplinkSignerStatus();
    return status?.held && status.pubkey && status.pubkey !== signer ? status.pubkey : null;
  })();

  const npub = signer ? toNpub(signer) : null;
  const name = ownName();
  // Published as your author (D-MX, MX7), unlike the name, which stays in this browser.
  const callsign = publishedCallsign();
  const asAgent = publishesAsAgent();

  // Best effort: a browser may refuse clipboard access, and the key is on screen either way.
  const copy = (which: 'npub' | 'nsec', text: string | null) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => setCopied(which)).catch(() => setCopied(null));
  };

  const reveal = async () => {
    setError(null);
    try {
      // A locked key asks for its passphrase first (D-KL).
      setNsec(await nostrIdentityService.exportNsecUnlocking());
      recordKeyBackedUp();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.keyUnreadable);
    }
  };

  const stopLocking = () => {
    setLocking(false);
    setPassphrase('');
    setAgain('');
    setLockError(null);
  };

  const lockIt = async () => {
    if (passphrase.normalize('NFKC').length < PASSPHRASE_MIN) { setLockError(t.lock.tooShort); return; }
    if (passphrase !== again) { setLockError(t.lock.differ); return; }
    setLockBusy(true);
    setLockError(null);
    try {
      await nostrIdentityService.lockKey(passphrase);
      stopLocking();
    } catch (e) {
      setLockError(fill(t.lock.failed, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLockBusy(false);
    }
  };

  const removeLock = async () => {
    setLockBusy(true);
    setLockError(null);
    try {
      await nostrIdentityService.removeKeyLock();
    } catch (e) {
      setLockError(fill(t.lock.removeFailed, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLockBusy(false);
    }
  };

  /** Hands the person a file to save. */
  const saveFile = (contents: string, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  };

  const makeMyPortfolio = async () => {
    setPortfolioBusy(true);
    setPortfolio(null);
    setPortfolioError(null);
    try {
      const made = await makePortfolio();
      const day = new Date().toISOString().slice(0, 10);
      saveFile(made.html, 'text/html', `starcom-portfolio-${day}.html`);
      const { items, events, read } = made.portfolio;
      const shown = items.filter((i) => i.shown).length;
      setPortfolio({
        json: made.json,
        words: fill(t.portfolioSaved, {
          items: counted(t.counts.item, items.length), shown, listed: items.length - shown, events: counted(t.counts.signedEvent, events.length),
        }) + (read.complete ? '' : ` ${t.portfolioPartial}`),
      });
    } catch (e) {
      setPortfolioError(fill(t.portfolioFailed, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPortfolioBusy(false);
    }
  };

  const exportWork = async () => {
    setExporting(true);
    setWorkSaved(null);
    setWorkError(null);
    try {
      const { file, holds, leftOut } = await makeWorkCopy();
      const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `starcom-work-${new Date().toISOString().slice(0, 10)}.starcom-copy.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
      setWorkSaved(savedWords(t, holds, leftOut));
    } catch (e) {
      setWorkError(fill(t.copyFailed, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExporting(false);
    }
  };

  const stopBringing = () => {
    setBringing(false);
    setPasted('');
    setReplacing(null);
    setBringNote(null);
    setBringError(null);
  };

  const adopt = () => {
    try {
      const pubkey = nostrIdentityService.importNsec(pasted);
      stopBringing();
      setSigner(pubkey);
      setHolder('browser');
      setNsec(null);
      setBrought(true);
    } catch (e) {
      setReplacing(null);
      setBringError(e instanceof Error ? e.message : t.unusableKey);
    }
  };

  // Read before anything changes: what was pasted, and whether it would replace a key held here.
  const bringKey = () => {
    setBringNote(null);
    setBringError(null);
    let pubkey: string;
    try {
      pubkey = getPublicKey(decodeNsec(pasted));
    } catch (e) {
      setBringError(e instanceof Error ? e.message : t.unreadableKey);
      return;
    }
    const held = nostrIdentityService.getPubkey();
    // The same key, locked here and its passphrase forgotten: brought back from the backup, it replaces the locked
    // copy, unlocked (D-KL).
    if (held === pubkey && nostrIdentityService.keyLockState() === 'locked') {
      adopt();
      return;
    }
    if (held === pubkey) {
      setBringNote(t.alreadyThis);
      return;
    }
    if (held) {
      setReplacing(toNpub(held) ?? held);
      return;
    }
    adopt();
  };

  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="your-key-heading" data-testid="your-key">
      <div className={styles.head}>
        <h2 id="your-key-heading" className={styles.heading}>{t.heading} <WhatIs term="key" /></h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>×</button>
      </div>

      {holder === 'none' || !npub ? (
        <p className={styles.body}>{t.noKey}</p>
      ) : (
        <>
          <p className={styles.body}>
            {name ? fillNodes(t.youAre, { name: <strong>{name}</strong> }) : t.noName}{' '}
            <button type="button" className={styles.link} onClick={() => { openOwnNamePrompt(); onClose(); }}>
              {name ? t.changeName : t.setName}
            </button>
          </p>
          <p className={styles.body}>
            {callsign
              ? fillNodes(asAgent ? t.publishAsAgent : t.publishAs, { callsign: <strong>{callsign}</strong> })
              : asAgent ? t.publishUnderAgent : t.publishUnder}{' '}
            <button type="button" className={styles.link} onClick={() => { openCallsignPrompt(); onClose(); }}>
              {callsign ? t.changeCallsign : t.setCallsign}
            </button>
          </p>
          <div className={styles.npubRow}>
            <code title={npub}>{short(npub)}</code>
            <button type="button" className={styles.minor} onClick={() => copy('npub', npub)}>
              {copied === 'npub' ? t.copied : t.copyNpub}
            </button>
          </div>
          <p className={styles.note} data-testid="your-key-holder">
            {holder === 'browser' && lockState !== 'none' ? t.holders.browserLocked : t.holders[holder]}
          </p>
          {moved && <p className={styles.note} role="status" data-testid="your-key-moved">{t.moved}</p>}

          {holder === 'browser' && uplinkSigns && (
            <div className={styles.work} data-testid="your-key-uplink">
              <p className={styles.note}>{t.keepInUplink}</p>
              {otherUplinkKey ? (
                <p className={styles.note}>{fill(t.otherUplinkKey, { npub: short(toNpub(otherUplinkKey) ?? otherUplinkKey) })}</p>
              ) : (
                <>
                  {keyMayExistOnlyHere() && (
                    <p className={styles.warning}>{t.backUpFirst}</p>
                  )}
                  <div className={styles.actions}>
                    <button type="button" className={styles.minor} onClick={() => void move()} disabled={moving || keyMayExistOnlyHere()}>
                      {moving ? t.moving : t.move}
                    </button>
                  </div>
                </>
              )}
              {moveError && <p className={styles.warning} role="alert">{fill(t.moveFailed, { reason: moveError })}</p>}
            </div>
          )}

          {holder === 'browser' && !nsec && (
            <button type="button" className={styles.minor} onClick={() => void reveal()}>{t.showKey}</button>
          )}
          {nsec && (
            <div className={styles.secret}>
              <p className={styles.warning}>{t.nsecWarning}</p>
              <code className={styles.nsec} data-testid="your-key-nsec">{nsec}</code>
              <div className={styles.actions}>
                <button type="button" className={styles.minor} onClick={() => copy('nsec', nsec)}>
                  {copied === 'nsec' ? t.copied : t.copyNsec}
                </button>
                <button type="button" className={styles.minor} onClick={() => setNsec(null)}>{t.hide}</button>
              </div>
            </div>
          )}
          {error && <p className={styles.warning} role="alert">{error}</p>}

          {holder === 'browser' && (
            <div className={styles.work} data-testid="your-key-lock">
              {lockState !== 'none' ? (
                <>
                  <p className={styles.note}>{t.lock.locked}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.minor} onClick={() => void removeLock()} disabled={lockBusy}>
                      {lockBusy ? t.lock.removing : t.lock.remove}
                    </button>
                  </div>
                </>
              ) : locking ? (
                <form onSubmit={(e) => { e.preventDefault(); void lockIt(); }}>
                  <p className={styles.warning}>
                    {t.lock.warning}{keyMayExistOnlyHere() ? ` ${t.lock.backUpFirst}` : ''}
                  </p>
                  <label className={styles.label} htmlFor="your-key-passphrase">{t.lock.passphrase}</label>
                  <input
                    id="your-key-passphrase"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={passphrase}
                    disabled={lockBusy}
                    onChange={(e) => { setPassphrase(e.target.value); setLockError(null); }}
                  />
                  <label className={styles.label} htmlFor="your-key-passphrase-again">{t.lock.again}</label>
                  <input
                    id="your-key-passphrase-again"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={again}
                    disabled={lockBusy}
                    onChange={(e) => { setAgain(e.target.value); setLockError(null); }}
                  />
                  <div className={styles.actions}>
                    <button type="submit" className={styles.minor} disabled={lockBusy || !passphrase || !again}>
                      {lockBusy ? t.lock.locking : t.lock.confirm}
                    </button>
                    <button type="button" className={styles.minor} onClick={stopLocking}>{t.cancel}</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className={styles.note}>{t.lock.note}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.minor} onClick={() => setLocking(true)}>{t.lock.start}</button>
                  </div>
                </>
              )}
              {lockError && <p className={styles.warning} role="alert">{lockError}</p>}
            </div>
          )}

          <div className={styles.work} data-testid="your-work">
            <p className={styles.note}>{t.workNote}</p>
            {holder === 'browser' && keyMayExistOnlyHere() && (
              <p className={styles.warning}>{t.notBackedUp}</p>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.minor} onClick={() => void exportWork()} disabled={exporting}>
                {exporting ? t.sealing : t.exportWork}
              </button>
              <button type="button" className={styles.minor} onClick={() => setOpeningCopy(true)}>{t.openCopy}</button>
            </div>
            {workSaved && <p className={styles.note} role="status" data-testid="your-work-saved">{workSaved}</p>}
            {workError && <p className={styles.warning} role="alert">{workError}</p>}
          </div>
          <div className={styles.work} data-testid="your-portfolio">
            <p className={styles.note}>{t.portfolioNote}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.minor} onClick={() => void makeMyPortfolio()} disabled={portfolioBusy}>
                {portfolioBusy ? t.portfolioBusy : t.makePortfolio}
              </button>
              {portfolio && (
                <button type="button" className={styles.minor} onClick={() => saveFile(portfolio.json, 'application/json', `starcom-portfolio-${new Date().toISOString().slice(0, 10)}.json`)}>
                  {t.portfolioJson}
                </button>
              )}
            </div>
            {portfolio && <p className={styles.note} role="status" data-testid="your-portfolio-saved">{portfolio.words}</p>}
            {portfolioError && <p className={styles.warning} role="alert">{portfolioError}</p>}
          </div>
          {openingCopy && <ImportBundleDialog open expecting="copy" onClose={() => setOpeningCopy(false)} />}
        </>
      )}

      {brought && <p className={styles.note} role="status">{t.brought}</p>}
      {holder !== 'extension' && (bringing ? (
        <form className={styles.bring} onSubmit={(e) => { e.preventDefault(); bringKey(); }}>
          <p className={styles.note}>{t.whatStays}</p>
          <label className={styles.label} htmlFor="your-key-bring">{t.secretLabel}</label>
          <input
            id="your-key-bring"
            className={styles.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={pasted}
            onChange={(e) => { setPasted(e.target.value); setReplacing(null); setBringNote(null); setBringError(null); }}
          />
          {replacing ? (
            <div className={styles.secret}>
              <p className={styles.warning}>
                {fill(t.replacing, { npub: short(replacing) })}{' '}
                {keyMayExistOnlyHere() ? t.replacingNotBacked : t.replacingBacked}
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.minor} onClick={adopt}>{t.replace}</button>
                <button type="button" className={styles.minor} onClick={() => setReplacing(null)}>{t.keep}</button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="submit" className={styles.minor}>{t.useHere}</button>
              <button type="button" className={styles.minor} onClick={stopBringing}>{t.cancel}</button>
            </div>
          )}
          {bringNote && <p className={styles.note} role="status">{bringNote}</p>}
          {bringError && <p className={styles.warning} role="alert">{bringError}</p>}
        </form>
      ) : (
        <button type="button" className={styles.link} onClick={() => { setBrought(false); setBringing(true); }}>
          {holder === 'none' ? t.useYourKey : t.useAKey}
        </button>
      ))}
    </aside>
  ), document.body);
};

/** The header's button, and the panel it opens. */
const YourKey: React.FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false);
  const { m: { yourKey: t } } = useMessages();
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={t.button}
        title={t.buttonTitle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="your-key-button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.7 12.3 21 2M17 6l3 3M14.5 8.5l2 2" />
        </svg>
      </button>
      {open && <YourKeyPanel onClose={() => setOpen(false)} />}
    </>
  );
};

export default YourKey;
