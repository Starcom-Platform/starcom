/**
 * What other nodes published, as they published it.
 *
 * The receiver already did the hard part. MissionPackageIngest checks the
 * event signature, the publisher's admission, the manifest signature and the
 * boundary rules, and useReceivedPackages holds every accepted package with
 * its verified manifest. This panel rendered only the COUNT — "1 Mission
 * Package received and verified from 1 node" — so an operator could see that
 * something arrived and never what it was, who sent it, or what it said. The
 * pipeline was complete except its last view.
 *
 * Three things this must not do, and each is about not laundering a foreign
 * claim into a local fact:
 *
 *   A manifest's `author` is a string the publisher chose, carried inside the
 *   content it signed. The verified fact is the KEY that signed the event. So
 *   the author is shown as what the package says of itself, beside the signing
 *   key, and never as its identity.
 *
 *   `createdAt` is the publisher's stated time. The receiver does not record
 *   when a package arrived, so no arrival time is shown: inventing one would
 *   be the `Date.now()` substitution this project already took out of the
 *   globe's intel (D-F 15). If arrival time is wanted, the ingest has to
 *   record it — that is a change there, not a formatting choice here.
 *
 *   These are not records in this workspace. Nothing here takes a package in,
 *   because whether a foreign mission means anything locally is a trust
 *   question to answer explicitly (see useReceivedPackages). The one thing
 *   written is a person's own decision to take on one of its asks, kept on
 *   this device (takenAsks, plan item 2.6).
 *
 * Refusals are listed beside acceptances for the reason the hook already gives:
 * a receiver that shows only what it accepted cannot tell an empty network from
 * one it is refusing wholesale, and the second is far more interesting.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, List, ListItem, ListItemText, Stack, Typography,
} from '@mui/material';
import type { ObjectiveAsk } from '../../../services/exchange/types';
import { takenAsks, type PackageRef } from '../../../services/intel/received/takenAsks';
import type { AcceptedPackage, RefusedPackage } from '../../../services/intel/MissionPackageIngest';
import type { ReceivedPackages } from '../../../services/intel/useReceivedPackages';
import DistributionChip from '../../../components/Shared/DistributionChip';
import ProvenanceFrame from '../../../components/Shared/ProvenanceFrame';
import { packageProvenance } from '../../../services/intel/provenance/provenance';
import { isOwnKey, keysNamed } from '../../../services/identity/names';
import { isInformationVisibility } from '../../../types/intel/IntelItemUI';
import { useShowOnGlobe } from '../../../hooks/useShowOnGlobe';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import { localTitleIn, utcDateTimeIn } from '../../../i18n/app/dates';
import type { LanguageId } from '../../../i18n/app/languages';
import type { Messages } from '../../../i18n/app/en';

/** The words this panel says, and the language they are in (D-ML, L3). */
interface Said { lang: LanguageId; t: Messages['missionParts']; local: string; psiWords: Messages['psiWatch']['missions'] }
const useSaid = (): Said => {
  const { lang, m } = useMessages();
  return { lang, t: m.missionParts, local: m.time.local, psiWords: m.psiWatch.missions };
};
import KeyName from '../../../components/Identity/KeyName';
import FieldGate from '../../../components/Fieldwork/FieldGate';
import { missionCardOf } from '../../../services/intel/received/missionCard';
import { takenMissions, takeInputOf } from '../../../services/intel/received/takenMissions';
import { coordinateFor } from '../../../services/intel/missionPackageThread';
import { statedProfile, profileWords, takingPartOf } from '../../../services/intel/packageProfile';
import { useMissionLabels, type MissionLabels } from '../../../services/intel/useMissionLabels';
import PackageClaims from './PackageClaims';
import MissionCards from './MissionCards';
import TakeMission from './TakeMission';
import { RestsOn } from '../../../components/Intel/RestsOn';
import { citationsFromTags } from '../../../services/intel/citations';
import { packageSourceLinks } from '../../../services/intel/sourceLinks';
import SourceLinks from '../../../components/Intel/SourceLinks';
import ReviewsPanel from '../../../components/Reviews/ReviewsPanel';
import { receivedPackageReviewTarget } from '../../../services/reviews/reviewTargets';
import type { PsiMission } from '../../../services/psiWatch/missions/psiMissions';
import PsiMissionFacts from '../../../components/PsiWatch/PsiMissionFacts';
import PsiMissionsList from './PsiMissionsList';
import { usePsiMissions } from '../../../components/PsiWatch/usePsiMissions';
import { useGoToPsiMissionPeak } from './useGoToPsiMissionPeak';
import { SafetyNight911, SafetyNightAfter, SafetyNightChecklists, SafetyNightTop } from './SafetyNight';
import { packageWindowOf } from '../../../services/rlsh/recurrence/recurrencePackage';
import { useRlshItems } from '../../../services/rlsh/recurrence/useRlshItems';
import { rlshKitSamplesOn } from '../../../services/rlsh/recurrence/rlshKit';
import { KIT_RELAY } from '../../../services/psiWatch/missions/psiMissions';
import RlshSamplesList from './RlshSamplesList';


/** The relay without its scheme, which is noise in a list; the full url is the hover. */
const relayName = (relay: string): string => relay.replace(/^wss?:\/\//, '').replace(/\/+$/, '');

/** A refusal code as prose, without pretending to know more than the code says. */
const refusalText = (code: string): string => code.replace(/-/g, ' ');

const statedTime = (iso: string | undefined, { lang, t, local }: Said): { text: string; title?: string } => {
  if (!iso) return { text: t.notStated.time };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { text: t.notStated.readableTime };
  return { text: fill(t.stated, { when: utcDateTimeIn(lang, ms, true) }), title: localTitleIn(lang, ms, local) };
};

/**
 * What an operator can DO about a package another node published: take on one
 * of its asks (below), reply or review it, and open a case about it.
 *
 * The omissions are the design.
 * There is no "accept", no "import", and no acknowledgement written anywhere:
 * a verified package is a true statement BY THAT NODE, and what it means here
 * is a trust question this receiver deliberately refuses to answer by writing
 * to storage (see useReceivedPackages). A case is the opposite of that — our
 * record, opened by a person, citing their statement.
 *
 * The provenance travels with it. A case about a foreign record that does not
 * say which node said it, over which relay, and when, has lost the only things
 * that make it checkable later.
 */
const caseNoteFor = (pkg: AcceptedPackage, said: Said): string => {
  const { t } = said;
  const manifest = pkg.check.manifest;
  const time = statedTime(manifest?.createdAt, said);
  const name = manifest?.name || t.notStated.name;
  return [
    t.caseNote.opened,
    ``,
    fill(t.caseNote.signedBy, { key: pkg.event.pubkey }),
    fill(t.caseNote.over, { relay: relayName(pkg.relay) }),
    fill(t.caseNote.saysFrom, { author: manifest?.author || t.notStated.author }),
    fill(t.caseNote.published, { time: time.text }),
    manifest?.version ? fill(t.caseNote.packageVersion, { name, version: manifest.version }) : fill(t.caseNote.package, { name }),
    ``,
    t.caseNote.description,
    manifest?.description || t.notStated.description,
  ].join('\n');
};

/** Minutes as a person says them. */
const effortText = (minutes: number, t: Said['t']): string => {
  if (minutes < 60) return fill(t.aboutMinutes, { m: minutes });
  const rest = minutes % 60;
  return rest ? fill(t.aboutHoursMinutes, { h: Math.floor(minutes / 60), m: rest }) : fill(t.aboutHours, { h: Math.floor(minutes / 60) });
};

/**
 * An ask's limits as written. The interchange says they are what the doer must
 * not do, and a list of things not to do reads as one: "not to: stay outside
 * the fence". Mecha Jono writes them as rules to keep, in whole sentences
 * ("Work in pairs. Never confront anyone…"), which "not to:" turned into their
 * opposite; those are said as limits.
 */
const limitsText = (limits: string[], t: Said['t']): string => (limits.every((limit) => /[.!?]$/.test(limit.trim()))
  ? fill(t.limitsAs, { limits: limits.join(' ') })
  : fill(t.notTo, { limits: limits.join('; ') }));

/** Whether a package is one of Mecha Jono's field missions (decision D-HW). */
const isFieldMission = (pkg: AcceptedPackage): boolean => pkg.event.tags.some((t) => t[0] === 't' && t[1] === 'field_mission');

/** A field mission's safety limits: the package's own, or else every ask's, each said once. */
function fieldMissionLimits(manifest: NonNullable<AcceptedPackage['check']['manifest']>): string | null {
  const own = (manifest.metadata as { mechaJono?: { format?: { limits?: unknown } } } | undefined)?.mechaJono?.format?.limits;
  if (typeof own === 'string' && own.trim()) return own.trim();
  const fromAsks = [...new Set((manifest.objectives ?? []).flatMap((ask) => ask.limits ?? []))];
  return fromAsks.length ? fromAsks.join(' ') : null;
}

/**
 * One piece of work the package asks for (plan item 2.6), with what the sender
 * said of it. A mission is taken whole now (D-MF, MF10); an ask taken on its own
 * before that stays taken, in the attention queue, and can still be let go.
 * A field mission's ask carries no limits of its own: they are said once above it.
 */
const AskItem: React.FC<{ from: PackageRef; ask: ObjectiveAsk; fieldMission?: boolean }> = ({ from, ask, fieldMission = false }) => {
  const { lang, t } = useSaid();
  const taken = takenAsks.get(from, ask);
  const said = [
    ask.handsBack && fill(t.handsBackAsk, { what: ask.handsBack }),
    ask.effortMinutes !== undefined && effortText(ask.effortMinutes, t),
    ask.for && fill(t.forAsk, { who: ask.for }),
    !fieldMission && ask.limits?.length && limitsText(ask.limits, t),
  ].filter(Boolean).join(' · ');
  return (
    <Box data-testid="received-ask" sx={{ py: 0.75 }}>
      <Typography variant="body2">{ask.ask}</Typography>
      {said && <Typography variant="caption" color="text.secondary" component="div">{said}</Typography>}
      {ask.done ? (
        <Typography variant="caption" color="text.secondary" component="div">{t.doneSender}</Typography>
      ) : taken ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          <Typography variant="caption" component="span">
            {fill(t.tookOn, { when: utcDateTimeIn(lang, Date.parse(taken.takenAt), true) })}
          </Typography>
          <Button size="small" onClick={() => takenAsks.release(from, ask)}>{t.letGo}</Button>
        </Stack>
      ) : null}
    </Box>
  );
};

/** The address a package is replaced at and labelled by: kind, signer and its `d`. Empty when it has no `d`. */
function coordinateOf(pkg: AcceptedPackage): string {
  const identifier = pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  return identifier ? coordinateFor(pkg.event.pubkey, identifier) : '';
}

/** A mission in full, with "Take this mission": here, and from the globe's Missions mode (D-MF, step 5). */
/**
 * A psi mission's own part of its card (decision D-PW, PW91–PW92): the mission, and what "Go to the peak" does where
 * the card is shown.
 */
export interface PsiPart {
  mission: PsiMission;
  goToPeak: () => void;
  goToPeakTitle?: string;
}

export const PackageDetail: React.FC<{ pkg: AcceptedPackage; onClose: () => void; labels: MissionLabels; psi?: PsiPart }> = ({ pkg, onClose, labels, psi }) => {
  const said = useSaid();
  const { m } = useMessages();
  // The kit's sample is no package anyone signed: nothing to review, nothing a key published.
  const sample = psi?.mission.sample === true || pkg.relay === KIT_RELAY;
  // A field package with a window (D-RR): the field variant, in the kit's order (RR2).
  const night = packageWindowOf(pkg.check.manifest) !== null;
  const nightEnded = night && pkg.event.tags.some((x) => x[0] === 'mission_state' && x[1] === 'closed');
  const rlsh = useRlshItems(night && rlshKitSamplesOn(), night);
  const { lang, t } = said;
  const manifest = pkg.check.manifest;
  const time = statedTime(manifest?.createdAt, said);
  const { navigateToApp } = useApplicationRouter();
  const showOnGlobe = useShowOnGlobe();
  const reviewTarget = sample ? null : receivedPackageReviewTarget(pkg);
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  // Taking an ask on or letting it go redraws the asks.
  const [, setVersion] = useState(0);
  useEffect(() => takenAsks.subscribe(() => setVersion((v) => v + 1)), []);
  const from: PackageRef | null = manifest
    ? { signer: pkg.event.pubkey, packageId: manifest.id, packageName: manifest.name || t.notStated.name, relay: pkg.relay }
    : null;
  const cites = useMemo(() => citationsFromTags(pkg.event.tags), [pkg.event.tags]);
  // Where it rests, to follow (D-CT, CT2): its event's r tags, else the source its manifest names.
  const sources = useMemo(() => packageSourceLinks(pkg.event.tags, manifest), [pkg.event.tags, manifest]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="received-package-detail">
      <DialogTitle sx={{ pb: 0.5 }}>
        {manifest?.name || t.notStated.name}
        {/* A psi mission: the one badge, small, once (PW34, PW91). */}
        {psi && <Chip size="small" variant="outlined" label={m.psiWatch.panel.experimental} sx={{ ml: 1, verticalAlign: 'middle' }} data-testid="received-psi-badge" />}
        <Typography variant="caption" color="text.secondary" component="div">{t.notRecord}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {!manifest ? (
          // The type allows it, so it is said rather than crashed on.
          <Typography variant="body2">{t.noManifest}</Typography>
        ) : (
          <Stack spacing={1.5}>
            {/* The 911 card above everything, then the night's line, state, end, window, score line and Case (D-RR). */}
            {night && <SafetyNight911 />}
            {night && <SafetyNightTop pkg={pkg} held={rlsh} />}

            {/* A night's description repeats its mission line and score line, which the kit shows once; its why is the Case's (D-RR). */}
            {!night && <Typography variant="body2">{manifest.description || t.notStated.description}</Typography>}

            {/* A psi mission's window, where the cursor stands against it, its places and sources (PW91, PW92). */}
            {psi && <PsiMissionFacts mission={psi.mission} onGoToPeak={psi.goToPeak} goToPeakTitle={psi.goToPeakTitle} sampleSaid />}

            {/* Taking it on, whole: its limits agreed first, kept on this device (D-MF, MF7–MF10). A field mission
                passes the gate first: the age question, the warning, a parent for 13 to 17 (D-RS, RS47). */}
            {/* An ended night offers nothing (D-RR). */}
            {!nightEnded && (
              <FieldGate field={missionCardOf(pkg).where === 'field' && !takenMissions.isTaken(takeInputOf(pkg).key)}>
                <TakeMission pkg={pkg} />
              </FieldGate>
            )}

            {/* What it states to NavCom, and who has publicly taken it up (D-MX: MX1, MX2). A night's shows no claim
                count, list or map: who took part is counted only after its window closes (D-RR, kit 5.6). */}
            <Box data-testid="received-for-navcom">
              {profileWords(statedProfile(pkg.event, manifest.profile), lang, t.profile) && (
                <Typography variant="body2" data-testid="received-profile">{profileWords(statedProfile(pkg.event, manifest.profile), lang, t.profile)}</Typography>
              )}
              {!night && coordinateOf(pkg) && <PackageClaims claims={labels.claims(coordinateOf(pkg))} answered={labels.answered} takingPart={takingPartOf(pkg.event)} testId="received-claims" />}
            </Box>

            {/* Where its information was published, the original first (D-CT, CT2; Interchange 3.19). */}
            {sources.length > 0 && <SourceLinks links={sources} testId="received-sources" />}

            {/* The observations its event cites, each as read here (D-MX: MX3, MX23). */}
            {cites.length > 0 && (
              <Box data-testid="received-rests-on">
                <Typography variant="caption" color="text.secondary" component="div">{t.restsOnHeading}</Typography>
                <RestsOn cites={cites} />
              </Box>
            )}

            {/*
              * A field mission (D-HW, HW7): its safety limits said once, before what
              * it asks. Taking it keeps it here (D-MF, MF7–MF9); reporting back would
              * send something, and that comes later, through the publish review.
              */}
            {isFieldMission(pkg) && (
              <Box data-testid="received-field-mission">
                <Typography variant="caption" color="text.secondary" component="div">{t.safetyLimits}</Typography>
                <Typography variant="body2" data-testid="received-safety-limits">
                  {fieldMissionLimits(manifest) ?? t.limitsNotStated}
                </Typography>
              </Box>
            )}

            {/* A night's asks in its three checklists, and the topics to look up; after the night, its totals and
                who took part (D-RR). */}
            {night && <SafetyNightChecklists pkg={pkg} />}
            {night && <SafetyNightAfter pkg={pkg} held={rlsh} sample={sample} />}

            {/* What it asks for, each to take on here (plan item 2.6). */}
            {!night && <Box data-testid="received-asks">
              <Typography variant="caption" color="text.secondary" component="div">{t.whatItAsks}</Typography>
              {manifest.objectives?.length && from ? (
                manifest.objectives.map((ask) => <AskItem key={ask.id} from={from} ask={ask} fieldMission={isFieldMission(pkg)} />)
              ) : (
                <Typography variant="body2">{t.asksNothing}</Typography>
              )}
            </Box>}

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary" component="div">{t.signedBy}</Typography>
              {/* The verified fact: a name learned for this key, and the key
                  itself, short, with all of it on hover (plan item 2.1). */}
              <Typography variant="body2" sx={{ fontFamily: 'var(--sc-font-data)', wordBreak: 'break-all' }}>
                <KeyName pubkey={pkg.event.pubkey} showKey />
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                {sample ? (psi ? m.psiWatch.missions.sample : m.missionParts.safetyNight.sample) : t.verified}
              </Typography>
            </Box>

            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">{t.saysFrom}</Typography>
                <ProvenanceFrame provenance={packageProvenance({ claims: manifest.author, signedBy: pkg.event.pubkey }, isOwnKey, keysNamed)}>
                  <Typography variant="body2" component="span">{manifest.author || t.notStated.author}</Typography>
                </ProvenanceFrame>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">{t.published}</Typography>
                <Typography variant="body2" title={time.title}>{time.text}</Typography>
              </Box>
            </Stack>

            {/* Reply, or say what you make of it: a comment or a verdict on this version (plan item 5.1). */}
            {reviewTarget && (
              <>
                <Divider />
                <ReviewsPanel target={reviewTarget} itemTitle={manifest.name} testId="received-package-reviews" />
              </>
            )}

            {/* The rest as published, for whoever checks it: kept out of the way (plan item 2.6). */}
            <Box>
              <Button size="small" onClick={() => setDetails((open) => !open)} aria-expanded={details} aria-controls={detailsId}>
                {t.details}
              </Button>
              <Collapse in={details} id={detailsId} unmountOnExit>
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="caption" color="text.secondary" component="div">{t.version}</Typography>
                      <Typography variant="body2">{manifest.version || t.notStated.version}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" component="div">{t.distribution}</Typography>
                      {/* As the package states it, in the one chip (BD18); one that states none says so. */}
                      {isInformationVisibility(manifest.visibility)
                        ? <DistributionChip visibility={manifest.visibility} />
                        : <Typography variant="body2">{manifest.visibility || t.notStated.distribution}</Typography>}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" component="div">{t.licence}</Typography>
                      <Typography variant="body2">{manifest.license || t.notStated.licence}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" component="div">{t.arrivedOver}</Typography>
                      <Typography variant="body2" title={pkg.relay}>{relayName(pkg.relay)}</Typography>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography variant="caption" color="text.secondary" component="div">{t.entries}</Typography>
                    {manifest.reports.length === 0 && manifest.intel.length === 0 && manifest.assets.length === 0 ? (
                      <Typography variant="body2">{t.noEntries}</Typography>
                    ) : (
                      <List dense disablePadding>
                        {manifest.reports.map((r) => (
                          <ListItem key={`r-${r.id}`} disableGutters>
                            <ListItemText primary={r.title || t.notStated.title} secondary={t.reportEntry} />
                          </ListItem>
                        ))}
                        {manifest.intel.map((i) => (
                          <ListItem key={`i-${i.id}`} disableGutters>
                            <ListItemText primary={i.title || t.notStated.title} secondary={t.intelEntry} />
                          </ListItem>
                        ))}
                        {manifest.assets.map((a) => (
                          <ListItem key={`a-${a.filename}`} disableGutters>
                            <ListItemText primary={a.filename} secondary={fill(t.assetEntry, { n: a.size })} />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>

                  {Object.keys(manifest.metadata ?? {}).length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" component="div">{t.metadata}</Typography>
                      <List dense disablePadding>
                        {Object.entries(manifest.metadata).map(([key, value]) => (
                          <ListItem key={key} disableGutters>
                            <ListItemText
                              primary={`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Stack>
              </Collapse>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {/* On the globe (plan item 9.14, decision G6): the reports it cites, as
            its signer names them, and apart from that, what the key published.
            Starcom's own packages cite nothing (D1). */}
        {manifest && manifest.reports.length > 0 && (
          <Button
            onClick={() => {
              void showOnGlobe({ kind: 'package', id: pkg.event.id, signer: pkg.event.pubkey, name: manifest.name || t.notStated.name, cites: manifest.reports.map((r) => r.id) });
              onClose();
            }}
          >
            {t.showCites}
          </Button>
        )}
        {!sample && (
          <Button onClick={() => { void showOnGlobe({ kind: 'publisher', id: pkg.event.pubkey }); onClose(); }}>
            {t.showKey}
          </Button>
        )}
        <Button
          data-testid="open-case-about-package"
          onClick={() => {
            navigateToApp('cases', undefined, {
              openCaseAbout: manifest?.name || t.receivedPackage,
              openCaseNote: caseNoteFor(pkg, said),
            });
            onClose();
          }}
        >
          {t.openCase}
        </Button>
        <Button onClick={onClose}>{t.close}</Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * A psi mission's card in the Missions app (PW91, PW92): "Go to the peak" opens Psi Watch at it, since the Missions
 * app covers the globe and its time bar. Rendered only while open, as the card is, so the app's router is asked for
 * only where the card already asks for it.
 */
const PsiPackageDetail: React.FC<{ mission: PsiMission; labels: MissionLabels; onClose: () => void }> = ({ mission, labels, onClose }) => {
  const goToPeak = useGoToPsiMissionPeak();
  const { psiWords } = useSaid();
  return (
    <PackageDetail
      pkg={mission.pkg}
      onClose={onClose}
      labels={labels}
      psi={{ mission, goToPeak: () => { goToPeak(mission); onClose(); }, goToPeakTitle: psiWords.goToPeakTitle }}
    />
  );
};

const RefusedList: React.FC<{ refused: RefusedPackage[] }> = ({ refused }) => {
  const { t } = useSaid();
  return (
  <Box data-testid="received-refusals" sx={{ mb: 2 }}>
    <Typography variant="caption" color="text.secondary" component="div">{t.refusedWhy}</Typography>
    <List dense disablePadding>
      {refused.map((r) => (
        <ListItem key={r.eventId} disableGutters>
          <ListItemText
            primary={`${refusalText(r.code)} — ${r.reason}`}
            secondary={fillNodes(t.refusedFrom, { who: <KeyName pubkey={r.pubkey} />, relay: relayName(r.relay) })}
            slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
          />
        </ListItem>
      ))}
    </List>
  </Box>
  );
};

export const ReceivedPackagesPanel: React.FC<{ received: ReceivedPackages }> = ({ received }) => {
  const [open, setOpen] = useState<AcceptedPackage | null>(null);
  const said = useSaid();
  const { t } = said;
  const { counters, accepted, refused } = received;
  // Psi Watch's missions, from what Psi Watch holds, never the received read (PW91); none with `?psi=off`.
  const psiMissions = usePsiMissions(true);
  const [openPsi, setOpenPsi] = useState<PsiMission | null>(null);
  // NavCom's labels on what arrived (D-MX: MX1, MX5), read while it is shown.
  const labels = useMissionLabels([...accepted, ...psiMissions.filter((mission) => !mission.sample).map((mission) => mission.pkg)].map(coordinateOf));

  const psiPart = openPsi ? <PsiPackageDetail mission={openPsi} labels={labels} onClose={() => setOpenPsi(null)} /> : null;
  // The kit's sample night, only with ?rlsh=kit (D-RR, RR3).
  const rlshSamples = useRlshItems(rlshKitSamplesOn());
  const samples = rlshSamples.samples ? <RlshSamplesList held={rlshSamples} onOpen={setOpen} /> : null;

  // Nothing seen is not a state worth a panel: the network being quiet reads
  // as an empty list, which looks like a failure to show what arrived.
  if (counters.seen === 0) {
    return psiMissions.length || samples ? (
      <>
        {samples}
        {psiMissions.length > 0 && <PsiMissionsList missions={psiMissions} onOpen={setOpenPsi} />}
        {psiPart}
        {open && <PackageDetail pkg={open} onClose={() => setOpen(null)} labels={labels} />}
      </>
    ) : null;
  }

  return (
    <>
      {samples}
      {/* Psi Watch's missions, apart, under the one badge (PW91). */}
      {psiMissions.length > 0 && <PsiMissionsList missions={psiMissions} onOpen={setOpenPsi} />}

      {/* Nothing verified is a state of its own: every package refused, and why (shown below). */}
      {counters.accepted === 0 && counters.refused > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="received-nothing-verified">
          {fill(t.refused, { n: counters.refused })}
          {' ('}
          {Object.entries(counters.refusedBy).map(([code, n]) => `${n} ${refusalText(code)}`).join(', ')}
          {') — '}{t.nothingVerified}
        </Alert>
      )}

      {/* The missions as cards, each leading with what it asks (D-MF, MF1). */}
      <MissionCards
        accepted={accepted}
        onOpen={setOpen}
        claimsOf={(pkg) => labels.claims(coordinateOf(pkg)).length}
        unverified={counters.accepted > 0 ? { count: counters.refused, list: <RefusedList refused={refused} /> } : undefined}
      />

      {counters.accepted === 0 && refused.length > 0 && <RefusedList refused={refused} />}

      {open && <PackageDetail pkg={open} onClose={() => setOpen(null)} labels={labels} />}
      {psiPart}
    </>
  );
};

export default ReceivedPackagesPanel;
