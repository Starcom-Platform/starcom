/**
 * What came back.
 *
 * Starcom published Mission Packages and consumed nothing in return, so a peer
 * who read one had nowhere to put an answer. Mecha Jono's board report of
 * 2026-09-20 put that first, under "blocks the return path". This is where an
 * answer surfaces.
 *
 * ─── IT SHOWS, AND DOES NOT ACT ────────────────────────────────────────────
 *
 * No accept, no assign, no import — the same rule ReceivedPackagesPanel states
 * for foreign packages, and for the same reason. A reply is a stranger's
 * sentence about our package. Turning one into a record of ours, or into a
 * claim on an objective, is a decision with its own design; doing it as a side
 * effect of having read the reply would put an unverified stranger's words
 * into the workspace under our own name.
 *
 * ─── WHAT IT SAYS WHEN IT KNOWS NOTHING ────────────────────────────────────
 *
 * A package dispatched before coordinates were recorded cannot be watched, and
 * that is reported rather than hidden. Silence from a thread nobody is
 * listening to looks exactly like silence from a thread nobody answered, and
 * those are different facts.
 */
import React from 'react';
import { Alert, Box, Chip, List, ListItem, ListItemText, Typography } from '@mui/material';
import type { PackageReplies } from '../../../services/intel/usePackageReplies';
import { parsePackageCoordinate } from '../../../services/intel/missionPackageThread';
import UtcTime from '../../../components/Shared/UtcTime';
import KeyName from '../../../components/Identity/KeyName';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';


export const PackageRepliesPanel: React.FC<{ replies: PackageReplies }> = ({ replies }) => {
  const { replies: items, missionByCoordinate, counters, watching, unwatchable } = replies;
  const { m: { missionParts: t } } = useMessages();

  // Nothing published means nothing to hear about — not a quiet thread.
  if (watching === 0 && unwatchable === 0) return null;

  return (
    <Box sx={{ mb: 2 }} data-testid="package-replies">
      <Alert severity={items.length > 0 ? 'info' : 'success'} sx={{ mb: items.length > 0 ? 2 : 0 }}>
        {items.length > 0
          ? fill(t.repliesTo, { replies: counted(t.replies, items.length), packages: counted(t.publishedPackages, watching) })
          : fill(t.listening, { packages: counted(t.publishedPackages, watching) })}
        {counters.refused > 0 && (
          <>{' · '}<strong>{fill(t.refused, { n: counters.refused })}</strong> {t.refusedNote}</>
        )}
        {unwatchable > 0 && <>{' · '}{counted(t.unwatchable, unwatchable)}</>}
      </Alert>

      {items.length > 0 && (
        <List dense>
          {items.map((reply) => {
            const mission = missionByCoordinate.get(reply.coordinate);
            return (
              <ListItem key={`${reply.coordinate}:${reply.id}`} alignItems="flex-start" divider>
                <ListItemText
                  primary={reply.content || <em>{t.emptyReply}</em>}
                  secondaryTypographyProps={{ component: 'div' }}
                  secondary={
                    <>
                      <Typography variant="caption" color="text.secondary">
                        {/* Whose words these are: a name only if one was learned
                            for this key (plan item 2.1), never an invented one. */}
                        {fillNodes(t.replyFrom, { who: <KeyName pubkey={reply.pubkey} />, when: <UtcTime at={reply.createdAt} day />, relay: reply.relay })}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          variant="outlined"
                          /*
                           * A reply can outlive the mission it answers — one
                           * deleted here, or published by an identity this
                           * workspace no longer holds. Naming the package from
                           * its own coordinate beats "a package of ours",
                           * which tells the reader nothing they can act on.
                           */
                          label={mission
                            ? fill(t.re, { title: mission.title })
                            : parsePackageCoordinate(reply.coordinate)?.packageId
                              ? fill(t.rePackage, { id: parsePackageCoordinate(reply.coordinate)?.packageId ?? '' })
                              : t.rePackageGone}
                        />
                      </Box>
                    </>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default PackageRepliesPanel;
