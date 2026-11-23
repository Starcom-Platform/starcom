import React from 'react';
import { Box, ThemeProvider } from '@mui/material';
import { starcomTheme } from '../../styles/starcomTheme';

/**
 * MUI drawn on a dark panel that no dark theme covers: the report editor, the
 * report's detail, the globe's report popup. Under the app's light default,
 * text there came out dark grey on black (found with the stepper, plan item
 * 1.7). The app's cyan, as the EVA direction has it.
 */
// The root theme (plan items 8.1 and 8.2); it built its own copy of the palette.
const onDarkTheme = starcomTheme;

const OnDarkSurface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={onDarkTheme}>
    <Box sx={{ color: 'text.primary' }}>{children}</Box>
  </ThemeProvider>
);

export default OnDarkSurface;
