/**
 * Every application's address, in one place.
 *
 * Switching applications changed only the application router's state, never the
 * URL, except for the Globe. So a reload always landed on the Globe, the browser's
 * back button left the site instead of returning to the previous app, and no app
 * could be linked to. Each app now has a path: the Globe keeps `/`, and the others
 * live at `/app/<id>`.
 *
 * useApplicationUrl reads it in both directions: it moves the URL when the app
 * changes and the app when the URL changes. A page that opens an app and then
 * sends the browser to `/` still works, because when both change together the
 * application wins and the address is corrected to its path.
 */
import type { ApplicationId } from '../components/Router/EnhancedApplicationRouter';

export const GLOBE_APP: ApplicationId = 'cybercommand';

const APPLICATION_IDS: readonly ApplicationId[] = [
  'cybercommand',
  'netrunner',
  'intelanalyzer',
  'inteldashboard',
  'cases',
  'intelweb',
  'teamworkspace',
  'marketexchange',
];

export function isApplicationId(value: unknown): value is ApplicationId {
  return typeof value === 'string' && (APPLICATION_IDS as readonly string[]).includes(value);
}

/**
 * Addresses that are not the id (K1). The app named Missions lives at
 * /app/missions; its id stays `teamworkspace`, so OpsCenter's old address
 * still opens it.
 */
const SEGMENT: Partial<Record<ApplicationId, string>> = { teamworkspace: 'missions' };
const BY_SEGMENT: Record<string, string> = Object.fromEntries(
  Object.entries(SEGMENT).map(([id, segment]) => [segment, id]),
);
/** The application id an address's segment names. */
const idOfSegment = (segment: string): string => BY_SEGMENT[segment] ?? segment;

/** The path that shows this application. */
export function appPath(appId: ApplicationId): string {
  return appId === GLOBE_APP ? '/' : `/app/${SEGMENT[appId] ?? appId}`;
}

/**
 * Which application a path names.
 *
 * `null` for a path that is not an application's at all (a standalone page), and
 * `'unknown'` for `/app/<something this build does not have>`, which should land on
 * the Globe rather than on nothing.
 */
export function appFromPath(pathname: string): ApplicationId | 'unknown' | null {
  if (pathname === '/' || pathname === '') return GLOBE_APP;
  // A second segment names a record inside the application: /app/cases/<id>.
  const match = /^\/app\/([^/]+)(?:\/[^/]+)?\/?$/.exec(pathname);
  if (!match) return null;
  const id = idOfSegment(decodeURIComponent(match[1]));
  return isApplicationId(id) ? id : 'unknown';
}

/**
 * The record an application's address names, if any: `c1` for
 * `/app/cases/c1` (plan item 1.2). Null for the application's own address.
 */
export function recordFromPath(pathname: string, appId: ApplicationId): string | null {
  const match = /^\/app\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!match || idOfSegment(decodeURIComponent(match[1])) !== appId) return null;
  return decodeURIComponent(match[2]);
}
