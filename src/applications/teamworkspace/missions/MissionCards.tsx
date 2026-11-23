/**
 * The missions received, as cards that lead with what each asks (decision D-MF, MF1): the objective as the
 * headline, why it matters, the place, the end, the effort and the steps, and one clear action. Who it is from
 * folds into a line at its foot, framed against the key that signed it (BD25). What closes soonest comes
 * first, then what can be done now; the closed are kept behind a button.
 *
 * Only a package marked Public is drawn (MF6): Archangel Agency's and Archangel Knights' internal missions do not
 * belong in Starcom. One that is not is counted, never shown, so the card needs no distribution chip.
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import { isGrantNotice, missionCardOf, sortMissionCards, type MissionCard } from '../../../services/intel/received/missionCard';
import { effortText, endsText, placeText } from './missionWords';
import ProvenanceFrame from '../../../components/Shared/ProvenanceFrame';
import KeyName from '../../../components/Identity/KeyName';
import { packageProvenance } from '../../../services/intel/provenance/provenance';
import { isOwnKey, keysNamed, nameOf, subscribeNames } from '../../../services/identity/names';
import { verifySigners } from '../../../services/identity/signerProfiles';
import { takenMissions } from '../../../services/intel/received/takenMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import { localTitleIn, utcDateTimeIn } from '../../../i18n/app/dates';

const STEPS_SHOWN = 3;





const MissionCardView: React.FC<{ card: MissionCard; now: number; claims: number; onOpen: (pkg: AcceptedPackage) => void }> = ({ card, now, claims, onOpen }) => {
  const { lang, m } = useMessages();
  const t = m.missionParts.cards;
  const manifest = card.pkg.check.manifest;
  // The time the publisher states, as the rows said it (the receiver records no arrival time).
  const statedMs = manifest?.createdAt ? Date.parse(manifest.createdAt) : NaN;
  const stated = !manifest?.createdAt
    ? { text: m.missionParts.notStated.time }
    : Number.isFinite(statedMs)
      ? { text: fill(m.missionParts.stated, { when: utcDateTimeIn(lang, statedMs, true) }), title: localTitleIn(lang, statedMs, m.time.local) }
      : { text: m.missionParts.notStated.readableTime };
  const ends = card.closesAt !== undefined ? endsText(card.closesAt, now, lang, t) : undefined;
  const signer = nameOf(card.pkg.event.pubkey);
  const verifiedDomain = signer?.source === 'nip05' ? signer.domain : undefined;
  const effort = card.effortMinutes ? effortText(card.effortMinutes, lang, m, t) : undefined;

  return (
    <Paper
      variant="outlined"
      component="article"
      data-testid="received-package-row"
      data-open={card.open}
      sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, opacity: card.open ? 1 : 0.72 }}
    >
      {/* Three lines at most: a mission line can name fifteen forecast areas. The whole of it is its hover. */}
      <Typography
        variant="subtitle1"
        component="h3"
        title={card.headline || undefined}
        sx={{ fontWeight: 600, lineHeight: 1.3, color: 'var(--sc-text-heading)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {card.headline || m.missionParts.notStated.name}
      </Typography>
      {card.subject && <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>{card.subject}</Typography>}
      {card.stakes && <Typography variant="body2" component="p" sx={{ m: 0 }} data-testid="mission-card-stakes">{card.stakes}</Typography>}

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap data-testid="mission-card-facts">
        {!card.open && <Chip size="small" label={t.closed} />}
        {takenMissions.isTaken(card.key) && <Chip size="small" color="success" label={m.missionParts.taking.chip} data-testid="mission-card-taken" />}
        {card.place && <Chip size="small" variant="outlined" label={placeText(card.place, lang, t)} data-testid="mission-card-place" />}
        {ends && <Chip size="small" variant={ends.soon ? 'filled' : 'outlined'} color={ends.soon ? 'warning' : 'default'} label={ends.text} data-testid="mission-card-ends" />}
        {effort && <Chip size="small" variant="outlined" label={effort} data-testid="mission-card-effort" />}
        {card.where && <Chip size="small" variant="outlined" label={card.where === 'field' ? t.field : t.desk} />}
        {card.quickWin && <Chip size="small" variant="outlined" color="success" label={t.quickWin} />}
        {/* Who has publicly taken it up, as NavCom labels it (D-MX, MX1): a mission others are on. */}
        {claims > 0 && <Chip size="small" variant="outlined" color="primary" label={counted(m.missionParts.publicClaims, claims, {}, lang)} data-testid="mission-card-claims" />}
      </Stack>

      {card.steps.length > 0 && (
        <Box>
          <Typography variant="overline" component="h4" sx={{ lineHeight: 1.6, display: 'block' }}>{t.steps}</Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, listStyleType: 'decimal' }} data-testid="mission-card-steps">
            {card.steps.slice(0, STEPS_SHOWN).map((step, i) => <Typography key={i} component="li" variant="body2">{step}</Typography>)}
          </Box>
          {card.steps.length > STEPS_SHOWN && (
            <Typography variant="caption" color="text.secondary" component="div">{counted(t.moreSteps, card.steps.length - STEPS_SHOWN, {}, lang)}</Typography>
          )}
        </Box>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 'auto', pt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          {fillNodes(t.from, {
            who: (
              <ProvenanceFrame provenance={packageProvenance({ claims: manifest?.author, signedBy: card.pkg.event.pubkey }, isOwnKey, keysNamed)}>
                <KeyName pubkey={card.pkg.event.pubkey} />
              </ProvenanceFrame>
            ),
            // The domain that lists the key, where one does (MF4): its word, not Starcom's.
            domain: verifiedDomain ? <span data-testid="mission-card-verified">{` ${verifiedDomain}`}</span> : '',
            when: <span title={stated.title}>{stated.text}</span>,
          })}
        </Typography>
        <Button size="small" variant="contained" onClick={() => onOpen(card.pkg)} data-testid="mission-card-open">{t.seeWhatToDo}</Button>
      </Stack>
    </Paper>
  );
};

export const MissionCards: React.FC<{
  accepted: readonly AcceptedPackage[];
  onOpen: (pkg: AcceptedPackage) => void;
  /** How many have publicly taken each up, as NavCom labels it. */
  claimsOf?: (pkg: AcceptedPackage) => number;
  /** Packages that could not be verified, and what to show for them when asked. */
  unverified?: { count: number; list: React.ReactNode };
  now?: number;
}> = ({ accepted, onOpen, claimsOf, unverified, now = Date.now() }) => {
  const { lang, m } = useMessages();
  const t = m.missionParts.cards;
  const [showClosed, setShowClosed] = useState(false);
  const [showUnverified, setShowUnverified] = useState(false);
  // A taken mission is marked on its card (D-MF, MF7).
  useTakenMissions();
  const router = useContext(EnhancedApplicationRouterContext);
  // Who posted each, read from the posts (MF4): every signer asked after once a session; a name redraws the cards.
  const [, setNamesVersion] = useState(0);
  useEffect(() => subscribeNames(() => setNamesVersion((n) => n + 1)), []);
  useEffect(() => { void verifySigners(accepted.map((p) => p.event.pubkey)); }, [accepted]);
  const publicOnes = useMemo(() => accepted.filter((p) => p.check.manifest?.visibility === 'public'), [accepted]);
  const notPublic = accepted.length - publicOnes.length;
  // Grants are not missions (MF5): counted while open, and found in the Market Exchange's Grants tab.
  const openGrants = useMemo(() => publicOnes.filter((p) => isGrantNotice(p) && missionCardOf(p).open).length, [publicOnes]);
  const cards = useMemo(() => sortMissionCards(publicOnes.filter((p) => !isGrantNotice(p)).map(missionCardOf), now), [publicOnes, now]);
  const open = cards.filter((c) => c.open);
  const closed = cards.filter((c) => !c.open);
  const shown = showClosed ? cards : open;
  const summary = [
    counted(t.open, open.length, {}, lang),
    counted(t.atDesk, open.filter((c) => c.where === 'desk').length, {}, lang),
    counted(t.inField, open.filter((c) => c.where === 'field').length, {}, lang),
  ].join(' · ');

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }} data-testid="received-packages">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{summary}</Typography>
        {closed.length > 0 && (
          <Button size="small" onClick={() => setShowClosed((s) => !s)} aria-pressed={showClosed} data-testid="mission-cards-closed">
            {showClosed ? t.hideClosed : counted(t.showClosed, closed.length, {}, lang)}
          </Button>
        )}
        {openGrants > 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="mission-cards-grants">{counted(t.grantNotices, openGrants, {}, lang)}</Typography>
        )}
        {/* Only where the app's router can open the Market Exchange: never a button that does nothing. */}
        {openGrants > 0 && router && (
          <Button size="small" onClick={() => router.navigateToApp('marketexchange', undefined, { openTab: 'grants' })} data-testid="mission-cards-open-grants">
            {t.openGrants}
          </Button>
        )}
        {notPublic > 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="mission-cards-not-public">{counted(t.notPublic, notPublic, {}, lang)}</Typography>
        )}
        {unverified && unverified.count > 0 && (
          <Button size="small" color="warning" onClick={() => setShowUnverified((s) => !s)} aria-pressed={showUnverified} data-testid="mission-cards-unverified">
            {counted(t.unverified, unverified.count, {}, lang)}
          </Button>
        )}
      </Stack>
      {showUnverified && unverified?.list}
      {shown.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }} data-testid="mission-cards">
          {shown.map((card) => <MissionCardView key={card.key} card={card} now={now} claims={claimsOf?.(card.pkg) ?? 0} onOpen={onOpen} />)}
        </Box>
      )}
    </Box>
  );
};

export default MissionCards;
