import React, { useState } from 'react';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';

/**
 * EntityResolutionPanel - "suggest, never silently merge" review queue.
 *
 * Surfaces fuzzy-match candidates (typos/spelling variants of the same
 * real-world entity) found by findMergeSuggestions, filtered to only
 * pairs a human hasn't already decided on. Confirm/reject just records
 * the decision via EntityAliasRegistry — nothing here merges data on
 * its own, matching the discipline the rest of the entity-resolution
 * pipeline (option A normalization, contradiction detection) follows.
 */
const EntityResolutionPanel: React.FC = () => {
  const { mergeSuggestions, confirmMergeSuggestion, rejectMergeSuggestion } = useCorrelation();
  const [expanded, setExpanded] = useState(true);

  if (mergeSuggestions.length === 0) return null;

  return (
    <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#00bfff', flex: 1 }}>
          Entity Review
        </Typography>
        <Chip
          label={mergeSuggestions.length}
          size="small"
          sx={{ backgroundColor: 'rgba(255, 170, 0, 0.2)', color: '#ffaa00', border: '1px solid rgba(255, 170, 0, 0.3)' }}
        />
        <IconButton size="small" aria-label={expanded ? 'Collapse entity review' : 'Expand entity review'} sx={{ color: '#00bfff' }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {mergeSuggestions.map(s => (
            <Box
              key={`${s.nameA}||${s.nameB}`}
              sx={{ p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1, border: '1px solid rgba(255, 255, 255, 0.1)' }}
            >
              <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                <strong>{s.nameA}</strong> ~ <strong>{s.nameB}</strong>
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Chip
                  label={`${Math.round(s.similarity * 100)}% match`}
                  size="small"
                  sx={{ backgroundColor: 'rgba(0, 191, 255, 0.15)', color: '#00bfff', fontSize: '0.7rem' }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => confirmMergeSuggestion(s.nameA, s.nameB)}
                  sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                >
                  Same entity
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={() => rejectMergeSuggestion(s.nameA, s.nameB)}
                  sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                >
                  Different
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default EntityResolutionPanel;
