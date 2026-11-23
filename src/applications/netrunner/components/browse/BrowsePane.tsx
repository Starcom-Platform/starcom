/**
 * A real browsing surface inside NetRunner.
 *
 * The view itself is not a DOM element. It is a native WebContentsView the host
 * composites OVER this window, so what React renders here is a hole: an element
 * whose only job is to have a position, which is reported to the host so the
 * view can be laid over it.
 *
 * That arrangement is deliberate rather than convenient. An iframe would put
 * hostile content inside this renderer's process and inside its session, where
 * the sandbox is one attribute away from being wrong. A separate view with its
 * own session partition cannot read this page, cannot see its storage, and
 * holds no capability of its own — the application drives it and it invokes
 * nothing.
 *
 * The cost of the arrangement is that the hole and the view can disagree. Every
 * resize, scroll and layout change has to be pushed to the host, or the view
 * floats over the wrong part of the screen. That synchronisation is most of
 * what this component does.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, TextField, Typography, LinearProgress } from '@mui/material';
import { Globe, X, RefreshCw, AlertTriangle, Camera, ShieldCheck, Boxes } from 'lucide-react';

import { nativeHost, requiresNativeHost, type NativeCapture, type NativeEvidenceIntegrity } from '../../../../services/native/nativeHost';
import { extractEntities } from '../../../../services/intel/extraction/entityExtraction';
import { storeExtractedEntities } from '../../../../services/intel/extraction/storeExtractedEntities';

const ACCENT = '#00f5ff';
const MONO = "var(--sc-font-data)";
const DISPLAY = "var(--sc-font-text)";

interface Observation {
  url: string;
  method: string;
  resourceType: string;
  statusCode?: number;
  thirdParty: boolean;
}

export interface BrowsePaneProps {
  /** Selects the session partition; omitting it yields an amnesic view. */
  investigationId?: string;
  initialUrl?: string;
}

const BrowsePane: React.FC<BrowsePaneProps> = ({ investigationId, initialUrl }) => {
  const host = nativeHost();
  const holeRef = useRef<HTMLDivElement | null>(null);
  const viewIdRef = useRef<string | null>(null);

  const [address, setAddress] = useState(initialUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [observations, setObservations] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<NativeCapture | null>(null);
  const [integrity, setIntegrity] = useState<NativeEvidenceIntegrity | null>(null);
  const [heldRecords, setHeldRecords] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<{ stored: number; byMethod: Record<string, number>; note?: string } | null>(null);
  const [extracting, setExtracting] = useState(false);

  /**
   * Push the hole's position to the host.
   *
   * Read from the live rect every time rather than from React state: the view
   * is composited by the host in window coordinates and has no idea a re-render
   * happened, so anything stale here shows up as a pane hovering over the wrong
   * place.
   */
  const syncBounds = useCallback(() => {
    const element = holeRef.current;
    const viewId = viewIdRef.current;
    if (!host || !element || !viewId) return;
    const rect = element.getBoundingClientRect();
    void host.browse.setBounds({
      viewId,
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      },
    });
  }, [host]);

  useEffect(() => {
    if (!host || !holeRef.current) return;
    const element = holeRef.current;

    const observer = new ResizeObserver(syncBounds);
    observer.observe(element);
    window.addEventListener('resize', syncBounds);
    // Capture phase: a scroll in any ancestor moves the hole, and scroll does
    // not bubble.
    window.addEventListener('scroll', syncBounds, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncBounds);
      window.removeEventListener('scroll', syncBounds, true);
    };
  }, [host, syncBounds]);

  // Closing on unmount is not tidiness. The view is owned by the host and
  // outlives this component; leaving it behind would leave a native pane
  // floating over whatever renders next.
  useEffect(() => {
    return () => {
      const viewId = viewIdRef.current;
      if (host && viewId) void host.browse.close(viewId);
      viewIdRef.current = null;
    };
  }, [host]);

  const go = useCallback(async (raw: string) => {
    if (!host) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setLoading(true);
    setError(null);

    try {
      if (viewIdRef.current === null) {
        const opened = await host.browse.open({ url, investigationId });
        viewIdRef.current = opened.viewId;
        syncBounds();
      } else {
        await host.browse.navigate({ viewId: viewIdRef.current, url });
      }

      const snapshot = await host.browse.snapshot(viewIdRef.current);
      setTitle(snapshot?.title ?? '');
      // A navigation that failed still produced a page; say which happened
      // rather than showing an empty pane and letting the operator guess.
      if (snapshot?.loadError) setError(snapshot.loadError);

      setObservations((await host.browse.observations(viewIdRef.current)) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Navigation failed');
    } finally {
      setLoading(false);
    }
  }, [host, investigationId, syncBounds]);

  const captureNow = useCallback(async () => {
    const viewId = viewIdRef.current;
    if (!host || !viewId) return;
    setIntegrity(null);
    try {
      const result = await host.browse.capture(viewId);
      setCapture(result);
      setHeldRecords((await host.evidence.list()).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed');
    }
  }, [host]);

  /**
   * Re-derive the digests, as a reader would.
   *
   * Deliberately a separate action from capturing. A writer vouching for its
   * own record proves nothing; the check that means something is the one
   * performed before relying on it, by whoever is relying.
   */
  const verifyNow = useCallback(async () => {
    if (!host || !capture) return;
    setIntegrity(await host.evidence.verify(capture.recordId));
  }, [host, capture]);

  /**
   * Read the page into entities a Case can link.
   *
   * Pattern extraction always runs; it needs no model, no runtime and no money,
   * which is the point — the analyst this has to serve may have none of those.
   * The model is asked for as well, and when it is absent that absence is
   * REPORTED rather than folded into an empty result. "We could not look" and
   * "there was nothing there" are different statements about the page.
   */
  const extractNow = useCallback(async () => {
    const viewId = viewIdRef.current;
    if (!host || !viewId) return;
    setExtracting(true);
    setExtraction(null);
    try {
      const snapshot = await host.browse.snapshot(viewId);
      if (!snapshot) return;

      const { entities, modelUnavailable } = await extractEntities(snapshot.text, { useModel: true });
      const stored = await storeExtractedEntities(entities, {
        source: snapshot.url,
        // The page capture this extraction was read from, when one was taken.
        evidenceRecordIds: capture ? [capture.recordId] : [],
      });

      const byMethod: Record<string, number> = {};
      for (const entity of entities) byMethod[entity.method] = (byMethod[entity.method] ?? 0) + 1;

      setExtraction({
        stored: stored.itemIds.length,
        byMethod,
        note: modelUnavailable ?? (stored.failures.length > 0 ? `${stored.failures.length} could not be stored` : undefined),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [host, capture]);

  useEffect(() => {
    if (host && initialUrl) void go(initialUrl);
    // Only on mount: re-running on every `go` identity change would reload the
    // initial URL over whatever the operator navigated to since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!host) {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.5, border: '1px solid #333' }}>
        <AlertTriangle size={16} color="#ff9955" style={{ flexShrink: 0, marginTop: 2 }} />
        <Box>
          <Typography sx={{ color: '#fff', fontFamily: MONO, fontSize: '0.7rem', mb: 0.5 }}>
            {requiresNativeHost('The instrumented browsing pane')}
          </Typography>
          <Typography sx={{ color: '#888', fontFamily: MONO, fontSize: '0.65rem' }}>
            A browser tab cannot run a target in an isolated session. Nor can it read real response
            headers, or see the third parties it contacts. An iframe would do none of those, and would
            put the page inside this one.
          </Typography>
        </Box>
      </Box>
    );
  }

  const thirdParties = new Set(observations.filter((o) => o.thirdParty).map((o) => hostOf(o.url)));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, height: '100%' }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
        <TextField
          label="URL"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void go(address); }}
          size="small"
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              color: '#fff', fontFamily: MONO, fontSize: '0.75rem', borderRadius: 0,
              '& fieldset': { borderColor: '#333' },
              '&.Mui-focused fieldset': { borderColor: ACCENT },
            },
            '& .MuiInputLabel-root': { color: '#888', fontFamily: MONO, fontSize: '0.7rem' },
          }}
        />
        <Button
          onClick={() => void go(address)}
          disabled={loading || address.trim().length === 0}
          startIcon={<Globe size={14} />}
          sx={{
            color: '#000', backgroundColor: ACCENT, borderRadius: 0, fontFamily: DISPLAY,
            fontSize: '0.7rem', letterSpacing: '0.08em',
            '&.Mui-disabled': { backgroundColor: '#222', color: '#666' },
          }}
        >
          GO
        </Button>
        <Button
          onClick={() => { if (viewIdRef.current) void go(address); }}
          disabled={loading || viewIdRef.current === null}
          sx={{ color: '#888', borderRadius: 0, minWidth: 36 }}
          aria-label="reload"
        >
          <RefreshCw size={14} />
        </Button>
        <Button
          onClick={() => void captureNow()}
          disabled={loading || viewIdRef.current === null}
          startIcon={<Camera size={14} />}
          sx={{
            color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 0,
            fontFamily: DISPLAY, fontSize: '0.65rem', letterSpacing: '0.08em',
            '&.Mui-disabled': { color: '#555', borderColor: '#333' },
          }}
        >
          CAPTURE
        </Button>
        <Button
          onClick={() => void extractNow()}
          disabled={extracting || loading || viewIdRef.current === null}
          startIcon={<Boxes size={14} />}
          sx={{
            color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 0,
            fontFamily: DISPLAY, fontSize: '0.65rem', letterSpacing: '0.08em',
            '&.Mui-disabled': { color: '#555', borderColor: '#333' },
          }}
        >
          EXTRACT
        </Button>
        <Button
          onClick={() => {
            const viewId = viewIdRef.current;
            if (viewId) { void host.browse.close(viewId); viewIdRef.current = null; }
            setTitle(''); setObservations([]); setError(null); setCapture(null); setIntegrity(null); setExtraction(null);
          }}
          disabled={viewIdRef.current === null}
          sx={{ color: '#888', borderRadius: 0, minWidth: 36 }}
          aria-label="close view"
        >
          <X size={14} />
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ height: 2, backgroundColor: '#111', '& .MuiLinearProgress-bar': { backgroundColor: ACCENT } }} />}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {title && <Typography sx={{ color: '#fff', fontFamily: MONO, fontSize: '0.7rem' }}>{title}</Typography>}
        {observations.length > 0 && (
          <Chip
            size="small"
            label={`${observations.length} requests · ${thirdParties.size} third-party ${thirdParties.size === 1 ? 'host' : 'hosts'}`}
            sx={{ borderRadius: 0, height: 18, fontFamily: MONO, fontSize: '0.6rem', color: '#aaa', border: '1px solid #333', backgroundColor: 'transparent' }}
          />
        )}
        {error && <Typography sx={{ color: '#ff9955', fontFamily: MONO, fontSize: '0.65rem' }}>{error}</Typography>}
      </Box>

      {capture && (
        <Box sx={{ border: `1px solid ${ACCENT}`, p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.7rem', letterSpacing: '0.08em' }}>
              EVIDENCE {capture.recordId.slice(0, 16)}…
            </Typography>
            <Button
              onClick={() => void verifyNow()}
              startIcon={<ShieldCheck size={12} />}
              sx={{ color: '#aaa', borderRadius: 0, fontFamily: MONO, fontSize: '0.6rem', py: 0 }}
            >
              VERIFY
            </Button>
            {integrity && (
              <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: integrity.recordIntact && integrity.bodyIntact ? '#00ff88' : '#ff5555' }}>
                {integrity.recordIntact && integrity.bodyIntact ? 'INTACT' : 'ALTERED OR MISSING'}
              </Typography>
            )}
            {heldRecords !== null && (
              <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: '#666' }}>
                {heldRecords} {heldRecords === 1 ? 'record' : 'records'} held
              </Typography>
            )}
          </Box>
          {/* Named separately because they are separate claims about one moment. */}
          {Object.entries(capture.artifacts).map(([name, digest]) => (
            <Typography key={name} sx={{ fontFamily: MONO, fontSize: '0.6rem', color: '#888' }}>
              {name.padEnd(11)} {digest.slice(0, 32)}…
            </Typography>
          ))}
          {capture.screenshotError && (
            <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: '#ff9955' }}>
              no screenshot: {capture.screenshotError} — html and text still stand
            </Typography>
          )}
        </Box>
      )}

      {extraction && (
        <Box sx={{ border: '1px solid #333', p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
          <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.7rem', letterSpacing: '0.08em' }}>
            {extraction.stored} ENTITY ITEM(S) — LINKABLE FROM CASES
          </Typography>
          {/* Method is reported per entity because weight derives from it: a
              grammar match and a model reading are not the same evidence. */}
          <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: '#888' }}>
            {Object.entries(extraction.byMethod).map(([m, n]) => `${n} by ${m}`).join(' · ') || 'none found'}
          </Typography>
          {extraction.note && (
            <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: '#ff9955' }}>{extraction.note}</Typography>
          )}
        </Box>
      )}

      {/*
        The hole. Nothing renders inside it — the native view is composited over
        this rectangle by the host, so its only contribution is a position.
      */}
      <Box
        ref={holeRef}
        data-testid="browse-viewport"
        sx={{ flex: 1, minHeight: 240, border: '1px solid #333', backgroundColor: '#000' }}
      />
    </Box>
  );
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default BrowsePane;
