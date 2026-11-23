import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  heldDeletions, subscribeHeldDeletions, undoDeletion, type HeldDeletion,
} from '../../services/intel/deletionHolding';
import { useModalOpen } from '../../hooks/useModalOpen';
import styles from './UndoDeletionRoot.module.css';

/**
 * The Undo bar (plan item 0.6, stories S14 and S23).
 *
 * Deleting a case, mission or report used to be final the moment the button
 * was pressed: a case row's Delete asked nothing, and a report asked "This
 * cannot be undone" and meant it. Every deletion is now held for ten seconds
 * (services/intel/deletionHolding), and this bar is where a person takes one
 * back. It is mounted once for the whole app because a deletion can start from
 * any screen, and every screen should offer the same way back.
 *
 * The seconds shown are the real time left before the deletion is made final,
 * not decoration: when the count reaches nothing, the protected record's key
 * is deleted and Undo is no longer possible.
 */
const secondsLeft = (item: HeldDeletion, now: number): number =>
  Math.max(0, Math.ceil((item.heldUntil - now) / 1000));

/** Where Ctrl+Z already means something: undoing typing. */
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const onApple = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * One held deletion. What is fixed when the row appears is taken once, then:
 * the drawn line's duration, because an animation whose duration is rewritten
 * on every tick recomputes its progress against the new one and empties long
 * before the time runs out; and the words a screen reader hears, because text
 * that changes inside a live region is announced again each time it changes.
 */
const HeldRow: React.FC<{ item: HeldDeletion; now: number; shortcut: string; onUndo: () => void }> = ({
  item, now, shortcut, onUndo,
}) => {
  const [atFirst] = useState(() => Math.max(0, item.heldUntil - Date.now()));
  return (
    <div className={styles.bar} role="status" data-testid="undo-deletion">
      <span className={styles.what}>
        {item.label} deleted.
        <span className={styles.srOnly}> It can be undone for {Math.ceil(atFirst / 1000)} seconds.</span>
      </span>
      <span className={styles.left} aria-hidden="true">{secondsLeft(item, now)} s</span>
      <button
        type="button"
        className={styles.undo}
        title={`Undo (${shortcut})`}
        aria-keyshortcuts="Control+Z Meta+Z"
        onClick={onUndo}
      >
        Undo
      </button>
      <span className={styles.drain} style={{ animationDuration: `${atFirst}ms` }} aria-hidden="true" />
    </div>
  );
};

const UndoDeletionRoot: React.FC = () => {
  const [held, setHeld] = useState<HeldDeletion[]>(() => heldDeletions());
  const [failure, setFailure] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => subscribeHeldDeletions(setHeld), []);

  // Redrawn each second while something is held. The clock is read when the
  // bar draws, not kept between draws: kept, it was a stale time whenever a
  // new bar appeared, and the first frame showed the wrong count.
  const holding = held.length > 0;
  useEffect(() => {
    if (!holding) return;
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [holding]);
  const now = Date.now();

  // Over a dialog the bar goes to the top: at the foot it covered the
  // dialog's own buttons for as long as it was shown.
  const overDialog = useModalOpen(holding);

  const undo = useCallback(async (item: HeldDeletion) => {
    setFailure(null);
    try {
      await undoDeletion(item.id);
    } catch (e) {
      setFailure(`${item.label} could not be brought back: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  /*
   * Ctrl+Z (⌘Z) takes back the newest deletion. A dialog's focus trap keeps
   * Tab away from this bar, so without it a keyboard could not reach Undo
   * after removing an objective inside the mission dialog. Left alone in a
   * text field, where it already undoes typing.
   */
  useEffect(() => {
    if (!holding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (isEditable(e.target)) return;
      const newest = heldDeletions().at(-1);
      if (!newest) return;
      e.preventDefault();
      void undo(newest);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [holding, undo]);

  if (!holding && !failure) return null;

  const shortcut = onApple() ? '⌘Z' : 'Ctrl+Z';

  /*
   * Through a portal to <body>, for the reason IdentityNoticeRoot gives: an
   * ancestor with a transform becomes the containing block of anything fixed
   * inside it, and the bar would be placed against that instead of the screen.
   */
  return createPortal((
    <div className={styles.stack} data-placement={overDialog ? 'top' : 'bottom'} data-testid="undo-deletions">
      {held.map((item) => (
        <HeldRow key={item.id} item={item} now={now} shortcut={shortcut} onUndo={() => { void undo(item); }} />
      ))}
      {failure && (
        <div className={`${styles.bar} ${styles.failed}`} role="alert" data-testid="undo-failure">
          <span className={styles.what}>{failure}</span>
          <button type="button" className={styles.dismiss} onClick={() => setFailure(null)}>Dismiss</button>
        </div>
      )}
    </div>
  ), document.body);
};

export default UndoDeletionRoot;
