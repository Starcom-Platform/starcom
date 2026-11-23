import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../htmlEntities';

describe('decodeHtmlEntities', () => {
  it('reads the references Grants.gov sends', () => {
    expect(decodeHtmlEntities('A &ndash; B&rsquo;s &amp; C&nbsp;D &mdash; &quot;E&quot;')).toBe('A – B’s & C D — "E"');
  });

  it('decodes numeric references, decimal and hex, and drops invisible marks', () => {
    expect(decodeHtmlEntities('caf&#233; &#x2013; x&#8203;y')).toBe('café – xy');
  });

  it('leaves a reference it does not know as it stands', () => {
    expect(decodeHtmlEntities('&bogus; &#0; AT&T')).toBe('&bogus; &#0; AT&T');
  });
});
