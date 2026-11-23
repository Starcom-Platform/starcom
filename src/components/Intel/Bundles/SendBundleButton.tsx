import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography,
} from '@mui/material';
import { Send } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { reviewBundleSend } from '../../../services/publishing/bundles';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import type { BundleSubjectType } from '../../../services/exchange/bundle';
import { bundleRefusal } from '../../../services/intel/bundles/bundleDistribution';
import type { InformationVisibility } from '../../../types/intel/IntelItemUI';
import KeyName from '../../Identity/KeyName';
import WhatIs from '../../Help/WhatIs';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import DistributionChoice from '../../Shared/DistributionChoice';

const HEX_KEY = /^[0-9a-f]{64}$/;

/** A key from what a person pastes: an npub, or 64 hex characters. */
function keyFrom(text: string): string | null {
  const t = text.trim();
  if (HEX_KEY.test(t)) return t;
  try {
    const decoded = nip19.decode(t);
    return decoded.type === 'npub' ? decoded.data : null;
  } catch {
    return null;
  }
}

/**
 * "Send to…" (plan item 2.4): the case or mission, sealed to each person
 * chosen and sent over the relays you share, after the publish review shows
 * what goes, to whom and where. People come from your teams' rosters and the
 * record's collaborators, or an npub pasted in.
 *
 * Its distribution decides whether it goes (plan item 9.13, decision G8): a
 * Private one stays here, and says so; one nobody has decided on is asked
 * about first, and the choice is kept on the record.
 */
const SendBundleButton: React.FC<{
  subject: { type: BundleSubjectType; id: string };
  people?: string[];
  /** The case's or mission's distribution: undefined until someone chooses. */
  distribution: InformationVisibility | undefined;
  /** Keeps a choice on the record. Rejects, in words, when it could not. */
  onChooseDistribution?: (visibility: InformationVisibility) => Promise<void>;
  /** Why it cannot be chosen here, and what to do instead: a locked mission. */
  distributionLocked?: string | null;
}> = ({ subject, people = [], distribution, onChooseDistribution, distributionLocked }) => {
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [choiceFailed, setChoiceFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const { m: { bundles: t, reasons } } = useMessages();
  const [said, setSaid] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const me = nostrIdentityService.signerPubkey();
  const known = useMemo(() => {
    const roster = realTimeTeamService.getTeams().flatMap((t) => t.members.map((m) => m.pubkey ?? ''));
    return [...new Set([...roster, ...people])].filter((k) => HEX_KEY.test(k) && k !== me);
  }, [people, me, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const staysHere = distribution === 'private' ? bundleRefusal(subject.type, distribution, reasons) : null;
  const asking = distribution === undefined;
  const choose = async (visibility: InformationVisibility) => {
    if (!onChooseDistribution) return;
    setChoosing(true);
    setChoiceFailed(null);
    try {
      await onChooseDistribution(visibility);
    } catch (e) {
      setChoiceFailed(fill(t.notSaved, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setChoosing(false);
    }
  };

  const pastedKey = keyFrom(pasted);
  const toggle = (key: string) => setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const send = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const outcome = await reviewBundleSend(subject, chosen);
      if (outcome.status === 'sent') {
        const { reached, notReached } = outcome.result;
        setSaid(notReached.length === 0
          ? { severity: 'success', text: counted(t.sent, reached.length) }
          : { severity: 'warning', text: fill(t.sentPartly, { reached: reached.length, missed: notReached.length, reasons: notReached.map((n) => n.reason).join('; ') }) });
      } else if (outcome.status === 'refused') {
        setSaid({ severity: 'error', text: outcome.reason });
      }
    } catch (e) {
      setSaid({ severity: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="small" startIcon={<Send size={16} />} onClick={() => { setOpen(true); setSaid(null); setChoiceFailed(null); }} data-testid="send-bundle">
        {t.sendButton}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth data-testid="send-bundle-dialog">
        <DialogTitle>{t.sendTitle[subject.type]} <WhatIs term="bundle" /></DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {staysHere && <Alert severity="info" data-testid="send-bundle-stays">{staysHere}</Alert>}
            {asking && (
              <Stack spacing={1} data-testid="send-bundle-ask">
                <Typography variant="body2">{bundleRefusal(subject.type, undefined, reasons)}</Typography>
                <DistributionChoice
                  what={subject.type}
                  value={undefined}
                  onChange={(visibility) => void choose(visibility)}
                  disabled={choosing}
                  lockedBecause={distributionLocked ?? (onChooseDistribution ? null : t.chooseWhereEdited[subject.type])}
                  testId="send-bundle-distribution"
                />
              </Stack>
            )}
            {choiceFailed && <Alert severity="error" role="alert">{choiceFailed}</Alert>}
            {!staysHere && !asking && (
              <>
                <Typography variant="body2" color="text.secondary">{t.sealedNote}</Typography>
                {known.length === 0 && (
                  <Typography variant="body2" color="text.secondary">{t.nobodyKnown[subject.type]}</Typography>
                )}
                <Box>
                  {known.map((key) => (
                    <FormControlLabel
                      key={key}
                      sx={{ display: 'flex' }}
                      control={<Checkbox size="small" checked={chosen.includes(key)} onChange={() => toggle(key)} />}
                      label={<KeyName pubkey={key} showKey />}
                      data-testid={`send-to-${key}`}
                    />
                  ))}
                  {chosen.filter((k) => !known.includes(k)).map((key) => (
                    <FormControlLabel key={key} sx={{ display: 'flex' }} control={<Checkbox size="small" checked onChange={() => toggle(key)} />} label={<KeyName pubkey={key} showKey />} />
                  ))}
                </Box>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    label={t.someoneElse}
                    placeholder="npub1…"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    size="small"
                    fullWidth
                    error={pasted.trim() !== '' && !pastedKey}
                    helperText={pasted.trim().startsWith('nsec1')
                      ? t.secretPasted
                      : pasted.trim() !== '' && !pastedKey ? t.notNpub : ' '}
                  />
                  <Button
                    variant="outlined"
                    disabled={!pastedKey}
                    onClick={() => { if (pastedKey && !chosen.includes(pastedKey)) setChosen((c) => [...c, pastedKey]); setPasted(''); }}
                  >
                    {t.add}
                  </Button>
                </Stack>
                {said && <Alert severity={said.severity} role={said.severity === 'error' ? 'alert' : 'status'} data-testid="send-bundle-result">{said.text}</Alert>}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t.close}</Button>
          {!staysHere && !asking && (
            <Button variant="contained" disabled={busy || chosen.length === 0} onClick={() => void send()}>
              {counted(t.reviewAndSend, chosen.length)}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SendBundleButton;
