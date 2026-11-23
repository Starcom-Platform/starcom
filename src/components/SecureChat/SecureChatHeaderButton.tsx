import React from 'react';
import { Glyph } from '../../symbols/Glyph';
import { useSecureChat } from '../../communication/context/useSecureChat';
import { chatConnection } from './chatConnection';
import { openSecureChatContacts } from './secureChatEvents';
import { useUnreadCount } from '../../services/chat/chatUnread';
import styles from './SecureChatHeaderButton.module.css';
import { fill, useMessages } from '../../i18n/app/i18n';

/**
 * The secure chat's button, in the header beside the comms icons (decision D-F,
 * step 3.2).
 *
 * It was a bubble docked in the screen's bottom-right corner, with its connection
 * warning a pill docked top-right. On an application screen they sat over SUPPORT
 * OPS and over the strip under the header, and on the globe over the globe. Here the
 * connection is a mark on the button, and its words, which name the chat, are the
 * button's label.
 *
 * Its count is what is unread (plan item 9.12, decision G5). It counted open
 * windows, which says nothing about whether anything new was said.
 */
const SecureChatHeaderButton: React.FC<{ className?: string }> = ({ className }) => {
  const { state } = useSecureChat();
  const { m: { header: { chat: said } } } = useMessages();
  const { level, words } = chatConnection(state.networkStatus, said);
  const unread = useUnreadCount();
  const label = unread > 0 ? fill(said.unread, { label: words, n: unread }) : words;
  const glyph = state.emergencyMode ? 'chat:emergency' : state.stealthMode ? 'chat:stealth' : 'chat:open';

  return (
    <button
      type="button"
      className={`${className ?? ''} ${styles.chatButton}`}
      onClick={() => openSecureChatContacts()}
      aria-label={label}
      title={fill(said.shortcut, { label })}
      disabled={state.emergencyMode}
    >
      <span aria-hidden="true" className={styles.icon}><Glyph name={glyph} size={20} /></span>
      {unread > 0 && <span aria-hidden="true" className={styles.unread} data-testid="chat-unread">{unread}</span>}
      <span aria-hidden="true" className={styles.mark} data-connection={level} />
    </button>
  );
};

export default SecureChatHeaderButton;
