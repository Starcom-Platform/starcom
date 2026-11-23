/**
 * Passive reconnaissance that needs no key, no host and no money.
 *
 * This is the half of the SCANNER tab that works for everyone. The port and
 * certificate half needs the desktop host, because a browser has no sockets —
 * but Certificate Transparency, DNS and RDAP are all reachable from a plain
 * tab, and between them they answer most of what a paid recon product sells.
 *
 * Nothing here touches the target. CT logs, public resolvers and the registry
 * are all third parties, so an operator can characterise a subject without
 * appearing in its logs at all.
 */
import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, TextField, Typography, LinearProgress } from '@mui/material';
import { Search, AlertTriangle, Boxes } from 'lucide-react';

import { storeExtractedEntities } from '../../../../services/intel/extraction/storeExtractedEntities';
import type { ExtractedEntity } from '../../../../services/intel/extraction/entityExtraction';
import type { EvidenceSink } from '../../../../services/intel/recon/keylessRecon';
import { reconSnapshotStore } from '../../../../services/intel/recon/reconSnapshotStore';
import { diffSnapshots, describeChange, type ReconChange, type ReconSnapshot } from '../../../../services/intel/recon/reconDiff';
import {
  certificateTransparency,
  dnsAcrossResolvers,
  mailPosture,
  registration,
  type SubdomainFinding,
  type MailPosture,
  type Registration,
  type DnsAnswer,
} from '../../../../services/intel/recon/keylessRecon';

const ACCENT = '#00f5ff';
const MONO = "var(--sc-font-data)";
const DISPLAY = "var(--sc-font-text)";

const label = { color: '#888', fontFamily: MONO, fontSize: '0.65rem', letterSpacing: '0.08em' } as const;
const value = { color: '#fff', fontFamily: MONO, fontSize: '0.7rem' } as const;

interface Results {
  subdomains?: SubdomainFinding[];
  mail?: MailPosture;
  reg?: Registration;
  resolvers?: { answers: DnsAnswer[]; agree: boolean };
  errors: string[];
}

/**
 * Turn what was observed into entities a Case can link.
 *
 * These are `pattern` rather than `model` findings and the distinction is real:
 * a name appearing in a certificate log, an MX host returned by a resolver and
 * a nameserver named by the registry are all grammar-level facts about a
 * response, not a reading of one. They carry the strongest method this system
 * has, and recording that honestly is what lets a claim resting on them be
 * weighed correctly later.
 */
function entitiesFrom(results: Results): ExtractedEntity[] {
  const found = new Map<string, ExtractedEntity>();
  const add = (kind: ExtractedEntity['kind'], value: string) => {
    const clean = value.trim().replace(/\.$/, '').toLowerCase();
    if (clean.length === 0) return;
    found.set(`${kind}:${clean}`, { kind, value: clean, method: 'pattern' });
  };

  for (const s of results.subdomains ?? []) add('domain', s.name);
  // "10 mail.example.com." — the priority is a property of the record, not of
  // the host, so only the host becomes an entity.
  for (const mx of results.mail?.mx ?? []) add('domain', mx.replace(/^\d+\s+/, ''));
  for (const ns of results.reg?.nameservers ?? []) add('domain', ns);
  for (const answer of results.resolvers?.answers ?? []) {
    for (const record of answer.records) {
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(record)) add('ipv4', record);
    }
  }
  return [...found.values()];
}

const ReconPanel: React.FC = () => {
  const [target, setTarget] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [filed, setFiled] = useState<{ count: number; failures: number } | null>(null);
  /** Evidence ids this lookup produced; empty in a browser, which is truthful. */
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  /**
   * What moved since last time, or null.
   *
   * Null covers both "first look at this target" and "nothing moved", and the
   * panel distinguishes them below — a first look has nothing to compare, which
   * is not the same as a comparison that found nothing.
   */
  const [change, setChange] = useState<ReconChange | null>(null);
  const [comparedAgainst, setComparedAgainst] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const run = async () => {
    const domain = target.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (domain.length === 0) return;

    setRunning(true);
    setResults(null);
    setEvidenceIds([]);
    const errors: string[] = [];
    // One sink for the whole lookup: every source pushes what it captured.
    const sink: EvidenceSink = [];

    // Each source is awaited independently. One registry being slow must not
    // withhold the certificate log's answer — and a source that failed is
    // reported as failed rather than folded into an empty result.
    const [subdomains, mail, reg, resolvers] = await Promise.all([
      certificateTransparency(domain, sink).catch((e) => { errors.push(`crt.sh: ${e.message}`); return undefined; }),
      mailPosture(domain, sink).catch((e) => { errors.push(`DNS: ${e.message}`); return undefined; }),
      registration(domain, sink).catch((e) => { errors.push(`RDAP: ${e.message}`); return undefined; }),
      dnsAcrossResolvers(domain, 'A', sink).catch((e) => { errors.push(`resolvers: ${e.message}`); return undefined; }),
    ]);

    setResults({ subdomains, mail, reg, resolvers, errors });
    setEvidenceIds(sink);
    setFiled(null);

    /**
     * Compare, then remember. In that order: remembering first would compare
     * this observation against itself and report that nothing ever changes.
     */
    const now: ReconSnapshot = {
      target: domain,
      observedAt: new Date().toISOString(),
      certificateNames: (subdomains ?? []).map((x) => x.name),
      mx: mail?.mx ?? [],
      nameservers: reg?.nameservers ?? [],
      addresses: resolvers?.answers.flatMap((a) => a.records) ?? [],
      registrationExpires: reg?.expires,
    };
    const before = await reconSnapshotStore.previous(domain);
    setComparedAgainst(before?.observedAt ?? null);
    setChange(before ? diffSnapshots(before, now) : null);
    await reconSnapshotStore.remember(now);

    setRunning(false);
  };

  /**
   * Filing is a separate, explicit act.
   *
   * Looking something up and asserting it into the workspace are different
   * decisions, and collapsing them would put every idle search into the record
   * — which is how a workspace stops describing an investigation and starts
   * describing the searching.
   */
  const file = async () => {
    if (!results) return;
    setFiling(true);
    const entities = entitiesFrom(results);
    const stored = await storeExtractedEntities(entities, {
      source: `passive recon: ${target.trim()}`,
      evidenceRecordIds: evidenceIds,
    });
    setFiled({ count: stored.itemIds.length, failures: stored.failures.length });
    setFiling(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h5" sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '1rem', letterSpacing: '0.1em' }}>
        PASSIVE_RECON
      </Typography>

      <Card sx={{ backgroundColor: '#0a0a0a', border: `1px solid ${ACCENT}`, borderRadius: 0 }}>
        <CardContent sx={{ p: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
            <TextField
              label="DOMAIN"
              placeholder="example.com"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
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
              onClick={() => void run()}
              disabled={running || target.trim().length === 0}
              startIcon={<Search size={14} />}
              sx={{
                color: '#000', backgroundColor: ACCENT, borderRadius: 0, fontFamily: DISPLAY,
                fontSize: '0.7rem', letterSpacing: '0.08em', px: 2,
                '&.Mui-disabled': { backgroundColor: '#222', color: '#666' },
              }}
            >
              LOOK UP
            </Button>
          </Box>
          {running && <LinearProgress sx={{ mt: 1, height: 2, backgroundColor: '#111', '& .MuiLinearProgress-bar': { backgroundColor: ACCENT } }} />}
          <Typography sx={{ ...label, mt: 0.75 }}>
            Certificate Transparency · DNS · RDAP — free, keyless, and nothing is sent to the target
          </Typography>
        </CardContent>
      </Card>

      {results && (
        change ? (
          <Card sx={{ backgroundColor: '#0a0a0a', border: '1px solid #ff9955', borderRadius: 0 }}>
            <CardContent sx={{ p: 1 }}>
              <Typography sx={{ color: '#ff9955', fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em', mb: 0.5 }}>
                CHANGED SINCE {new Date(change.previousObservedAt).toISOString().slice(0, 10)}
              </Typography>
              {describeChange(change).map((line) => (
                <Typography key={line} sx={{ ...value, color: '#fff' }}>{line}</Typography>
              ))}
              {change.certificateNamesAdded.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.5 }}>
                  {change.certificateNamesAdded.slice(0, 20).map((n) => (
                    <Chip key={n} size="small" label={n}
                      sx={{ borderRadius: 0, height: 18, fontFamily: MONO, fontSize: '0.6rem', color: '#ff9955', border: '1px solid #ff9955', backgroundColor: 'transparent' }} />
                  ))}
                </Box>
              )}
              {/* Said out loud rather than shown as a removal: the log is
                  append-only, so a name that did not come back this time is a
                  property of the read, not of the estate. */}
              {change.certificateNamesNotReturned.length > 0 && (
                <Typography sx={{ ...label, mt: 0.5 }}>
                  {change.certificateNamesNotReturned.length} {change.certificateNamesNotReturned.length === 1 ? 'name' : 'names'} seen
                  before did not come back this time. Certificate logs keep every name, so the query differed; nothing disappeared.
                </Typography>
              )}
            </CardContent>
          </Card>
        ) : (
          <Typography sx={{ ...label }}>
            {comparedAgainst
              ? `No change since ${new Date(comparedAgainst).toISOString().slice(0, 10)}.`
              : 'First look at this target — nothing to compare against yet.'}
          </Typography>
        )
      )}

      {results?.errors.map((e) => (
        <Typography key={e} sx={{ ...label, color: '#ff9955' }}>{e}</Typography>
      ))}

      {results && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            onClick={() => void file()}
            disabled={filing || entitiesFrom(results).length === 0}
            startIcon={<Boxes size={14} />}
            sx={{
              color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 0,
              fontFamily: DISPLAY, fontSize: '0.65rem', letterSpacing: '0.08em',
              '&.Mui-disabled': { color: '#555', borderColor: '#333' },
            }}
          >
            FILE {entitiesFrom(results).length} ENTITIES
          </Button>
          {filed && (
            <Typography sx={{ ...label, color: filed.failures > 0 ? '#ff9955' : '#00ff88' }}>
              {filed.count} filed — linkable from Cases
            {evidenceIds.length > 0 ? ` · resting on ${evidenceIds.length} captured ${evidenceIds.length === 1 ? 'record' : 'records'}` : ''}
              {filed.failures > 0 ? ` · ${filed.failures} could not be stored` : ''}
            </Typography>
          )}
        </Box>
      )}

      {results?.subdomains && (
        <Section title={`NAMES IN CERTIFICATE LOGS — ${results.subdomains.length}`}>
          {/* CT records what an operator asked to have certified, which is not
              the same set as what resolves today. The difference is often the
              finding. */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
            {results.subdomains.slice(0, 60).map((s) => (
              <Chip key={s.name} size="small" label={s.name}
                sx={{ borderRadius: 0, height: 18, fontFamily: MONO, fontSize: '0.6rem', color: '#ddd', border: '1px solid #333', backgroundColor: 'transparent' }} />
            ))}
          </Box>
          {results.subdomains.length > 60 && (
            <Typography sx={{ ...label, mt: 0.5 }}>+{results.subdomains.length - 60} more</Typography>
          )}
        </Section>
      )}

      {results?.mail && (
        <Section title="MAIL POSTURE">
          <Row k="MX" v={results.mail.mx.join(', ') || 'none'} />
          <Row k="SPF" v={results.mail.spf ?? 'none'} />
          <Row k="DMARC" v={results.mail.dmarc ?? 'none'} colour={results.mail.dmarc ? undefined : '#ff9955'} />
          {results.mail.notes.map((n) => (
            <Typography key={n} sx={{ ...label, color: '#ff9955' }}>{n}</Typography>
          ))}
        </Section>
      )}

      {results?.reg && (
        <Section title="REGISTRATION">
          <Row k="REGISTERED" v={results.reg.registered ?? 'not stated'} />
          <Row k="EXPIRES" v={results.reg.expires ?? 'not stated'} />
          <Row k="STATUS" v={results.reg.status.join(', ') || 'none'} />
          <Row k="NAMESERVERS" v={results.reg.nameservers.join(', ') || 'none'} />
          {results.reg.registry && <Row k="REGISTRY" v={results.reg.registry} />}
          {/* The registry's own notices, as it sent them: its terms travel with its data (D-EX EX33). */}
          {(results.reg.notices ?? []).length > 0 && (
            <Typography sx={{ ...label, mt: 0.4 }}>The registry's notices, as it sent them:</Typography>
          )}
          {(results.reg.notices ?? []).map((n) => (
            <Typography key={`${n.title ?? ''}|${n.text}`} sx={{ ...label, textTransform: 'none' }}>
              {n.title ? `${n.title}: ` : ''}{n.text}{' '}
              {n.links.map((href) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)', marginRight: 6 }}>{new URL(href).host}</a>
              ))}
            </Typography>
          ))}
        </Section>
      )}

      {results?.resolvers && results.resolvers.answers.length > 1 && (
        <Section title="INDEPENDENT RESOLVERS">
          {results.resolvers.answers.map((a) => (
            <Row key={a.resolver} k={a.resolver.toUpperCase()} v={a.records.join(', ') || `status ${a.status}`} />
          ))}
          {/* Two resolvers run by different organisations disagreeing is
              evidence of manipulation or split-horizon DNS — and, being
              genuinely independent, their agreement corroborates. */}
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mt: 0.4 }}>
            {results.resolvers.agree ? (
              <Typography sx={{ ...label, color: '#00ff88' }}>Both resolvers agree.</Typography>
            ) : (
              <>
                <AlertTriangle size={12} color="#ff9955" />
                <Typography sx={{ ...label, color: '#ff9955' }}>
                  Resolvers disagree — manipulation, split-horizon DNS, or geographic routing.
                </Typography>
              </>
            )}
          </Box>
        </Section>
      )}
    </Box>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card sx={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 0 }}>
    <CardContent sx={{ p: 1 }}>
      <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em', mb: 0.6 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>{children}</Box>
    </CardContent>
  </Card>
);

const Row: React.FC<{ k: string; v: string; colour?: string }> = ({ k, v, colour }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ ...label, width: 110, flexShrink: 0 }}>{k}</Typography>
    <Typography sx={{ ...value, color: colour ?? '#fff', wordBreak: 'break-all' }}>{v}</Typography>
  </Box>
);

export default ReconPanel;
