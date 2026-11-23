import { createLogger } from '@utils/logger';
import React, { useState } from 'react';
import { useAttentionQueue } from '../../../services/intel/attention/useAttentionQueue';
import AttentionPanel from './AttentionPanel';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { recordTarget } from '../../../routes/recordLink';
import { reviewRetraction } from '../../../services/publishing/findings';
import type { AttentionItem } from '../../../services/intel/attention/AttentionItem';
import { setRecordDistribution } from '../../../services/intel/attention/setRecordDistribution';

/**
 * The one place the attention queue is actually mounted.
 *
 * Split from AttentionPanel so the panel stays a pure function of a snapshot —
 * and so this file is unmistakably the wiring. Four capabilities in this
 * codebase have been built, tested and then never called (see
 * scripts/guard-orphan-exports.mjs, which exists because of them); a container
 * whose only job is to be rendered makes that failure visible rather than
 * subtle.
 */
const log = createLogger({ prefix: 'Attention' });

const AttentionPanelContainer: React.FC = () => {
  const { snapshot, setState } = useAttentionQueue();
  const { navigateToApp } = useApplicationRouter();
  const [itemRefusals, setItemRefusals] = useState<Record<string, string>>({});

  /**
   * Change a record an upgrade may have made Public (plan item 9.6), and retire
   * the item only once the record says so (setRecordDistribution reads it back).
   */
  const handleSetDistribution = async (item: AttentionItem, visibility: 'limited' | 'private') => {
    const target = item.distributionOf;
    if (!target) return;
    try {
      await setRecordDistribution(target, visibility);
      setItemRefusals(({ [item.id]: _dropped, ...rest }) => rest);
      setState(item.id, 'resolved');
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      setItemRefusals((all) => ({ ...all, [item.id]: `Not changed, still Public: ${why}` }));
    }
  };

  /**
   * Retract a decayed claim, and only mark it handled if the withdrawal
   * actually reached a relay.
   *
   * Marking it resolved regardless would be the more dangerous error: the
   * claim would still be served by every relay holding it while the queue
   * showed the matter as closed, and nothing would ever prompt a retry.
   */
  const handleRetract = async (item: AttentionItem) => {
    const slot = item.id.replace(/^decayed:/, '');
    // 'decayed', not 'superseded': there is no newer finding replacing this
    // one, and saying otherwise would send consumers looking for a
    // replacement that does not exist.
    /**
     * Guarded, because retractFinding now signs and signing can reject.
     *
     * It used to sign synchronously and could not throw here. With the host
     * signer in the path a rejection escapes, `if (result.retracted)` never
     * runs, and the queue item silently stays unresolved — indistinguishable
     * from a click that did not register. A retraction that failed must say so:
     * the operator believes a claim was withdrawn that is still standing. It
     * said so only to the console, so now it says so on the item (plan item 9.3).
     */
    const stands = 'The claim still stands on every relay that holds it.';
    const refuse = (why: string) => setItemRefusals((all) => ({ ...all, [item.id]: why }));
    try {
      // Through the publish review (plan item 0.1). Cancel leaves the claim standing.
      const result = await reviewRetraction(slot, 'decayed');
      if (!result) return;
      if (result.retracted) {
        setItemRefusals(({ [item.id]: _dropped, ...rest }) => rest);
        setState(item.id, 'resolved');
      } else if (!('broadcast' in result)) {
        refuse('Not withdrawn: this device has no record of publishing it.');
      } else {
        log.warn(`Retraction of ${slot} did not complete.`);
        const error = result.broadcast.error ? ` (${result.broadcast.error})` : '';
        refuse(`Not withdrawn: no relay took the withdrawal${error}. ${stands}`);
      }
    } catch (error) {
      log.error(`Retraction of ${slot} failed`, error);
      refuse(`Not withdrawn: ${error instanceof Error ? error.message : String(error)}. ${stands}`);
    }
  };

  // Nothing to say and nothing broken: stay out of the way. The panel's own
  // "quiet" state is for when the analyst has asked; an always-present empty
  // panel in a crowded rail is just furniture.
  if (snapshot.items.length === 0 && snapshot.failures.length === 0) return null;

  // An objective given to you opens where its link leads (plan item 2.5).
  const openMission = (missionId: string) => {
    const { app, context } = recordTarget('mission', missionId);
    navigateToApp(app, undefined, context);
  };
  return (
    <AttentionPanel
      snapshot={snapshot}
      onSetState={setState}
      onRetract={handleRetract}
      onOpenMission={openMission}
      onSetDistribution={(item, visibility) => { void handleSetDistribution(item, visibility); }}
      itemRefusals={itemRefusals}
    />
  );
};

export default AttentionPanelContainer;
