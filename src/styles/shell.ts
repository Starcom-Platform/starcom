/**
 * The padding inside an app's shell (K4, the tight shell): 8 px on a phone and
 * 16 px from md up. It was MUI's p: 3, 24 px on every side at every width, so a
 * phone lost 48 px of its 390 before an app drew anything.
 */
export const SHELL_PADDING = { xs: 1, md: 2 } as const;
