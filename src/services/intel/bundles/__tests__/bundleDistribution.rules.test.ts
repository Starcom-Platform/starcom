/**
 * The distribution rule, as words (plan items 9.13 and 9.13b; decisions G8
 * and G8d). A report's own download follows the rule Export as file does, and
 * a Private record points to the one way it leaves: sealed to its owner.
 */
import { describe, it, expect } from 'vitest';
import { bundleRefusal, exportRefusal, reportDownloadRefusal, reportReach } from '../bundleDistribution';
import { exchangeRefusal } from '../../../publishing/exchange';

const COPY = 'To keep a copy for yourself, use Export all my work under Your key.';

describe('sending and exporting a case or mission', () => {
  it('keeps a Private one here, and says how to hand it on', () => {
    expect(bundleRefusal('mission', 'private')).toBe(
      'This mission is Private: it stays in this workspace, and is never sent or exported to anyone else. To hand it on, change who may receive it first.',
    );
  });

  it('adds, for a file, the one way it leaves: sealed to you', () => {
    expect(exportRefusal('case', 'private')).toBe(`${bundleRefusal('case', 'private')} ${COPY}`);
    expect(exportRefusal('case', undefined)).toBe(bundleRefusal('case', undefined));
    expect(exportRefusal('case', 'limited')).toBeNull();
  });
});

describe("a report's own download", () => {
  it('lets a report someone published go: the relay feed brought it here', () => {
    expect(reportDownloadRefusal({ visibility: undefined, history: [{ action: 'IMPORTED', user: 'nostr' }] })).toBeNull();
  });

  it('keeps a Private report here, and says how to keep a copy for yourself', () => {
    expect(reportDownloadRefusal({ visibility: 'private', history: [] })).toBe(
      `This report is Private: it stays in this workspace, and is never sent or exported to anyone else. ${COPY}`,
    );
  });

  it('asks about an undecided one first', () => {
    expect(reportDownloadRefusal({ visibility: undefined })).toBe(
      'Nobody has chosen who may receive this report yet. Choose first: Private stays here, and Limited and Public can go to the people you name.',
    );
  });

  it('judges one imported from a file by its own distribution, and lets Limited and Public go', () => {
    expect(reportDownloadRefusal({ visibility: 'private', history: [{ action: 'IMPORTED', user: 'import' }] })).toMatch(/^This report is Private/);
    expect(reportDownloadRefusal({ visibility: 'limited' })).toBeNull();
    expect(reportDownloadRefusal({ visibility: 'public', history: [] })).toBeNull();
  });
});

// BD16: the report form asks who may receive a report, and under the choice
// says what it lets happen. Choosing sends nothing: a report is not published
// by its distribution, only allowed to go when someone sends, exports or
// publishes it.
describe("what a report's distribution lets happen, as its form says it", () => {
  it('says choosing sends nothing, and where each choice lets it go', () => {
    expect(reportReach('public')).toBe('Choosing sends nothing. It may then be published through the Exchange, sent or exported, and anyone may read it once it is.');
    expect(reportReach('limited')).toBe('Choosing sends nothing. It may then be sent or exported to the people you name. The Exchange, which is public, will not take it.');
  });

  it('says a Private one stays, in the words its refusals use', () => {
    expect(reportReach('private')).toBe('This report is Private: it stays in this workspace, and is never sent or exported to anyone else.');
    expect(reportDownloadRefusal({ visibility: 'private' })).toContain(reportReach('private'));
  });

  it('says an undecided one waits, and will be asked about', () => {
    expect(reportReach(undefined)).toBe('Nothing is sent, exported or published until someone decides; you will be asked before it leaves this workspace.');
  });

  it('agrees with the rules it describes', () => {
    expect(exchangeRefusal('public')).toBeNull();
    expect(exchangeRefusal('limited')).not.toBeNull();
    expect(reportDownloadRefusal({ visibility: 'limited' })).toBeNull();
    expect(reportDownloadRefusal({ visibility: undefined })).not.toBeNull();
  });
});
