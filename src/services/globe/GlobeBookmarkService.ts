// GlobeBookmarkService — real, persisted "save this location for later" backing for the
// globe context menu's Bookmark Location action (previously two decorative actions,
// "Add Marker" and "Set Waypoint", that only showed a toast and remembered nothing).
//
// Deliberately minimal: local-only persistence, no globe-scene rendering of bookmarks
// (that would mean touching Globe.tsx's 3D marker pipeline, a separate piece of work).
// This gives the feature a real, working foundation — list survives reload — without
// scope-creeping into a full map-pin rendering system.

import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'GlobeBookmarkService' });

const STORAGE_KEY = 'starcom-globe-bookmarks';

export interface GlobeBookmark {
  id: string;
  lat: number;
  lng: number;
  label: string;
  createdAt: string; // ISO
}

function readAll(): GlobeBookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.error('Failed to read bookmarks from storage', error);
    return [];
  }
}

function writeAll(bookmarks: GlobeBookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    log.error('Failed to persist bookmarks to storage', error);
  }
}

export const globeBookmarkService = {
  getBookmarks(): GlobeBookmark[] {
    return readAll();
  },

  addBookmark(lat: number, lng: number, label?: string): GlobeBookmark {
    const bookmark: GlobeBookmark = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat,
      lng,
      label: label || `Bookmark ${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      createdAt: new Date().toISOString()
    };
    const bookmarks = readAll();
    bookmarks.push(bookmark);
    writeAll(bookmarks);
    return bookmark;
  },

  removeBookmark(id: string): void {
    writeAll(readAll().filter(b => b.id !== id));
  }
};
