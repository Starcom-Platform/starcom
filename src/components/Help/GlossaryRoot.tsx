import React, { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import { findTerms, glossaryEntry } from '../../services/help/glossary';
import { onOpenGlossary } from './glossaryOpen';

/**
 * The glossary (plan item 3.2), opened at a word by the "?" beside it, from
 * the header's command box, or by the coach. The word asked about is shown in
 * full; the rest are a list to find and read, and each entry leads to the
 * words worth reading next.
 */
const GlossaryRoot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => onOpenGlossary((termId) => {
    setSelected(termId);
    setQuery('');
    setOpen(true);
  }), []);

  const entries = findTerms(query);
  const current = selected ? glossaryEntry(selected) : undefined;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth data-testid="glossary" aria-labelledby="glossary-title">
      <DialogTitle id="glossary-title">Glossary</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {current && (
            <Box data-testid="glossary-entry" sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="h6" component="h2">{current.term}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>{current.body}</Typography>
              {current.see && current.see.length > 0 && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                  See also:{' '}
                  {current.see.map((id, i) => (
                    <React.Fragment key={id}>
                      {i > 0 && ', '}
                      <Button size="small" sx={{ minWidth: 0, p: 0, textTransform: 'none', verticalAlign: 'baseline' }} onClick={() => setSelected(id)}>
                        {glossaryEntry(id)?.term ?? id}
                      </Button>
                    </React.Fragment>
                  ))}
                </Typography>
              )}
            </Box>
          )}
          <TextField label="Find a word" value={query} onChange={(e) => setQuery(e.target.value)} size="small" fullWidth autoFocus={!current} />
          {entries.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No word here matches "{query}".</Typography>
          ) : (
            <List dense disablePadding>
              {entries.map((entry) => (
                <ListItemButton key={entry.id} selected={entry.id === selected} onClick={() => setSelected(entry.id)} data-testid={`glossary-term-${entry.id}`}>
                  <ListItemText primary={entry.term} secondary={entry.short} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GlossaryRoot;
