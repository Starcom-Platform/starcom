/**
 * Uplink's side panel (decision D-EX, E2, W6; EX13): Starcom's own slim page, framed beside what the
 * person is reading. Framed by Uplink, starcom.app keeps its own storage here, so the panel is the
 * app itself: the person's cases, not a copy (the W1 spike, in Brave and Chromium). starcom.app lets
 * only Uplink frame this page.
 */
import { starcomOrigin } from '../../lib/pages';
import { applyTheme } from '../../lib/theme';

applyTheme();
const style = document.createElement('style');
style.textContent = 'html, body { height: 100%; margin: 0; } iframe { display: block; width: 100%; height: 100%; border: 0; }';
document.head.append(style);
const frame = document.createElement('iframe');
frame.title = 'Starcom';
frame.src = `${starcomOrigin(import.meta.env.MODE)}/panel`;
document.body.append(frame);
