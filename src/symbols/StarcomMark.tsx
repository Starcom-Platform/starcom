/**
 * The Starcom mark (K3, BD7): the star, its chevrons and the four wings, as the
 * header's animated GIF drew them, traced from its flat frame to one path.
 *
 * The GIF was 305 KB, 60 frames of the star turning between still wings, and
 * could not take a colour. This is under 1 KB, sharp at any size, and drawn in
 * the colour of what it sits in. The wingless star, the pinned-tab icon and
 * RaveLite's star-commander, stays the small icon.
 *
 * Traced with potrace from the GIF's first frame at four times its size, then
 * each outline reduced to its corners (Ramer-Douglas-Peucker, 0.3 of 160).
 */
import React from 'react';

export const STARCOM_MARK_PATH = 'M0 0.4L0 1.1L33.2 47.5L63.3 47.5L64.1 46.9L58 42L1.3 0.4L0.6 0L0 0ZM158.3 0.6L100.7 42.9L95.9 46.5L95.9 47.3L126.6 47.5L128.7 45.2L159.4 1.5L160 0.6L159.8 0ZM79.1 23.8L70.4 52.1L39.9 52.1L39.7 53L63.9 70.2L65.4 70.2L67.3 69L79.9 59.9L94.4 70.2L95.9 70.2L120.1 53L120.1 52.1L89.6 52.1L80.7 23.8L80.5 23.3L79.3 23.3ZM39.7 60.1L27.5 77.6L22.9 84.7L23.1 85.2L24.2 85.2L57.8 73.8L58 72.5L41 60.1ZM119 60.1L102.2 72.3L101.6 73L102 73.8L135.6 85.2L136.7 85.2L136.9 84.7L136.2 83.5L120.3 60.1ZM78.4 65.6L62.2 77.4L59.7 83.9L59.9 84.9L60.8 84.7L79.5 71.1L80.3 71.1L85.2 74.4L99 84.7L100.1 84.7L97.6 77.4L81.4 65.6L80.3 65ZM78.4 76.7L57.4 92.1L56.3 94.2L54.7 99.2L54.9 99.7L55.9 99.7L79.5 82L81.6 82.8L103.9 99.7L105.1 99.4L102.4 92.1L81.4 76.5L79.5 75.9Z';

export const StarcomMark: React.FC<{ className?: string; title?: string }> = ({ className, title }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 160 99.7"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path fill="currentColor" d={STARCOM_MARK_PATH} />
  </svg>
);

export default StarcomMark;
