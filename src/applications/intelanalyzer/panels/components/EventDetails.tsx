import React from 'react';
import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
// Each icon imported from its own subpath, not the package barrel.
// `from '@mui/icons-material'` forces Vite's dependency scan to touch the
// whole package — 10,774 files — which is what threw EMFILE under concurrent
// test forks on this machine (macOS's launchd-spawned process fd limit is
// 256, not the shell's 1,048,576). The other ~14 icon imports in this repo
// already use this form; these eight did not.
import AccessTime from '@mui/icons-material/AccessTime';
import Category from '@mui/icons-material/Category';
import Label from '@mui/icons-material/Label';
import LocationOn from '@mui/icons-material/LocationOn';
import { Event, eventRecordTime } from '../../adapters/eventsAdapter';
import { describeRecordTime } from '../../../../services/intel/recordTime';
import { useBoards } from '../../state/BoardsContext';
import { formatCoordinate } from '../../../../types/intel/SourceObservation';

export interface EventDetailsProps {
  event: Event;
  onEntityClick?: (entityId: string) => void;
}

const EventDetails: React.FC<EventDetailsProps> = ({ event, onEntityClick }) => {
  const { addWatchTag, addWatchEntity } = useBoards();
  const handleEntityClick = (id: string) => onEntityClick?.(id);
  // Which time placed the event (decision D-E): when it happened, or when its record was written.
  const time = eventRecordTime(event);
  const when = time ? describeRecordTime(time) : null;

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ color: '#00bfff', mb: 1 }}>Source</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={event.sourceType} size="small" sx={{ backgroundColor:'rgba(0,191,255,0.2)', color:'#00bfff' }} />
          <Chip label={`ID: ${event.sourceId}`} size="small" sx={{ backgroundColor:'rgba(255,255,255,0.1)', color:'white' }} />
        </Stack>
      </Box>
      <Divider sx={{ borderColor:'rgba(255,255,255,0.1)' }} />
      <Box>
        <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
          <AccessTime sx={{ mr:1, fontSize:'1rem' }} /> {when?.label ?? 'Timestamp'}
        </Typography>
        {/* A time that cannot be read is shown as it was stored, not as a date it cannot know. */}
        <Typography variant="body2" sx={{ color:'white' }}>{when?.text ?? event.timestamp}</Typography>
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
          <Category sx={{ mr:1, fontSize:'1rem' }} /> Category
        </Typography>
        <Chip label={event.category} size="small" sx={{ backgroundColor:'rgba(0,255,65,0.2)', color:'#00ff41' }} />
      </Box>
      {event.tags.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
            <Label sx={{ mr:1, fontSize:'1rem' }} /> Tags
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {event.tags.map(t => (
              <Chip
                key={t}
                label={t}
                size="small"
                onDoubleClick={() => addWatchTag(t)}
                sx={{ backgroundColor:'rgba(255,170,0,0.2)', color:'#ffaa00', cursor:'pointer' }}
              />
            ))}
          </Stack>
        </Box>
      )}
      {(event.lat || event.lon) && (
        <Box>
          <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
            <LocationOn sx={{ mr:1, fontSize:'1rem' }} /> Location
          </Typography>
          {/* At the precision its source gave, never finer: a NavCom area is ±20 km. */}
          <Typography variant="body2" sx={{ color:'white' }} data-testid="event-location">
            {formatCoordinate(event.lat, event.lon, event.geoPrecisionM, { showUncertainty: true })}
          </Typography>
        </Box>
      )}
      {event.confidence !== undefined && (
        <Box>
          <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1 }}>Confidence</Typography>
          <Typography variant="body2" sx={{ color:'white' }}>{(event.confidence * 100).toFixed(0)}%</Typography>
        </Box>
      )}
      {event.entityRefs.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ color:'#00bfff', mb:1 }}>Entities</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {event.entityRefs.map(e => (
              <Chip
                key={e}
                label={e}
                size="small"
                onClick={() => handleEntityClick(e)}
                onDoubleClick={() => addWatchEntity(e)}
                sx={{ backgroundColor:'rgba(155,89,182,0.2)', color:'#9c27b0', cursor:'pointer' }}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};

export default EventDetails;
