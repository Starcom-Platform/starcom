import React from 'react';
import { Docked } from '../Dock/Docked';
import {
  linkedRecordsNotDrawn, nothingLinked, type Disclosure,
} from '../../services/epistemic/epistemicLanguage';
import type { ShownRecord } from './Hooks/useShownRecord';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const KIND_NAME = { case: 'Case', mission: 'Mission', package: 'Package', publisher: 'Published by' } as const;

/**
 * A package's reports that name no place. Said apart from the linked-record
 * words a case uses: a package cites, it does not link.
 */
const placelessNote = (n: number): Disclosure => ({
  tone: 'info',
  text: `${count(n, 'found report names', 'found reports name')} no place, so ${n === 1 ? 'it is' : 'they are'} not drawn.`,
});

/**
 * The Case or Mission the globe is showing, and what of it is not on the map.
 * Or a package another node published, with the reports it cites, or what one
 * key published, labelled as that (plan item 9.14, decision G6).
 *
 * While one is shown only its linked reports are drawn. Without this panel the
 * globe would seem to have lost every other report, and a case with two pins
 * out of nine linked records would look like a case about two places. The way
 * back to every report sits beside the reason they are gone.
 */

const panel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320,
  padding: '6px 8px', borderRadius: 3,
  background: 'rgba(12,22,34,0.88)', border: '1px solid rgba(0,255,255,0.35)', color: '#c8dcf0',
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4,
  pointerEvents: 'auto',
};
const heading: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 };
const eyebrow: React.CSSProperties = {
  color: '#00ffff', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
};
const recordName: React.CSSProperties = {
  color: '#e6f4ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
// The same two tones as GlobeIntelStatus, so amber means the same thing in both.
const chip = (tone: Disclosure['tone']): React.CSSProperties => ({
  padding: '3px 8px', borderRadius: 3,
  background: tone === 'warn' ? 'rgba(120,60,0,0.82)' : 'rgba(20,30,45,0.82)',
  border: `1px solid ${tone === 'warn' ? 'rgba(255,170,60,0.55)' : 'rgba(120,160,200,0.35)'}`,
  color: tone === 'warn' ? '#ffd9a0' : '#c8dcf0',
});
const button: React.CSSProperties = {
  alignSelf: 'flex-start', marginTop: 2, padding: '2px 8px', borderRadius: 3,
  border: '1px solid rgba(0,255,255,0.45)', background: 'rgba(0,255,255,0.08)', color: '#00ffff',
  font: 'inherit', cursor: 'pointer',
};

export const GlobeShownRecord: React.FC<{ shown: ShownRecord; onShowAll: () => void }> = ({ shown, onShowAll }) => {
  if (shown.status === 'none') return null;

  const { kind } = shown.target;
  const kindName = KIND_NAME[kind];
  const shownName = kind === 'publisher' ? 'What a key published, shown on the globe' : `${kindName} shown on the globe`;
  let label: string | null = null;
  let status: string | null = null;
  const notes: Disclosure[] = [];

  switch (shown.status) {
    case 'loading':
      status = kind === 'package' ? "Reading this package's cited reports…"
        : kind === 'publisher' ? 'Reading what this key published…'
          : `Reading this ${kind}'s linked records…`;
      break;
    case 'missing':
      notes.push({ tone: 'warn', text: `This ${kind} no longer exists, so nothing is drawn for it.` });
      break;
    case 'failed':
      notes.push({
        tone: 'warn',
        text: kind === 'package' || kind === 'publisher'
          ? 'These reports could not be read, so none are drawn.'
          : `This ${kind}'s linked records could not be read, so none are drawn.`,
      });
      break;
    case 'ready': {
      if (shown.target.kind === 'package') {
        const cited = shown.citations ?? { cited: 0, found: 0, unresolved: [] };
        const placeless = shown.placement.notDrawn.byReason['no-coordinates'] ?? 0;
        label = shown.label;
        status = `Cites ${count(cited.cited, 'report', 'reports')}: ${cited.found} found here, ${shown.placement.markers.length} drawn.`;
        if (placeless > 0) notes.push(placelessNote(placeless));
        if (cited.unresolved.length > 0) {
          notes.push({
            tone: 'warn',
            text: `Not found among what its signer published here: ${cited.unresolved.join(', ')}. `
              + `${cited.unresolved.length === 1 ? 'It may not have arrived yet, or it names' : 'They may not have arrived yet, or they name'} a report in a way this node cannot read.`,
          });
        }
        notes.push({ tone: 'info', text: 'What the package cites, found among reports signed by the same key.' });
        break;
      }
      if (shown.target.kind === 'publisher') {
        const published = shown.published ?? 0;
        const placeless = shown.placement.notDrawn.byReason['no-coordinates'] ?? 0;
        label = shown.label;
        if (published === 0) {
          notes.push({ tone: 'info', text: 'Nothing this key published has arrived here yet. Reports appear as the relays answer.' });
          break;
        }
        status = `${count(published, 'report', 'reports')} found here, ${shown.placement.markers.length} drawn.`;
        if (placeless > 0) notes.push(placelessNote(placeless));
        notes.push({ tone: 'info', text: 'Everything this key published that has arrived here: not what any package rests on.' });
        break;
      }
      const { linkedCount, markers, notDrawn } = shown.placement;
      label = shown.label;
      if (linkedCount === 0) {
        const recordKind = shown.target.kind;
        notes.push(nothingLinked(recordKind === 'mission' && shown.caseCount ? 'mission-cases' : recordKind));
      } else {
        status = `${markers.length} of ${count(linkedCount, 'linked record', 'linked records')} drawn`;
        if (notDrawn.count > 0) notes.push(linkedRecordsNotDrawn(notDrawn.byReason));
      }
      break;
    }
  }

  return (
    <Docked slot="globeShownRecord">
      <section style={panel} data-testid="globe-shown-record" aria-label={shownName}>
        <div style={heading}>
          <span style={eyebrow}>{kindName}</span>
          {label && <span style={recordName} title={label}>{label}</span>}
        </div>
        {status && <div>{status}</div>}
        {notes.map((n, i) => <div key={i} style={chip(n.tone)} data-tone={n.tone}>{n.text}</div>)}
        <button type="button" style={button} onClick={onShowAll}>Show all reports</button>
      </section>
    </Docked>
  );
};

export default GlobeShownRecord;
