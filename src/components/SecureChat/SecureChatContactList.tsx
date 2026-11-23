import React, { useState, useMemo } from 'react';
import { contactForKey } from '../../communication/contactForKey';
import { nip19 } from 'nostr-tools';
import { useSecureChat } from '../../communication/context/useSecureChat';
import { EarthAllianceContact, ThreatLevel } from '../../types/SecureChat';
import styles from './SecureChatContactList.module.css';
import Modal from '../Shared/Modal';

interface SecureChatContactListProps {
  isVisible: boolean;
  onClose: () => void;
  onContactSelect: (contact: EarthAllianceContact) => void;
}

const SecureChatContactList: React.FC<SecureChatContactListProps> = ({
  isVisible,
  onClose,
  onContactSelect
}) => {
  const { state, addVerifiedContact } = useSecureChat();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'activity'>('name');
  const [filterBy, setFilterBy] = useState<'all' | 'online' | 'verified'>('all');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newPubkey, setNewPubkey] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [addContactBusy, setAddContactBusy] = useState(false);
  const [addContactError, setAddContactError] = useState<string | null>(null);

  // Convert Map to Array for filtering and sorting
  const contacts = useMemo(() => {
    return Array.from(state.verifiedContacts.values());
  }, [state.verifiedContacts]);

  // Filter and sort contacts
  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(contact =>
        contact.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.verifiedIdentity.earthAllianceId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    switch (filterBy) {
      case 'online':
        filtered = filtered.filter(contact => contact.isOnline);
        break;
      case 'verified':
        filtered = filtered.filter(contact => contact.isEarthAllianceVerified);
        break;
      default:
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'activity':
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
        case 'name':
        default:
          return a.displayName.localeCompare(b.displayName);
      }
    });

    return filtered;
  }, [contacts, searchTerm, sortBy, filterBy]);


  const getThreatLevelColor = (level: ThreatLevel) => {
    switch (level) {
      case 'normal': return '#4ade80';
      case 'elevated': return '#facc15';
      case 'high': return '#f97316';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getTimeSince = (date: Date) => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const handleAddContact = async () => {
    const typed = newPubkey.trim();
    const displayName = newDisplayName.trim();
    if (!typed || !displayName || addContactBusy) return;

    // An npub is how other Nostr apps, and this app's own identity panel, hand out
    // a key. Messages are addressed to the hex key, so an npub kept as typed made a
    // contact nobody could ever reach.
    let pubkey = typed;
    if (typed.toLowerCase().startsWith('npub1')) {
      try {
        const decoded = nip19.decode(typed.toLowerCase());
        if (decoded.type !== 'npub') throw new Error(decoded.type);
        pubkey = decoded.data;
      } catch {
        setAddContactError('That is not a valid npub. Check it was copied in full.');
        return;
      }
    }

    // ADD_CONTACT's reducer keys a Map by pubkey — re-adding an existing
    // pubkey would silently overwrite that contact's real accumulated state
    // (trust score, online status, verification history) with this form's
    // fresh defaults, not just create a harmless duplicate.
    if (state.verifiedContacts.has(pubkey)) {
      setAddContactError(`${pubkey} is already a verified contact.`);
      return;
    }

    setAddContactBusy(true);
    setAddContactError(null);
    try {
      // Fields the contact model requires are filled honestly: see contactForKey.
      const contact = contactForKey(pubkey, displayName, { vouched: true });

      const verified = await addVerifiedContact(contact);
      if (!verified) {
        setAddContactError('Contact verification failed — the pubkey could not be verified.');
        return;
      }

      setNewPubkey('');
      setNewDisplayName('');
      setShowAddContact(false);
    } catch (err) {
      // verifyEarthAllianceIdentity (which addVerifiedContact calls) already
      // catches its own errors and resolves false rather than throwing —
      // this is defense in depth, not the expected path, so a future
      // regression there doesn't silently disappear as an unhandled
      // rejection with no visible feedback.
      setAddContactError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setAddContactBusy(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      ariaLabel="Chat contacts"
      className={styles.overlay}
      dismissOnBackdrop
    >
      <div className={styles.contactList} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            <h2>Earth Alliance Contacts</h2>
            <div className={styles.networkStatus}>
              <span 
                className={styles.threatIndicator}
                style={{ color: getThreatLevelColor(state.globalThreatLevel) }}
              >
                🛡️ {state.globalThreatLevel.toUpperCase()}
              </span>
              <span className={styles.contactCount}>
                {filteredContacts.length} of {contacts.length} contacts
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        {/* Search and Filters */}
        <div className={styles.controls}>
          <div className={styles.searchContainer}>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filters}>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as 'all' | 'online' | 'verified')}
              className={styles.filterSelect}
            >
              <option value="all">All Contacts</option>
              <option value="online">Online Only</option>
              <option value="verified">Verified Only</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'activity')}
              className={styles.sortSelect}
            >
              <option value="name">Sort by Name</option>
              <option value="activity">Sort by Activity</option>
            </select>

            <button
              className={styles.addContactButton}
              onClick={() => { setShowAddContact(v => !v); setAddContactError(null); }}
            >
              {showAddContact ? 'Cancel' : '+ Add Contact'}
            </button>
          </div>

          {showAddContact && (
            <div className={styles.addContactForm}>
              <input
                type="text"
                placeholder="Public key (npub or hex)"
                value={newPubkey}
                onChange={(e) => setNewPubkey(e.target.value)}
                className={styles.searchInput}
              />
              <input
                type="text"
                placeholder="Display name"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className={styles.searchInput}
              />
              {addContactError && <div className={styles.addContactError}>{addContactError}</div>}
              <button
                className={styles.addContactSubmit}
                onClick={handleAddContact}
                disabled={addContactBusy || !newPubkey.trim() || !newDisplayName.trim()}
              >
                {addContactBusy ? 'Verifying…' : 'Verify & Add'}
              </button>
            </div>
          )}
        </div>

        {/* Emergency Mode Notice */}
        {state.emergencyMode && (
          <div className={styles.emergencyNotice}>
            🚨 EMERGENCY MODE - Contact communications restricted
          </div>
        )}

        {/* Contacts */}
        <div className={styles.contactsContainer}>
          {filteredContacts.length === 0 ? (
            <div className={styles.emptyState}>
              {searchTerm ? 'No contacts match your search' : 'No contacts available'}
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.pubkey}
                className={`${styles.contactItem} ${contact.isOnline ? styles.online : styles.offline}`}
                onClick={() => onContactSelect(contact)}
              >
                <div className={styles.avatar}>
                  {contact.avatar ? (
                    <img src={contact.avatar} alt={contact.displayName} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {contact.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={`${styles.onlineIndicator} ${contact.isOnline ? styles.indicatorOnline : styles.indicatorOffline}`} />
                </div>

                <div className={styles.contactInfo}>
                  <div className={styles.contactHeader}>
                    <span className={styles.contactName}>{contact.displayName}</span>
                    <div className={styles.badges}>
                      {contact.isEarthAllianceVerified && (
                        <span className={styles.verifiedBadge} title="Earth Alliance Verified">
                          ✓
                        </span>
                      )}
                      {/*
                        * A clearance badge rendered here — "ALPHA" beside a
                        * contact's name, titled "Security Clearance: alpha".
                        * It came from an invented ladder that nothing in the
                        * application ever compared, so the badge asserted a
                        * standing this app cannot grant or check. The
                        * verification tick above it is real and stays.
                        */}
                    </div>
                  </div>
                  
                  <div className={styles.contactDetails}>
                    <span className={styles.earthAllianceId}>
                      ID: {contact.verifiedIdentity.earthAllianceId}
                    </span>
                    <span className={styles.lastSeen}>
                      {contact.isOnline ? 'Online' : `Last seen ${getTimeSince(contact.lastSeen)}`}
                    </span>
                  </div>

                  <div className={styles.securityMetrics}>
                    {/* A trust percentage stood here, the same made-up 60% on
                        everyone added by hand. Starcom scores nobody (refusal
                        R-6): a person is known by their key and by what they
                        signed. */}
                    
                    {/* "PQC: NIST-3" stood here, read from a contact record whose
                        key data is empty. Whether a message is encrypted is shown
                        on the message, from what was sent (plan item 0.2). */}
                  </div>
                </div>

                <div className={styles.contactActions}>
                  {/* This used to render with no onClick at all — it "worked" only
                      by accident, via the row's own onClick bubbling up past it.
                      Explicit now, and stops that propagation so this button's
                      own click doesn't double-fire the row handler. No voice-call
                      capability exists anywhere in this app (text chat only,
                      confirmed repo-wide) — that button was fabricated, removed
                      rather than wired to nothing. */}
                  <button
                    className={styles.chatButton}
                    title={`Message ${contact.displayName}`}
                    disabled={state.emergencyMode}
                    onClick={(e) => { e.stopPropagation(); onContactSelect(contact); }}
                  >
                    💬
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Network Status Footer */}
        <div className={styles.footer}>
          <div className={styles.networkInfo}>
            <span className={styles.relayInfo}>
              📡 {state.networkStatus.relayNodes} relays
            </span>
            <span className={styles.ipfsInfo}>
              🌐 IPFS: {state.networkStatus.ipfsNodes ? 'active' : 'inactive'}
            </span>
            <span className={styles.connectionStatus}>
              {state.networkStatus.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
        </div>
      </div>
        </Modal>
  );
};

export default SecureChatContactList;
