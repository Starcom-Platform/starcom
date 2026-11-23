import { describe, it, expect, beforeEach } from 'vitest';
import { globeBookmarkService } from '../GlobeBookmarkService';

describe('globeBookmarkService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(globeBookmarkService.getBookmarks()).toEqual([]);
  });

  it('adds a bookmark and persists it', () => {
    const bookmark = globeBookmarkService.addBookmark(10, 20, 'Test Spot');
    expect(bookmark.lat).toBe(10);
    expect(bookmark.lng).toBe(20);
    expect(bookmark.label).toBe('Test Spot');

    const all = globeBookmarkService.getBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(bookmark.id);
  });

  it('generates a default label when none is given', () => {
    const bookmark = globeBookmarkService.addBookmark(1.5, -2.5);
    expect(bookmark.label).toContain('1.50');
    expect(bookmark.label).toContain('-2.50');
  });

  it('survives being read back as if from a fresh page load', () => {
    globeBookmarkService.addBookmark(5, 5, 'A');
    globeBookmarkService.addBookmark(6, 6, 'B');

    // Simulate a fresh load: read straight from localStorage again.
    const reloaded = globeBookmarkService.getBookmarks();
    expect(reloaded.map(b => b.label)).toEqual(['A', 'B']);
  });

  it('removes a bookmark by id', () => {
    const a = globeBookmarkService.addBookmark(1, 1, 'A');
    const b = globeBookmarkService.addBookmark(2, 2, 'B');

    globeBookmarkService.removeBookmark(a.id);

    const remaining = globeBookmarkService.getBookmarks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it('does not throw and returns an empty list if localStorage has corrupt data', () => {
    localStorage.setItem('starcom-globe-bookmarks', 'not json{{{');
    expect(globeBookmarkService.getBookmarks()).toEqual([]);
  });
});
