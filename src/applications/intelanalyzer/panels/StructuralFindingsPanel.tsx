import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton, Tooltip } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { loadStructuralFindings } from '../../../services/intel/structural/registerSource';
import { loadControlFindings } from '../../../services/intel/structural/pscSource';
import { loadLeiCoverageFindings } from '../../../services/intel/structural/leiCoverageSource';
import { reviewAttestation } from '../../../services/publishing/findings';
import { useWaitingFindings, claimsSlot, withOutbox } from '../../../services/intel/outbox/waitingFindings';
import { uncheckableCount } from '../../../services/epistemic/epistemicLanguage';
import { explainAttestationWeight } from '../../../services/intel/findings/deriveAttestationWeight';
import type { FindingAttestation } from '../../../services/intel/findings/attestation';

/**
 * Render a claim's value for a human.
 *
 * `String(value)` is wrong here and shipped as "[object Object] companies": a
 * batch claim's value is `{ date, count }`, not a number. The claim model
 * deliberately types `value` as `unknown` because what a claim asserts varies,
 * which means every renderer has to decide — and a renderer that assumes
 * scalar produces text that is not merely ugly but states nothing.
 */
const describeValue = (f: FindingAttestation): string => {
  const v = f.claim.value;
  if (typeof v === 'number' || typeof v === 'string') return `${v} companies`;
  if (v && typeof v === 'object' && 'count' in v && 'date' in v) {
    const { count, date } = v as { count: number; date: string };
    return `${count} companies on ${date}`;
  }
  if (v && typeof v === 'object' && 'count' in v && 'jurisdictions' in v) {
    const { count, jurisdictions } = v as { count: number; jurisdictions: string[] };
    return `${count} with parents in ${jurisdictions.join(', ')}`;
  }
  // Unknown shape: say so rather than render something that looks like data.
  return 'unrecognised claim value';
};

type PublishState = 'idle' | 'publishing' | 'success' | 'queued' | 'error' | 'refused';

/**
 * How many findings this panel will render.
 *
 * An output bound, and one that MUST be stated when it bites. The PSC register
 * yields 9,591 corporate controllers of ten or more companies, and a list that
 * long is not a list. Rendering the first N silently would make a truncated
 * view indistinguishable from a complete one — the same failure the globe
 * layer's `truncated` field exists to prevent.
 */
/**
 * Whether this census says what it counted.
 *
 * Conditionally required rather than always: only `matchedBy: 'enumeration'`
 * needs a boundary, which is why ForeignFindingStore checks it separately from
 * REQUIRED_FIELDS and rejects on its absence.
 */
const boundaryStated = (f: FindingAttestation): boolean =>
  typeof f.method.enumeratedBoundary === 'string' && f.method.enumeratedBoundary.trim().length > 0;

const DISPLAY_LIMIT = 50;

/**
 * Structural findings — counts from a complete register, not corroborations.
 *
 * A separate panel rather than more rows in FindingsPanel, because these are a
 * different kind of claim and the difference is the interesting part. A
 * corroborated finding is strong when several independent sources agree; this
 * one is strong when a single authoritative register was counted completely.
 * Showing "1 source" next to "3 sources" in one list would invite exactly the
 * comparison that does not hold.
 *
 * The weight shown is DERIVED here from the published method, never read from
 * the payload — same rule as everywhere else.
 */
const StructuralFindingsPanel: React.FC = () => {
  const [findings, setFindings] = useState<FindingAttestation[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [expanded, setExpanded] = useState(false);
  const [publishState, setPublishState] = useState<Record<string, PublishState>>({});
  // What the outbox holds, so "Queued" survives a reload (plan item 9.4).
  const waitingFor = useWaitingFindings();
  const [refusalReason, setRefusalReason] = useState<Record<string, string>>({});

  /**
   * Fetched on first expand, never on mount.
   *
   * The two committed registers are ~9MB of JSON together, and loading them
   * eagerly made every visitor pay for an analysis most will never open — a
   * cost the bundle budget cannot see, because it measures the entry script
   * graph and these are runtime fetches.
   */
  const started = useRef(false);
  useEffect(() => {
    if (!expanded || started.current) return;
    /**
     * The "already started" flag is a ref, NOT the loadState it mirrors.
     *
     * With `loadState` in the dependency array, setting it to 'loading'
     * re-ran this effect immediately, which fired the previous run's cleanup
     * and set `live = false` before the fetch resolved. The panel then sat on
     * "Reading the committed registers…" forever. A ref does not participate
     * in the dependency array, so the guard cannot cancel the work it guards.
     */
    started.current = true;
    let live = true;
    setLoadState('loading');
    // Both assets, independently: one being absent or refused must not
    // suppress the other, so this settles rather than races.
    Promise.allSettled([loadStructuralFindings(), loadControlFindings(), loadLeiCoverageFindings()])
      .then(rs => {
        if (!live) return;
        setFindings(rs.flatMap(r => (r.status === 'fulfilled' ? r.value : [])));
        setLoadState('loaded');
      })
      // The loaders already refuse rather than throw on a bad asset; this
      // catch is for the unexpected, and must not leave the panel looking as
      // though the registers were read and found empty.
      .catch(() => { if (live) { setFindings([]); setLoadState('loaded'); } });
    return () => { live = false; };
  }, [expanded]);

  /**
   * WEIGHT IS NOT SALIENCE, and ordering by it here was actively misleading.
   *
   * Weight answers "how much should you trust this claim". Every one of these
   * is a complete census of an authoritative register, so they are all equally
   * trustworthy — measured, 10,514 findings have TWO distinct weights between
   * them, differing only because two registers were snapshotted three weeks
   * apart. Ordering by that sorts by snapshot date and nothing else.
   *
   * What it cost: the fifty "highest-weight" findings were fifty Norwegian
   * addresses whose largest census was 660, while the largest in the corpus —
   * 86,035 companies at one London address — was hidden, because Companies
   * House had been snapshotted three weeks earlier. The single most
   * significant finding lost to a date.
   *
   * So salience is computed here, by the consumer, from published facts. It is
   * deliberately NOT published: a salience travelling with a claim would be the
   * author asserting their own importance, which is the same failure as a
   * declared confidence wearing a different hat.
   *
   * Magnitudes are not comparable across claim shapes — 86,035 companies at an
   * address and 17 foreign-parented holders are both large for what they are —
   * so findings are ranked within their own attribute and the surface shows
   * the strongest of each kind rather than one kind crowding out the rest.
   */
  const magnitudeOf = (f: FindingAttestation): number => {
    const v = f.claim.value;
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && 'count' in v) return Number((v as { count: number }).count) || 0;
    return 0;
  };

  const byAttribute = new Map<string, FindingAttestation[]>();
  for (const f of findings) {
    const k = f.claim.attribute;
    (byAttribute.get(k) ?? byAttribute.set(k, []).get(k)!).push(f);
  }
  const perKind = Math.max(1, Math.floor(DISPLAY_LIMIT / Math.max(1, byAttribute.size)));
  const shown = [...byAttribute.values()]
    .flatMap(group => [...group]
      // Weight still filters and breaks ties — a stale claim should lose to a
      // fresh one of the same size — but it no longer decides the order.
      .sort((a, b) => magnitudeOf(b) - magnitudeOf(a)
        || explainAttestationWeight(b).weight - explainAttestationWeight(a).weight)
      .slice(0, perKind))
    .sort((a, b) => magnitudeOf(b) - magnitudeOf(a));
  const ordered = findings;
  const hidden = ordered.length - shown.length;

  const keyFor = (f: FindingAttestation) => `${f.claim.subjectRef}||${f.claim.attribute}`;

  const handlePublish = async (finding: FindingAttestation) => {
    const key = keyFor(finding);
    setPublishState(prev => ({ ...prev, [key]: 'publishing' }));
    try {
      // Real register data, not a demo fixture — so isMock is false as a fact
      // about the source, established at the loader, not as a caller's opinion.
      // Through the publish review (plan item 0.1).
      const result = await reviewAttestation(finding, { isMock: false });
      if (!result) {
        setPublishState(prev => { const next = { ...prev }; delete next[key]; return next; });
        return;
      }
      if (result.refused) {
        setRefusalReason(prev => ({ ...prev, [key]: result.refused!.reason }));
        setPublishState(prev => ({ ...prev, [key]: 'refused' }));
        return;
      }
      setPublishState(prev => ({
        ...prev,
        [key]: result.broadcast.success ? 'success' : result.queued ? 'queued' : 'error',
      }));
    } catch {
      setPublishState(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  return (
    <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#00bfff', flex: 1 }}>
          Register structure
        </Typography>
        <Chip
          label={loadState === 'loaded' ? findings.length : '—'}
          size="small"
          sx={{ backgroundColor: 'rgba(0, 255, 65, 0.2)', color: '#00ff41', border: '1px solid rgba(0, 255, 65, 0.3)' }}
        />
        <IconButton size="small" aria-label={expanded ? 'Collapse structural findings' : 'Expand structural findings'} sx={{ color: '#00bfff' }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Stack>
      {/* Said once, at the top, rather than left for the reader to infer from
          a large number. The largest clusters are almost always formation
          agents and virtual-office providers serving ordinary businesses. */}
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.5 }}>
        Counts from complete registers: companies sharing a registered office, same-day
        incorporation batches, and corporate control declared to the PSC register. Filing
        facts, not evidence of wrongdoing. Individuals are never counted — the register
        does not identify people stably enough to do it honestly.
      </Typography>
      <Collapse in={expanded}>
        {/* Three distinct states, said as three different things. "Not loaded
            yet", "loaded and empty" and "loaded with results" render the same
            blank box if you let them, and a reader cannot tell an unread
            register from an empty one. */}
        {loadState === 'loading' && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 1 }}>
            Reading the public records this panel checks…
          </Typography>
        )}
        {loadState === 'loaded' && ordered.length === 0 && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 1 }}>
            No structural findings: the records did not load, or a set was refused for not
            covering its whole area.
          </Typography>
        )}
        <Stack spacing={1} sx={{ mt: 1 }}>
          {shown.map(f => {
            const key = keyFor(f);
            const state = withOutbox(publishState[key], waitingFor(claimsSlot(f.claim.subjectRef, f.claim.attribute)));
            const w = explainAttestationWeight(f);
            return (
              <Box
                key={key}
                sx={{ p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1, border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                  <strong>{describeValue(f)}</strong> — {f.claim.subjectRef}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Tooltip title={f.method.enumeratedBoundary ?? uncheckableCount().text}>
                    <Chip
                      label={`weight ${w.weight.toFixed(2)} · complete enumeration`}
                      size="small"
                      sx={{ backgroundColor: 'rgba(0, 191, 255, 0.15)', color: '#00bfff', fontSize: '0.7rem' }}
                    />
                  </Tooltip>
                  <Chip
                    label={
                      f.claim.attribute === 'largestSameDayIncorporationBatch' ? 'same-day batch'
                        : f.claim.attribute === 'companiesControlledAsCorporatePsc' ? 'corporate control'
                          : f.claim.attribute === 'companiesHoldingLeiAtRegisteredAddress' ? 'LEI coverage'
                            : f.claim.attribute === 'foreignParentedLeiHoldersAtRegisteredAddress' ? 'foreign parentage'
                              : 'shared address'
                    }
                    size="small"
                    sx={{ backgroundColor: 'rgba(160, 160, 255, 0.15)', color: '#a0a0ff', fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`snapshot ${f.method.observedTo.slice(0, 10)}`}
                    size="small"
                    sx={{ backgroundColor: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', fontSize: '0.7rem' }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    color={state === 'success' ? 'success' : state === 'error' || state === 'refused' ? 'error' : state === 'queued' ? 'warning' : 'primary'}
                    /**
                     * An enumeration with no boundary is REJECTED on receipt by
                     * every conforming node, so offering the button and
                     * reporting "Refused" afterwards teaches an operator that
                     * the control is unreliable rather than that their claim
                     * cannot be checked by anyone.
                     */
                    disabled={state === 'publishing' || state === 'success' || !boundaryStated(f)}
                    onClick={() => handlePublish(f)}
                    sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                  >
                    {state === 'publishing' ? 'Publishing…' : state === 'success' ? 'Published' : state === 'queued' ? 'Queued — not yet public' : state === 'refused' ? 'Refused' : state === 'error' ? 'Retry' : 'Publish Finding'}
                  </Button>
                </Stack>
                {!boundaryStated(f) && (
                  <Typography variant="caption" sx={{ color: '#ffaa00', display: 'block', mt: 0.5 }}>
                    {uncheckableCount().text}
                  </Typography>
                )}
                {state === 'refused' && refusalReason[key] && (
                  <Typography variant="caption" sx={{ color: '#ff8a80', display: 'block', mt: 0.5 }}>
                    {refusalReason[key]}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
        {/* Said plainly. A shorter list that does not admit it is shorter is a
            false claim about how much was found, not merely a tidier view. */}
        {hidden > 0 && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 1 }}>
            Showing the {shown.length} largest of {ordered.length} findings, up to {perKind} of each
            kind; {hidden} not shown. Ranked by size, not weight: each is a complete count from an
            authoritative register, and weight cannot tell them apart. Every finding is in the published asset.
          </Typography>
        )}
      </Collapse>
    </Box>
  );
};

export default StructuralFindingsPanel;
