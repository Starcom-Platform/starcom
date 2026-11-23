/**
 * Company names for the Wikidata snapshot (plan item 3.6): what one label
 * query's answer becomes. Silence where Wikidata has no name, or two.
 */
import { describe, it, expect } from 'vitest';
import { companyNamesFrom } from '../fetch-wikidata-company-names.mjs';

const row = (lei: string, label?: string) => ({ lei: { value: lei }, ...(label !== undefined ? { cLabel: { value: label } } : {}) });

describe('companyNamesFrom', () => {
  it('names each LEI by its company label', () => {
    expect(companyNamesFrom([row('2138009TF1SYOMQLBJ60', 'The Go-Ahead Group'), row('391200XXYCPAKDL8MN50', ' Lohner Capital GmbH ')]))
      .toEqual({ '2138009TF1SYOMQLBJ60': 'The Go-Ahead Group', '391200XXYCPAKDL8MN50': 'Lohner Capital GmbH' });
  });

  it('leaves out a company with no label in any language asked for, which the service answers with its item id', () => {
    expect(companyNamesFrom([row('2138009TF1SYOMQLBJ60', 'Q123456'), row('391200XXYCPAKDL8MN50', ''), row('529900RZW197X0YYRJ82')])).toEqual({});
  });

  it('leaves out an LEI two items claim under different names, rather than choose', () => {
    expect(companyNamesFrom([row('2138009TF1SYOMQLBJ60', 'Alpha AG'), row('2138009TF1SYOMQLBJ60', 'Beta AG')])).toEqual({});
    // The same name twice is one name.
    expect(companyNamesFrom([row('2138009TF1SYOMQLBJ60', 'Alpha AG'), row('2138009TF1SYOMQLBJ60', 'Alpha AG')]))
      .toEqual({ '2138009TF1SYOMQLBJ60': 'Alpha AG' });
  });
});
