import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  TextField,
  Button,
  Stack,
  Divider,
  Slider,
  Switch,
  FormControlLabel
} from '@mui/material';
import { useCorrelation } from '../state/CorrelationContext';
import { useFilter } from '../state/FilterContext';
import { useBoards } from '../state/BoardsContext';
import { useIntelWorkspace } from '../../../services/intel/IntelWorkspaceContext';
import { adaptWorkspaceToEvents, placedByWritten } from '../adapters/eventsAdapter';
import { placedByWrittenTime } from '../../../services/epistemic/epistemicLanguage';
import { formatUtcWindow, localWindowTitle } from '../../../utils/utcTime';
import { utcMoment } from '../../../utils/eventTime';

/** A moment as the UTC date and time fields show it. */
const utcFields = (at: Date): { date: string; time: string } => {
  const iso = at.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

/** How the four time range fields look. */
const timeFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    '& fieldset': { borderColor: 'rgba(0, 191, 255, 0.3)' },
    '&:hover fieldset': { borderColor: 'rgba(0, 191, 255, 0.6)' },
    '&.Mui-focused fieldset': { borderColor: '#00bfff' },
  },
  // The browser's own calendar and clock icons, drawn for a dark ground.
  '& .MuiInputBase-input': { color: 'white', colorScheme: 'dark' },
};

/**
 * FilterPanel - Left rail component for filters
 *
 * Provides UI for setting filters with chips display
 */

const FilterPanel: React.FC = () => {
  const { filters, updateFilter, clearFilters } = useFilter();
  const { showClusters, setShowClusters } = useCorrelation();
  const { boards, activeBoardId, addWatchTag, removeWatchTag, addWatchEntity, removeWatchEntity } = useBoards();
  const activeBoard = React.useMemo(() => boards.find(b => b.id === activeBoardId) || null, [boards, activeBoardId]);
  // The records a time range judges, to say how many it places by when they were written (decision D-E).
  const { reports, intelItems } = useIntelWorkspace();
  const workspaceEvents = React.useMemo(() => adaptWorkspaceToEvents(reports, intelItems), [reports, intelItems]);
  const placedByWrittenCount = placedByWritten(workspaceEvents);

  // The time range as typed, in UTC marked Z, with the local time beside it
  // (decision D-E). The fields took the browser's local time, with no zone shown.
  const [startDate, setStartDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const showRange = (start: Date, end: Date) => {
    const from = utcFields(start);
    const to = utcFields(end);
    setStartDate(from.date);
    setStartTime(from.time);
    setEndDate(to.date);
    setEndTime(to.time);
  };
  // Local state for confidence slider (0-100)
  const [confRange, setConfRange] = useState<[number, number]>([0, 100]);

  // A range set anywhere, by the timeline's brush, a board or the globe, shows in the fields.
  useEffect(() => {
    if (filters.timeRange) {
      showRange(filters.timeRange.start, filters.timeRange.end);
    } else {
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
    }
  }, [filters.timeRange]);

  // Sync local confidence when external filter changes
  useEffect(() => {
    if (filters.confidence) {
      setConfRange([
        Math.round((filters.confidence.min ?? 0) * 100),
        Math.round((filters.confidence.max ?? 1) * 100)
      ]);
    } else {
      setConfRange([0, 100]);
    }
  }, [filters.confidence]);

  // A date without a time is the start of that UTC day, as in the report composer.
  const moment = (date: string, time: string) => (date ? utcMoment(date, time) : null);
  const rangeStart = moment(startDate, startTime);
  const rangeEnd = moment(endDate, endTime);
  const timeValid = rangeStart !== null && rangeEnd !== null && rangeStart <= rangeEnd;

  const applyTimeRange = () => {
    if (timeValid && rangeStart !== null && rangeEnd !== null) {
      updateFilter('timeRange', { start: new Date(rangeStart), end: new Date(rangeEnd) });
    }
  };

  const clearTimeRange = () => {
    updateFilter('timeRange', undefined);
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
  };

  const setPreset = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    showRange(start, end);
    updateFilter('timeRange', { start, end });
  };

  const handleTagAdd = (tag: string) => {
    if (tag.trim()) {
      const currentTags = filters.tags || [];
      if (!currentTags.includes(tag.trim())) {
        updateFilter('tags', [...currentTags, tag.trim()]);
      }
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    const currentTags = filters.tags || [];
    updateFilter('tags', currentTags.filter(tag => tag !== tagToRemove));
  };

  const handleCategoryAdd = (category: string) => {
    if (category.trim()) {
      const currentCategories = filters.categories || [];
      if (!currentCategories.includes(category.trim())) {
        updateFilter('categories', [...currentCategories, category.trim()]);
      }
    }
  };

  const handleCategoryRemove = (categoryToRemove: string) => {
    const currentCategories = filters.categories || [];
    updateFilter('categories', currentCategories.filter(cat => cat !== categoryToRemove));
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" component="h2" sx={{ color: '#00ff41', mb: 2 }}>
        Filters
      </Typography>

      {/* Time Range Controls */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
          Time Range
        </Typography>
        <Stack direction="column" spacing={1} sx={{ mb: 1 }}>
          {([
            ['Start', startDate, setStartDate, startTime, setStartTime],
            ['End', endDate, setEndDate, endTime, setEndTime],
          ] as const).map(([edge, date, setDate, time, setTime]) => (
            <Stack key={edge} direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {/* Each field keeps the width its value needs, and the row wraps, as in the
                  report composer. Squeezed onto one row, a UTC time of 19:07 read "07:07":
                  the browser draws it as "07:07 PM" and the PM was cut off. */}
              <TextField
                label={`${edge} date`}
                type="date"
                size="small"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                inputProps={{ 'aria-label': `${edge} date (UTC)` }}
                InputLabelProps={{ shrink: true }}
                sx={{ ...timeFieldSx, flex: '1 1 150px' }}
              />
              <Stack direction="row" alignItems="center" sx={{ flex: '0 0 auto', gap: 0.5 }}>
                <TextField
                  label="Time"
                  type="time"
                  size="small"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  inputProps={{ 'aria-label': `${edge} time (UTC)` }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ ...timeFieldSx, width: 140 }}
                />
                <Typography variant="caption" sx={{ color: '#00bfff' }}>Z</Typography>
              </Stack>
            </Stack>
          ))}
          {rangeStart !== null && rangeEnd !== null && (
            <Typography variant="caption" data-testid="time-range-local" sx={{ color: 'rgba(200, 220, 240, 0.85)' }}>
              {localWindowTitle(rangeStart, rangeEnd)}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              data-testid="apply-time-range"
              onClick={applyTimeRange}
              disabled={!timeValid}
            >
              Apply
            </Button>
            <Button variant="outlined" size="small" onClick={() => setPreset(24)}>
              Last 24h
            </Button>
            <Button variant="outlined" size="small" onClick={() => setPreset(24 * 7)}>
              Last 7d
            </Button>
            <Button variant="text" size="small" color="error" onClick={clearTimeRange}>
              Clear
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Time Range Display */}
      {filters.timeRange && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
            Time Range
          </Typography>
          <Chip
            label={formatUtcWindow(filters.timeRange.start.getTime(), filters.timeRange.end.getTime())}
            title={localWindowTitle(filters.timeRange.start.getTime(), filters.timeRange.end.getTime())}
            onDelete={() => updateFilter('timeRange', undefined)}
            sx={{
              backgroundColor: 'rgba(0, 191, 255, 0.2)',
              color: '#00bfff',
              border: '1px solid rgba(0, 191, 255, 0.3)',
              mb: 1
            }}
          />
          {placedByWrittenCount > 0 && (
            <Typography variant="caption" data-testid="time-range-placed-by-written" sx={{ display: 'block', color: 'rgba(200, 220, 240, 0.85)' }}>
              {placedByWrittenTime(placedByWrittenCount, workspaceEvents.length, 'record').text}
            </Typography>
          )}
        </Box>
      )}

      {/* Categories */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
          Categories
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
          {(filters.categories || []).map((category, index) => (
            <Chip
              key={index}
              label={category}
              onDelete={() => handleCategoryRemove(category)}
              size="small"
              sx={{
                backgroundColor: 'rgba(0, 255, 65, 0.2)',
                color: '#00ff41',
                border: '1px solid rgba(0, 255, 65, 0.3)'
              }}
            />
          ))}
        </Stack>
        <TextField
          size="small"
          placeholder="Add category..."
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleCategoryAdd((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '& fieldset': {
                borderColor: 'rgba(0, 255, 65, 0.3)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(0, 255, 65, 0.6)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#00ff41',
              },
            },
            '& .MuiInputBase-input': {
              color: 'white',
            },
          }}
        />
      </Box>

      <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }} />
      {/* Watchlists */}
      <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>Watchlist</Typography>
      {/* A watchlist belongs to a board; with none open, what was typed went nowhere. */}
      {!activeBoardId && (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 1 }}>
          Open or create a board to keep a watchlist.
        </Typography>
      )}
      {/* Tags */}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        {(activeBoard?.state.watch?.tags ?? []).map((tag) => (
          <Chip key={`wt-${tag}`} label={`#${tag}`} size="small" onDelete={() => removeWatchTag(tag)} sx={{ backgroundColor:'rgba(255,170,0,0.2)', color:'#ffaa00', border:'1px solid rgba(255,170,0,0.3)'}} />
        ))}
      </Stack>
      <TextField
        size="small"
        placeholder="Add tag to watch…"
        disabled={!activeBoardId}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) addWatchTag(v);
            (e.target as HTMLInputElement).value = '';
          }
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            '& fieldset': { borderColor: 'rgba(255, 170, 0, 0.3)' },
            '&:hover fieldset': { borderColor: 'rgba(255, 170, 0, 0.6)' },
            '&.Mui-focused fieldset': { borderColor: '#ffaa00' },
          },
          '& .MuiInputBase-input': { color: 'white' },
        }}
      />
      {/* Entities */}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, mb: 1 }}>
        {(activeBoard?.state.watch?.entities ?? []).map((id) => (
          <Chip key={`we-${id}`} label={id} size="small" onDelete={() => removeWatchEntity(id)} sx={{ backgroundColor:'rgba(155,89,182,0.2)', color:'#9c27b0', border:'1px solid rgba(155,89,182,0.3)'}} />
        ))}
      </Stack>
      <TextField
        size="small"
        placeholder="Add entity id to watch…"
        disabled={!activeBoardId}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) addWatchEntity(v);
            (e.target as HTMLInputElement).value = '';
          }
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            '& fieldset': { borderColor: 'rgba(155, 89, 182, 0.3)' },
            '&:hover fieldset': { borderColor: 'rgba(155, 89, 182, 0.6)' },
            '&.Mui-focused fieldset': { borderColor: '#9c27b0' },
          },
          '& .MuiInputBase-input': { color: 'white' },
        }}
      />
      <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

      {/* Place. The map view draws the area; this says one is set, and clears it.
          It offered "Add placeholder geo area", a fixed triangle over San
          Francisco that the map's Clear could not remove (critique audit of
          2026-10-01, section 8). */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
          Place
        </Typography>
        {filters.geo ? (
          <Chip
            label="Area drawn on the map"
            onDelete={() => updateFilter('geo', undefined)}
            sx={{
              backgroundColor: 'rgba(0, 191, 255, 0.2)',
              color: '#00bfff',
              border: '1px solid rgba(0, 191, 255, 0.3)',
              mb: 1
            }}
          />
        ) : (
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Draw an area in the map view to filter by place.
          </Typography>
        )}
      </Box>

      {/* Tags */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
          Tags
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
          {(filters.tags || []).map((tag, index) => (
            <Chip
              key={index}
              label={tag}
              onDelete={() => handleTagRemove(tag)}
              size="small"
              sx={{
                backgroundColor: 'rgba(255, 170, 0, 0.2)',
                color: '#ffaa00',
                border: '1px solid rgba(255, 170, 0, 0.3)'
              }}
            />
          ))}
        </Stack>
        <TextField
          size="small"
          placeholder="Add tag..."
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleTagAdd((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '& fieldset': {
                borderColor: 'rgba(255, 170, 0, 0.3)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255, 170, 0, 0.6)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#ffaa00',
              },
            },
            '& .MuiInputBase-input': {
              color: 'white',
            },
          }}
        />
      </Box>

      {/* Confidence Range */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
          Confidence
        </Typography>
        <Slider
          value={confRange}
          min={0}
          max={100}
          onChange={(_, value) => {
            if (Array.isArray(value)) setConfRange([value[0], value[1]] as [number, number]);
          }}
          valueLabelDisplay="auto"
          getAriaValueText={(v) => `${v}%`}
          valueLabelFormat={(v) => `${v}%`}
          sx={{
            color: '#ff4444',
            '& .MuiSlider-thumb': { boxShadow: 'none' }
          }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => updateFilter('confidence', { min: confRange[0] / 100, max: confRange[1] / 100 })}
          >
            Apply
          </Button>
          <Button
            variant="text"
            color="error"
            size="small"
            onClick={() => updateFilter('confidence', undefined)}
          >
            Clear
          </Button>
          <Chip
            label={`${confRange[0]}% - ${confRange[1]}%`}
            size="small"
            sx={{
              backgroundColor: 'rgba(255, 68, 68, 0.2)',
              color: '#ff4444',
              border: '1px solid rgba(255, 68, 68, 0.3)'
            }}
          />
        </Stack>
      </Box>

      {/* Clear Filters */}
      <Button
        variant="outlined"
        onClick={clearFilters}
        sx={{
          mt: 2,
          color: '#ff4444',
          borderColor: 'rgba(255, 68, 68, 0.5)',
          '&:hover': {
            borderColor: '#ff4444',
            backgroundColor: 'rgba(255, 68, 68, 0.1)'
          }
        }}
      >
        Clear All Filters
      </Button>

      <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }} />
      {/* Correlation Tools */}
      <Typography variant="subtitle2" component="span" sx={{ color: '#00bfff', mb: 1 }}>
        Correlation
      </Typography>
      <FormControlLabel
        control={<Switch color="success" checked={showClusters} onChange={(_, v) => setShowClusters(v)} />}
        label="Show clusters"
      />
    </Box>
  );
};

export default FilterPanel;
