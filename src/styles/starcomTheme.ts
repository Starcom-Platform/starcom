import { createTheme, type PaletteOptions } from '@mui/material/styles';
import { muiZIndex } from './layers';
import { CYAN, GUNMETAL, SEMANTIC, ROLES, FONTS } from './tokens';

/**
 * The palette every MUI theme in the app uses, made from the tokens (plan
 * item 8.1, decision D6). An application that needs its own component styles
 * builds a theme with `palette: starcomPalette`; none chooses its own colours.
 */
export const starcomPalette: PaletteOptions & { mode: 'dark' } = {
  mode: 'dark',
  primary: { main: CYAN[500], light: CYAN[400], dark: CYAN[600], contrastText: GUNMETAL[950] },
  // Grey: unknown, stale, not judged. A second brand colour would be one more
  // hue with no meaning, and the old one was pink.
  secondary: { main: GUNMETAL[400], light: GUNMETAL[300], dark: GUNMETAL[500], contrastText: GUNMETAL[950] },
  info: { main: CYAN[400], contrastText: GUNMETAL[950] },
  success: { main: SEMANTIC.ok, contrastText: GUNMETAL[950] },
  warning: { main: SEMANTIC.caution, contrastText: GUNMETAL[950] },
  error: { main: SEMANTIC.danger, contrastText: GUNMETAL[950] },
  background: { default: ROLES.surface.frame, paper: ROLES.surface.panel },
  text: { primary: ROLES.text.body, secondary: ROLES.text.secondary, disabled: ROLES.text.muted },
  divider: ROLES.surface.divider,
};

/**
 * The root theme, mounted above the whole app (main.tsx).
 *
 * It carried only the z-index scale (baseTheme, kept here): its note said a
 * global visual identity "belongs in a deliberate commit, not this one". This
 * is that commit. Every screen without a theme of its own (Cases, NetRunner,
 * Help, the coach, the intel components) drew MUI's light default inside a
 * dark app; they draw the token palette now, and the type of pairing A (8.2).
 */
export const starcomTheme = createTheme({
  zIndex: { ...muiZIndex },
  palette: starcomPalette,
  // Type, pairing A (plan item 8.2): text in IBM Plex Sans, headings in Oxanium.
  // MUI's caption and overline are 12 px, its smallest, which keeps to the
  // 11 px floor.
  typography: {
    fontFamily: FONTS.text,
    h1: { fontFamily: FONTS.display },
    h2: { fontFamily: FONTS.display },
    h3: { fontFamily: FONTS.display },
    h4: { fontFamily: FONTS.display },
    h5: { fontFamily: FONTS.display },
    h6: { fontFamily: FONTS.display },
  },
});
