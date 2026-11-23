/**
 * The SCANNER tab, which has said AWAITING_IMPLEMENTATION since it was written.
 *
 * That read like unfinished work and was not. A browser has no TCP sockets and
 * cannot read a certificate chain, so this panel could not have been built in
 * the host it lived in at any privilege level. It was waiting on an
 * architecture. The desktop host supplies one; in a browser this says so
 * plainly rather than showing a control that cannot work.
 *
 * The certificate half is the more valuable one. An open port says something
 * ran. A certificate says who claims to run it, since when, signed by whom, and
 * through subjectAltName what ELSE the operator binds to the same estate —
 * which is among the strongest pivots available in open-source work.
 */
import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, TextField, Typography, LinearProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Radar, ShieldCheck, AlertTriangle } from 'lucide-react';

import { nativeHost, requiresNativeHost, type NativePortResult, type NativeTlsResult } from '../../../../services/native/nativeHost';
import ReconPanel from './ReconPanel';
import WaybackPanel from './WaybackPanel';
import RequirementsQueue from './RequirementsQueue';
import { sourceAllowed } from '../../../../legal/buildProfile';

/** RDAP, DNS, crt.sh and the Wayback Machine, read with no key: shown only where this build may use them. */
const KEYLESS_LOOKUPS = sourceAllowed('keylessRecon');

const ACCENT = '#00f5ff';
const MONO = "var(--sc-font-data)";
const DISPLAY = "var(--sc-font-text)";

/**
 * Port sets, named for what an operator is asking rather than by number.
 *
 * Kept small deliberately. A wide sweep is a different activity from
 * characterising a host, and the host caps a call at 128 ports regardless.
 */
const PORT_SETS: Record<string, { label: string; ports: number[] }> = {
  web: { label: 'WEB', ports: [80, 443, 8080, 8443] },
  common: {
    label: 'COMMON',
    ports: [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443],
  },
  mail: { label: 'MAIL', ports: [25, 110, 143, 465, 587, 993, 995] },
};

const label = { color: '#888', fontFamily: MONO, fontSize: '0.65rem', letterSpacing: '0.08em' } as const;
const value = { color: '#fff', fontFamily: MONO, fontSize: '0.7rem' } as const;

const outcomeColour = (outcome: NativePortResult['outcome']): string =>
  outcome === 'open' ? '#00ff88' : outcome === 'refused' ? '#ff9955' : '#666';

const ScannerPanel: React.FC = () => {
  const host = nativeHost();
  const [target, setTarget] = useState('');
  const [portSet, setPortSet] = useState<keyof typeof PORT_SETS>('web');
  const [running, setRunning] = useState(false);
  const [ports, setPorts] = useState<NativePortResult[] | null>(null);
  const [tls, setTls] = useState<NativeTlsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tlsError, setTlsError] = useState<string | null>(null);

  const run = async () => {
    if (!host || target.trim().length === 0) return;
    setRunning(true);
    setError(null);
    setTlsError(null);
    setPorts(null);
    setTls(null);

    const cleaned = target.trim().replace(/^https?:\/\//, '').split('/')[0];

    try {
      const probe = await host.tcpProbe({ host: cleaned, ports: PORT_SETS[portSet].ports, banner: true });
      setPorts(probe.results);

      // Attempted separately and reported separately: a host with no TLS
      // listener is a normal finding, not a failure of the port scan, and
      // collapsing the two would lose which one actually happened.
      try {
        setTls(await host.tlsInspect({ host: cleaned }));
      } catch (e) {
        setTlsError(e instanceof Error ? e.message : 'TLS inspection failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setRunning(false);
    }
  };

  if (!host) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto' }}>
        {/*
          Passive recon first, because it works here and is most of the value.
          The tab used to be a single "needs the desktop host" notice, which
          told an analyst with no desktop host that they could do nothing —
          when in fact Certificate Transparency, DNS and RDAP answer most of
          what a paid recon product sells, from a plain tab, for nothing.
        */}
        <RequirementsQueue />
        {/* The keyless lookups' terms are unclear for commercial use: absent from that build (D-CS, CS13). */}
        {KEYLESS_LOOKUPS && <ReconPanel />}
        {KEYLESS_LOOKUPS && <WaybackPanel />}

        <Typography variant="h5" sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '1rem', letterSpacing: '0.1em' }}>
          PORT_SCANNER
        </Typography>
        <Card sx={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 0 }}>
          <CardContent sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} color="#ff9955" style={{ flexShrink: 0, marginTop: 2 }} />
            <Box>
              <Typography sx={{ ...value, mb: 0.5 }}>{requiresNativeHost('Port scanning and certificate inspection')}</Typography>
              <Typography sx={label}>
                A page cannot open a TCP socket or read a certificate chain. This is a property of the
                browser, not a missing feature — the same scan runs unchanged in the desktop host.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto' }}>
      <RequirementsQueue />
      {KEYLESS_LOOKUPS && <ReconPanel />}
      {KEYLESS_LOOKUPS && <WaybackPanel />}

      <Typography variant="h5" sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '1rem', letterSpacing: '0.1em' }}>
        PORT_SCANNER
      </Typography>

      <Card sx={{ backgroundColor: '#0a0a0a', border: `1px solid ${ACCENT}`, borderRadius: 0 }}>
        <CardContent sx={{ p: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField
              label="HOST"
              placeholder="example.com | 192.168.1.1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
              size="small"
              sx={{
                flex: 1, minWidth: 220,
                '& .MuiOutlinedInput-root': {
                  color: '#fff', fontFamily: MONO, fontSize: '0.75rem', borderRadius: 0,
                  '& fieldset': { borderColor: '#333' },
                  '&:hover fieldset': { borderColor: '#555' },
                  '&.Mui-focused fieldset': { borderColor: ACCENT },
                },
                '& .MuiInputLabel-root': { color: '#888', fontFamily: MONO, fontSize: '0.7rem' },
              }}
            />
            <ToggleButtonGroup
              value={portSet}
              exclusive
              size="small"
              onChange={(_e, v) => { if (v) setPortSet(v); }}
              sx={{
                '& .MuiToggleButton-root': {
                  color: '#888', borderColor: '#333', borderRadius: 0,
                  fontFamily: MONO, fontSize: '0.65rem', px: 1,
                  '&.Mui-selected': { color: ACCENT, borderColor: ACCENT, backgroundColor: 'rgba(0,245,255,0.08)' },
                },
              }}
            >
              {Object.entries(PORT_SETS).map(([key, set]) => (
                <ToggleButton key={key} value={key}>{set.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button
              onClick={() => void run()}
              disabled={running || target.trim().length === 0}
              startIcon={<Radar size={14} />}
              sx={{
                color: '#000', backgroundColor: ACCENT, borderRadius: 0, fontFamily: DISPLAY,
                fontSize: '0.7rem', letterSpacing: '0.08em', px: 2,
                '&:hover': { backgroundColor: '#33f8ff' },
                '&.Mui-disabled': { backgroundColor: '#222', color: '#666' },
              }}
            >
              SCAN
            </Button>
          </Box>
          {running && <LinearProgress sx={{ mt: 1, height: 2, backgroundColor: '#111', '& .MuiLinearProgress-bar': { backgroundColor: ACCENT } }} />}
          <Typography sx={{ ...label, mt: 0.75 }}>
            {PORT_SETS[portSet].ports.length} ports · TCP connect · certificate read on 443
          </Typography>
        </CardContent>
      </Card>

      {error && (
        <Typography sx={{ ...value, color: '#ff5555' }}>{error}</Typography>
      )}

      {ports && (
        <Card sx={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 0 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em', mb: 0.75 }}>
              PORTS — {ports.filter((p) => p.open).length} OPEN / {ports.length} PROBED
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {ports.map((p) => (
                <Box key={p.port} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', borderBottom: '1px solid #1a1a1a', py: 0.25 }}>
                  <Typography sx={{ ...value, width: 56, color: outcomeColour(p.outcome) }}>{p.port}</Typography>
                  {/* refused and timeout are different findings — one means
                      something answered for that address, the other that a
                      filter sat in front of it. */}
                  <Typography sx={{ ...label, width: 88, color: outcomeColour(p.outcome) }}>{p.outcome}</Typography>
                  <Typography sx={{ ...label, width: 60 }}>{p.elapsedMs}ms</Typography>
                  {p.banner && (
                    <Typography sx={{ ...value, color: '#aaa', whiteSpace: 'pre-wrap', flex: 1, wordBreak: 'break-all' }}>
                      {p.banner.trim().slice(0, 160)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {tlsError && !tls && (
        <Typography sx={{ ...label, color: '#ff9955' }}>No certificate read: {tlsError}</Typography>
      )}

      {tls && <CertificateCard tls={tls} />}
    </Box>
  );
};

const CertificateCard: React.FC<{ tls: NativeTlsResult }> = ({ tls }) => {
  const leaf = tls.chain[0];
  const expiring = leaf !== undefined && leaf.daysUntilExpiry < 30;

  return (
    <Card sx={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 0 }}>
      <CardContent sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <ShieldCheck size={14} color={tls.authorized ? '#00ff88' : '#ff5555'} />
          <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em' }}>
            CERTIFICATE — {tls.protocol ?? 'unknown'} · {tls.chain.length} IN CHAIN
          </Typography>
          <Chip
            size="small"
            label={tls.authorized ? 'VALIDATES' : 'DOES NOT VALIDATE'}
            sx={{
              borderRadius: 0, height: 18, fontFamily: MONO, fontSize: '0.6rem',
              color: tls.authorized ? '#00ff88' : '#ff5555',
              border: `1px solid ${tls.authorized ? '#00ff88' : '#ff5555'}`,
              backgroundColor: 'transparent',
            }}
          />
        </Box>

        {!tls.authorized && tls.authorizationError && (
          <Typography sx={{ ...label, color: '#ff5555', mb: 0.5 }}>{tls.authorizationError}</Typography>
        )}

        {leaf && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row k="SUBJECT" v={leaf.subject.CN ?? Object.values(leaf.subject)[0] ?? '—'} />
            <Row k="ISSUER" v={leaf.issuer.O ?? leaf.issuer.CN ?? '—'} />
            <Row k="VALID TO" v={`${leaf.validTo}  (${leaf.daysUntilExpiry}d)`} colour={expiring ? '#ff9955' : undefined} />
            <Row k="SHA-256" v={leaf.fingerprint256} />
            {/* The pivot: every other name bound to this certificate. */}
            <Box sx={{ mt: 0.5 }}>
              <Typography sx={label}>SUBJECT ALT NAMES — {leaf.subjectAltNames.length}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.4 }}>
                {leaf.subjectAltNames.map((name) => (
                  <Chip
                    key={name}
                    size="small"
                    label={name.replace(/^DNS:/, '')}
                    sx={{
                      borderRadius: 0, height: 18, fontFamily: MONO, fontSize: '0.6rem',
                      color: '#ddd', border: '1px solid #333', backgroundColor: 'transparent',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

const Row: React.FC<{ k: string; v: string; colour?: string }> = ({ k, v, colour }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ ...label, width: 120, flexShrink: 0 }}>{k}</Typography>
    <Typography sx={{ ...value, color: colour ?? '#fff', wordBreak: 'break-all' }}>{v}</Typography>
  </Box>
);

export default ScannerPanel;
