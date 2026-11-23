/**
 * Diplomacy's country brief (decision D-DP, DP6, DP18, DP19), in the drawer's country view under its
 * relations: OFAC's SDN entries with an address there, by programme, people counted and never named;
 * UNHCR's displacement both ways; then where the country stands among producers — its rank,
 * the amount and the year, with Resource Zones' percentile beside it. A source that did not answer is
 * named; a figure is never filled in. The drawer reads the figures (useCountryBrief) and shows this.
 */
import React from 'react';
import { amounted, fill, listed, numbered, useMessages } from '../../i18n/app/i18n';
import { formatUtcDate } from '../../utils/utcTime';
import type { CountryBrief } from '../../geopolitical/hooks/useCountryBrief';
import type { BriefSource, ResourceLine } from '../../geopolitical/utils/countryBrief';
import { resourceLineWords, SOURCE_KEY } from '../../geopolitical/utils/resourceLineWords';

type Words = ReturnType<typeof useMessages>['m']['diplomacy'];

const heading: React.CSSProperties = { color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const rows: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 8, margin: '2px 0 0' };
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', flexShrink: 0 };

/** How many of a country's sanctions programmes the brief names, the largest first. */
const PROGRAMMES_SHOWN = 4;

const ResourceRow: React.FC<{ line: ResourceLine; words: Words }> = ({ line, words }) => {
  const said = resourceLineWords(line, words);
  return (
    <li data-testid="diplomacy-resource" data-kind={line.kind} style={{ margin: '3px 0' }}>
      <div>{`${said.name}: ${said.rank}`}</div>
      <div style={muted}>{said.source}</div>
    </li>
  );
};

export const DiplomacyBriefView: React.FC<{ brief: CountryBrief; words: Words }> = ({ brief, words }) => {
  const failed = (source: BriefSource) => fill(words.sourceFailed, { source: words.sourceNames[SOURCE_KEY[source]] });
  const shown = brief.displacement;
  const displacement = shown ? [
    [words.refugeesAbroad, shown.refugeesAbroad],
    [words.asylumAbroad, shown.asylumAbroad],
    [words.displacedInside, shown.inside],
    [words.refugeesHosted, shown.refugeesHosted],
    [words.asylumHosted, shown.asylumHosted],
  ].filter(([, n]) => (n as number) > 0) as Array<[string, number]> : [];
  const resourcesFailed = brief.failed.filter((source) => source !== 'UNHCR' && source !== 'OFAC');
  const sanctions = brief.sanctions;
  return (
    <div data-testid="diplomacy-brief">
      <div style={heading}>{words.sanctionsTitle}</div>
      {brief.failed.includes('OFAC') ? (
        <div style={muted}>{failed('OFAC')}</div>
      ) : sanctions === undefined ? (
        <div style={muted}>{words.briefLoading}</div>
      ) : sanctions === null ? (
        <div style={muted}>{words.sanctionsNone}</div>
      ) : (
        <>
          <div style={rows}>
            <span>{words.sanctionsEntries}</span>
            <span data-testid="diplomacy-sanctions-entries">{numbered(sanctions.entries)}</span>
            <span>{words.sanctionsPeople}</span>
            <span>{numbered(sanctions.people)}</span>
          </div>
          <div style={muted} data-testid="diplomacy-sanctions-programmes">
            {fill(words.sanctionsProgrammes, { list: listed(sanctions.programmes.slice(0, PROGRAMMES_SHOWN).map(([code, n]) => `${code} ${numbered(n)}`)) })}
          </div>
          <div style={muted}>{fill(words.sourceYear, { source: words.sourceNames.ofac, year: formatUtcDate(Date.parse(`${sanctions.asOf}T00:00:00Z`), { year: true }) })}</div>
        </>
      )}
      <div style={heading}>{words.displacementTitle}</div>
      {brief.failed.includes('UNHCR') ? (
        <div style={muted}>{failed('UNHCR')}</div>
      ) : shown === undefined ? (
        <div style={muted}>{words.briefLoading}</div>
      ) : displacement.length === 0 ? (
        <div style={muted}>{words.displacementNone}</div>
      ) : (
        <>
          <div style={rows}>
            {displacement.map(([label, n]) => (
              <React.Fragment key={label}>
                <span>{label}</span>
                <span data-testid="diplomacy-displacement">{amounted(n)}</span>
              </React.Fragment>
            ))}
          </div>
          <div style={muted}>{fill(words.sourceYear, { source: words.sourceNames.unhcr, year: shown!.year })}</div>
        </>
      )}
      <div style={heading}>{words.resourcesTitle}</div>
      {brief.resources === null ? (
        <div style={muted}>{words.briefLoading}</div>
      ) : (
        <>
          {brief.resources.length > 0 ? (
            <ul style={list}>
              {brief.resources.map((line) => <ResourceRow key={line.kind} line={line} words={words} />)}
            </ul>
          ) : resourcesFailed.length === 0 && <div style={muted}>{words.resourcesNone}</div>}
          {resourcesFailed.map((source) => <div key={source} style={muted}>{failed(source)}</div>)}
        </>
      )}
    </div>
  );
};
