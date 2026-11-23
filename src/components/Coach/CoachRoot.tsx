import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Docked } from '../Dock/Docked';
import { Box, Button, Paper, Popper, Stack, Typography } from '@mui/material';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { APPLICATIONS, type ApplicationId, type ApplicationContext } from '../Router/EnhancedApplicationRouter';
import WhatIs from '../Help/WhatIs';
import { COACH_STEPS, nextCoachStep } from './coachSteps';
import { coachIsOn, onCoach, stopCoach } from './coachOpen';
import { useCoachRecords } from './useCoachRecords';

/** Above dialogs, since a step's control is often in one. */
const Z = 1600;
const POLL_MS = 400;

/** The first of these controls on screen, deepest first, and where it is. */
function useAnchor(anchors: string[]): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const key = anchors.join('|');
  useEffect(() => {
    if (!key) { setEl(null); return; }
    const find = () => {
      for (const anchor of key.split('|')) {
        const selector = anchor.endsWith('*') ? `[data-testid^="${anchor.slice(0, -1)}"]` : `[data-testid="${anchor}"]`;
        // A control that is hidden, or behind a closed tab, measures nothing.
        const found = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (found) return found;
      }
      return null;
    };
    setEl(find());
    const timer = setInterval(() => setEl((prev) => { const next = find(); return next === prev ? prev : next; }), POLL_MS);
    return () => clearInterval(timer);
  }, [key]);
  return el;
}

/** A ring drawn around the control, kept on it as the page scrolls. */
const Ring: React.FC<{ el: HTMLElement }> = ({ el }) => {
  const [rect, setRect] = useState(() => el.getBoundingClientRect());
  useEffect(() => {
    const update = () => setRect(el.getBoundingClientRect());
    const timer = setInterval(update, POLL_MS);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { clearInterval(timer); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [el]);
  return createPortal(
    <Box
      data-testid="coach-ring"
      aria-hidden
      sx={{
        position: 'fixed', top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8,
        border: '2px solid #00c3db', borderRadius: 1, boxShadow: '0 0 0 4px rgba(0, 195, 219, 0.25)',
        pointerEvents: 'none', zIndex: Z,
      }}
    />,
    document.body,
  );
};

/**
 * The coach (plan item 6.1; tutorial-mode.md, option A): beside the real
 * screens, it points at the next control on the intern's own work, says in
 * plain words what to do there, and links the glossary. A step is done when
 * the real record changes, so it cannot be clicked through and cannot drift
 * from what the app does; guard-coach-anchors.mjs fails the build when a
 * control it points at goes. It seeds nothing, and publishing stays the
 * person's own choice, made in the publish review.
 */
const CoachRoot: React.FC = () => {
  const [on, setOn] = useState(coachIsOn);
  useEffect(() => onCoach(setOn), []);
  const records = useCoachRecords(on);
  const step = records ? nextCoachStep(records) : null;
  const anchor = useAnchor(on && step ? step.anchors : []);
  const { navigateToApp } = useApplicationRouter();

  if (!on || !records) return null;

  const card = (content: React.ReactNode) => (
    <Paper data-testid="coach" elevation={8} sx={{ p: 2, maxWidth: 340, border: 1, borderColor: '#00c3db', bgcolor: '#1c262a', color: '#e6f3f5' }}>
      {content}
    </Paper>
  );

  // With nothing on screen to point at, the card docks in the bottom-right corner (K16):
  // fixed at bottom 88 it sat on the right rail, the Layers button and the scrubber.
  if (!step) {
    return (
      <Docked slot="coach">
        {card(
          <Stack spacing={1}>
            <Typography variant="subtitle2">You have been through the whole pipeline</Typography>
            <Typography variant="body2">A report, a case with a position, a mission, and a package published. The coach steps aside.</Typography>
            <Box><Button size="small" variant="contained" onClick={stopCoach}>Done</Button></Box>
          </Stack>,
        )}
      </Docked>
    );
  }

  const at = COACH_STEPS.indexOf(step);
  const app = APPLICATIONS.find((a) => a.id === step.app);
  const body = card(
    <Stack spacing={1}>
      <Typography variant="caption" sx={{ color: '#00c3db' }}>Coach · Step {at + 1} of {COACH_STEPS.length}</Typography>
      <Typography variant="subtitle2">{step.title}</Typography>
      <Typography variant="body2">
        {step.words}
        {step.term && <WhatIs term={step.term} />}
      </Typography>
      <Stack direction="row" spacing={1}>
        {!anchor && app && (
          <Button size="small" variant="contained" onClick={() => navigateToApp(step.app as ApplicationId, undefined, step.context as ApplicationContext | undefined)}>
            Go to {app.name}
          </Button>
        )}
        <Button size="small" onClick={stopCoach} sx={{ color: '#9fb5ba' }}>Stop coaching</Button>
      </Stack>
    </Stack>,
  );

  if (anchor) {
    return (
      <>
        <Ring el={anchor} />
        <Popper open anchorEl={anchor} placement="bottom-start" sx={{ zIndex: Z }} modifiers={[{ name: 'offset', options: { offset: [0, 10] } }, { name: 'flip', enabled: true }, { name: 'preventOverflow', options: { padding: 8 } }]}>
          {body}
        </Popper>
      </>
    );
  }
  return <Docked slot="coach">{body}</Docked>;
};

export default CoachRoot;
