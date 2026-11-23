/**
 * A report form waiting for its place to be picked on the globe, and the
 * report kept while it waits (plan item 3.5).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { placePick, reportDraft } from '../placePick';

beforeEach(() => { placePick.cancel(); reportDraft.take(); });

describe('placePick', () => {
  it('is asked for, heard, and ended once the place is picked or the pick given up', () => {
    const heard: boolean[] = [];
    const off = placePick.subscribe(() => heard.push(placePick.isPending()));
    placePick.request();
    expect(placePick.isPending()).toBe(true);
    placePick.done();
    expect(placePick.isPending()).toBe(false);
    placePick.request();
    placePick.cancel();
    off();
    placePick.request();
    expect(heard).toEqual([true, false, true, false]);
  });
});

describe('reportDraft', () => {
  it('keeps the report being written for one taking, and no more', () => {
    reportDraft.save({ title: 'Berth 4 cranes at night' });
    expect(reportDraft.take()).toEqual({ title: 'Berth 4 cranes at night' });
    expect(reportDraft.take()).toBeNull();
  });
});
