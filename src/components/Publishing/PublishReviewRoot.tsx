import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
  ThemeProvider,
} from '@mui/material';
import { starcomTheme } from '../../styles/starcomTheme';
import {
  subscribeReview, decideReview,
  type PendingReview, type DestinationKind, type HighlightKind,
} from '../../services/publishing/publishReview';
import { REACH_WORDS } from '../../services/nostr/publishTargets';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { recordKeyBackedUp } from '../../services/identity/identityNotice';
import KeyName from '../Identity/KeyName';
import WhatIs from '../Help/WhatIs';

/**
 * Shows the publish review on screen now, if any (plan item 0.1).
 *
 * Mounted once, app-wide, beside IdentityNoticeRoot: a publish can start from
 * any screen, and from code that is not a component at all. Everything shown is
 * what the review rendered from the frozen payload; this component never sees
 * the payload itself.
 *
 * Enter never publishes. Cancel holds the focus, and the confirm button names
 * the act and where it goes, so the one click that sends says what it sends.
 */

// Dark, because it opens over dark screens; the app-wide interface (plan Phase 8)
// replaces this with shared tokens.
// The root theme (plan items 8.1 and 8.2); it built its own copy of the palette.
const reviewTheme = starcomTheme;

// The relay words are the app's one wording (REACH_WORDS); IPFS is the review's own.
const WHERE: Record<DestinationKind, string> = {
  ...REACH_WORDS,
  ipfs: 'IPFS: public and content-addressed; anyone holding the address can fetch it',
};

// A message sealed to one key (NIP-59): the relay is public, what it holds is not.
const SEALED_WHERE = 'Public relay: it holds the message sealed, for good; only the key it is sealed to can open it';

const MISSABLE: Record<HighlightKind, string> = {
  coordinates: 'Coordinates',
  address: 'A street address',
  email: 'An email address',
  phone: 'A phone number',
  'long-number': 'A long number',
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', lineHeight: 1.6 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

/**
 * The key, kept before the first publish. A prompt, not a gate: publishing is
 * not held hostage to it, but a key that exists only in this browser is one
 * cleared cache from losing the identity every publication is signed with.
 */
const BackupPrompt: React.FC = () => {
  const [nsec, setNsec] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reveal = async () => {
    try {
      // A locked key asks for its passphrase first (D-KL).
      setNsec(await nostrIdentityService.exportNsecUnlocking());
      recordKeyBackedUp();
    } catch {
      setNsec(null);
    }
  };
  return (
    <Alert severity="info" sx={{ mb: 2 }} data-testid="publish-review-backup">
      Your key lives only in this browser. Clear it, and the identity this is signed with is gone. Keep a copy first.
      {nsec ? (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" component="p">Anyone who has this can sign as you. It is not a password and cannot be reset.</Typography>
          <Box component="code" data-testid="publish-review-nsec" sx={{ display: 'block', wordBreak: 'break-all', my: 0.5 }}>{nsec}</Box>
          <Button size="small" onClick={() => { void navigator.clipboard?.writeText(nsec).then(() => setCopied(true)).catch(() => setCopied(false)); }}>
            {copied ? 'Copied' : 'Copy SECRET key — never share'}
          </Button>
        </Box>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          <Button size="small" onClick={() => void reveal()} data-testid="publish-review-reveal">Show the key to back up</Button>
        </Box>
      )}
    </Alert>
  );
};

const ReviewDialog: React.FC<{ review: PendingReview }> = ({ review }) => {
  const [understood, setUnderstood] = useState(false);
  const sending = review.state === 'sending';
  const acknowledgement = review.firstPublish.acknowledgement;
  const cancel = () => { if (!sending) decideReview(review.id, false); };
  const blocked = sending || review.destinations.length === 0 || (acknowledgement !== null && !understood);

  return (
    <Dialog open onClose={cancel} maxWidth="sm" fullWidth aria-labelledby="publish-review-title">
      <Box data-testid="publish-review">
        <DialogTitle id="publish-review-title">{review.act}: check it before it goes</DialogTitle>
        <DialogContent>
          {review.notice && (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="publish-review-notice">{review.notice}</Alert>
          )}
          {acknowledgement && (
            <Box sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'warning.main', borderRadius: 1 }} data-testid="publish-review-acknowledgement">
              <Typography variant="subtitle2" sx={{ color: 'warning.main' }}>{acknowledgement.title}</Typography>
              {acknowledgement.points.map((point) => (
                <Typography key={point} variant="caption" component="p" sx={{ mb: 0.5 }}>{point}</Typography>
              ))}
              <FormControlLabel
                control={<Checkbox size="small" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />}
                label={acknowledgement.confirm}
              />
            </Box>
          )}
          {review.firstPublish.backup && <BackupPrompt />}
          <Section title="Where it goes">
            {review.destinations.length === 0 ? (
              <Typography variant="body2" color="error.main">Nowhere: no destination is set, so nothing can be sent.</Typography>
            ) : (
              <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }} data-testid="publish-review-destinations">
                {review.destinations.map((d) => (
                  <li key={d.address}>
                    <Typography variant="body2" component="span"><code>{d.address}</code> · {review.sealed && d.kind === 'public' ? SEALED_WHERE : WHERE[d.kind]}</Typography>
                    {d.kind === 'internal' && <WhatIs term="internal" />}
                  </li>
                ))}
              </Stack>
            )}
          </Section>

          <Section title="Exactly what goes">
            <Box data-testid="publish-review-content" sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{review.content.title}</Typography>
              {review.content.body && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{review.content.body}</Typography>
              )}
              {review.content.fields.length > 0 && (
                <Box component="dl" sx={{ m: 0, mt: 1.5, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5 }}>
                  {review.content.fields.map((f) => (
                    <React.Fragment key={f.label}>
                      <Typography component="dt" variant="caption" color="text.secondary">{f.label}</Typography>
                      <Typography component="dd" variant="caption" sx={{ m: 0, wordBreak: 'break-word' }}>{f.value}</Typography>
                    </React.Fragment>
                  ))}
                </Box>
              )}
              {review.content.raw && (
                <Box component="details" sx={{ mt: 1.5 }}>
                  <Typography component="summary" variant="caption" sx={{ cursor: 'pointer' }}>Show exactly as sent</Typography>
                  <Box component="pre" data-testid="publish-review-raw"
                    sx={{ m: 0, mt: 1, p: 1, maxHeight: 240, overflow: 'auto', fontSize: 11, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
                    {review.content.raw}
                  </Box>
                </Box>
              )}
            </Box>
          </Section>

          {review.highlights.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }} data-testid="publish-review-highlights">
              Check these before it goes:
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {review.highlights.map((h, i) => (
                  <li key={`${h.kind}-${i}`}>{MISSABLE[h.kind]}: <code>{h.text}</code></li>
                ))}
              </Box>
            </Alert>
          )}

          <Section title="Who signs">
            {/* Who, and which key: here the key itself is the point (plan item 2.1). */}
            <Typography variant="body2" data-testid="publish-review-signer">
              {review.signer ? <KeyName pubkey={review.signer} showKey /> : 'Decided when it is signed'}
            </Typography>
          </Section>

          <Typography variant="caption" color="text.secondary" component="p" data-testid="publish-review-digest" title={review.digest}>
            {review.digestLabel}: {review.digest.slice(0, 16)}…{review.digest.slice(-8)}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={cancel} disabled={sending} data-testid="publish-review-cancel">Cancel</Button>
          <Button
            variant="contained"
            onClick={() => decideReview(review.id, true, { acknowledged: understood })}
            disabled={blocked}
            data-testid="publish-review-confirm"
          >
            {sending ? 'Sending…' : review.confirmLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};

const PublishReviewRoot: React.FC = () => {
  const [review, setReview] = useState<PendingReview | null>(null);
  useEffect(() => subscribeReview(setReview), []);
  if (!review) return null;
  return (
    <ThemeProvider theme={reviewTheme}>
      <ReviewDialog key={review.id} review={review} />
    </ThemeProvider>
  );
};

export default PublishReviewRoot;
