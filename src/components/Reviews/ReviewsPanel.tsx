import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material';
import KeyName from '../Identity/KeyName';
import OnDarkSurface from '../Shared/OnDarkSurface';
import UtcTime from '../Shared/UtcTime';
import { fetchReviews, type ReviewInput, type ReviewReach } from '../../services/reviews/reviewBroadcast';
import { reviewReview } from '../../services/publishing/reviews';
import { provenanceOf } from '../../services/reviews/reviewTargets';
import {
  summarizeReviews, VERDICTS,
  type Provenance, type ReviewSummary, type ReviewTarget, type Verdict,
} from '../../services/reviews/reviewEvents';
import { fill, useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';

/** Whose it is, after the name: nothing more for your own, whose name already says "you". */
const whose = (t: Messages['reviews'], provenance: Provenance) => (provenance === 'you' ? '' : `, ${t.who[provenance]}`);

/**
 * The reviews on a published item (plan item 5.1): each reviewer's latest
 * verdict with whether they said what they checked, and the comments, each
 * with whose it is. Provenance, never a score. Adding one asks who may
 * receive it, with nothing chosen (decision D2), and goes through the publish
 * review like everything else.
 */
const ReviewsPanel: React.FC<{
  target: ReviewTarget;
  itemTitle: string;
  testId?: string;
  /** Drawn on a dark panel that no dark theme covers. */
  onDark?: boolean;
}> = ({ target, itemTitle, testId, onDark }) => {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<'comment' | Verdict>('comment');
  const [text, setText] = useState('');
  const [reach, setReach] = useState<ReviewReach | ''>('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { m: { reviews: t, shared } } = useMessages();

  /*
   * The item, by its address and version: a target handed in afresh for the
   * same item is the same item, and asks the relays nothing again. Keyed on
   * the object, every parent render queried the relays anew.
   */
  const targetKey = `${target.kind}|${target.coordinate ?? ''}|${target.eventId}`;
  const targetRef = useRef(target);
  targetRef.current = target;
  // Each read is numbered, and only the latest may write: an answer about an
  // item no longer shown, arriving late, showed its reviews under the new one.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    const item = targetRef.current;
    try {
      const reviews = await fetchReviews(item);
      if (mine !== generation.current) return;
      setSummary(summarizeReviews(item, reviews, provenanceOf));
      setFailed(false);
    } catch {
      if (mine === generation.current) setFailed(true);
    }
  }, []);
  useEffect(() => {
    // Another item: nothing of the last one stays, its reviews or a draft about it.
    setSummary(null);
    setFailed(false);
    setKind('comment');
    setText('');
    setReach('');
    setNote(null);
    void load();
  }, [targetKey, load]);

  const input: ReviewInput = kind === 'comment' ? { type: 'comment', text } : { type: 'verdict', verdict: kind, reasoning: text };
  const ready = Boolean(reach) && !sending && (kind !== 'comment' || text.trim().length > 0);

  const send = async () => {
    if (!reach) return;
    setSending(true);
    setNote(null);
    try {
      const outcome = await reviewReview(targetRef.current, itemTitle, input, reach);
      if (outcome.status === 'sent' && outcome.result.relaysOk === 0) {
        // Nothing went out: what was written stays, to send again.
        setNote(fill(t.noRelay, { n: outcome.result.relaysTried }));
      } else if (outcome.status === 'sent') {
        setText('');
        setNote(fill(t.sentTo, { ok: outcome.result.relaysOk, tried: outcome.result.relaysTried }));
        await load();
      } else if (outcome.status === 'refused') {
        setNote(outcome.reason);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : t.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const verdictGroups = summary ? VERDICTS.filter((v) => summary.verdicts[v].length > 0) : [];
  const nothing = summary && verdictGroups.length === 0 && summary.comments.length === 0;

  const panel = (
    <Box data-testid={testId}>
      <Typography variant="subtitle2" gutterBottom>{t.heading}</Typography>
      {!summary && !failed && <Typography variant="body2" color="text.secondary">{t.reading}</Typography>}
      {failed && <Alert severity="warning">{t.readFailed}</Alert>}
      {nothing && <Typography variant="body2" color="text.secondary">{t.none}</Typography>}
      {verdictGroups.map((verdict) => (
        <Box key={verdict} sx={{ mb: 1 }} data-testid={`verdicts-${verdict}`}>
          <Typography variant="body2" fontWeight="bold">{fill(t.groupHeading[verdict], { n: summary!.verdicts[verdict].length })}</Typography>
          {summary!.verdicts[verdict].map((v) => (
            <Typography key={v.author} variant="body2" component="div" sx={{ pl: 1 }}>
              <KeyName pubkey={v.author} />{whose(t, v.provenance)}:{' '}
              {v.methodStated ? fill(t.quoted, { text: v.reasoning }) : <em>{t.noMethod}</em>}
              {!v.onThisVersion && <em> {t.earlier}</em>}
            </Typography>
          ))}
        </Box>
      ))}
      {summary && summary.comments.length > 0 && (
        <Stack spacing={0.5} sx={{ mb: 1 }} data-testid="review-comments">
          {summary.comments.map((c) => (
            <Typography key={c.id} variant="body2" component="div">
              <KeyName pubkey={c.author} />{whose(t, c.provenance)} · <UtcTime at={c.at * 1000} year />: {c.text}
            </Typography>
          ))}
        </Stack>
      )}

      <Box sx={{ mt: 1.5 }}>
        <FormControl component="fieldset" size="small">
          <FormLabel component="legend">{t.add}</FormLabel>
          <RadioGroup row value={kind} onChange={(e) => setKind(e.target.value as 'comment' | Verdict)}>
            <FormControlLabel value="comment" control={<Radio size="small" />} label={t.comment} />
            {VERDICTS.map((v) => <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={t.verdicts[v]} />)}
          </RadioGroup>
        </FormControl>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label={kind === 'comment' ? t.comment : t.whatChecked}
          helperText={kind === 'comment' ? undefined : t.checkNote}
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ my: 1 }}
        />
        <FormControl component="fieldset" size="small">
          <FormLabel component="legend">{t.whoMay}</FormLabel>
          <RadioGroup value={reach} onChange={(e) => setReach(e.target.value as ReviewReach)}>
            <FormControlLabel value="public" control={<Radio size="small" />} label={shared.distribution.labels.public} />
            <FormControlLabel value="limited" control={<Radio size="small" />} label={shared.distribution.labels.limited} />
          </RadioGroup>
        </FormControl>
        <Box>
          <Button variant="outlined" size="small" disabled={!ready} onClick={() => void send()}>
            {kind === 'comment' ? t.sendComment : t.sendVerdict}
          </Button>
        </Box>
        {note && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>{note}</Typography>}
      </Box>
    </Box>
  );
  return onDark ? <OnDarkSurface>{panel}</OnDarkSurface> : panel;
};

export default ReviewsPanel;
