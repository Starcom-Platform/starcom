/**
 * Starcom taking what the person sent from their browser (decision D-EX, E2, W5): when Uplink connects
 * with captures waiting, and each time the bridge says more have arrived. Mounted wherever Uplink's
 * presence is shown, so a desktop Starcom page takes them; the side panel's page mounts it too.
 */
import { useEffect } from 'react';
import { caseManagerAdapter } from '../core/intel/adapters/caseManagerAdapter';
import { intelWorkspaceManager } from '../services/intel/IntelWorkspaceManager';
import { captureToItem } from './captureItems';
import { evidenceStore } from './evidenceStore';
import { keepEvidence } from './keepEvidence';
import { nostrIdentityService } from '../services/identity/NostrIdentityService';
import { openCaseForCaptures } from './openCase';
import { oneTakingAtATime, takeCaptures, takenMemory, type CaptureTaking } from './takeCaptures';
import { askUplink, uplinkClient, useStarcomUplink } from './useStarcomUplink';

const sha256Hex = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The app's own hands for takeCaptures: the workspace keeps, the case adapter files, evidence beside it. */
export function appCaptureTaking(uplinkVersion: string): CaptureTaking {
  return {
    ask: askUplink,
    async keep(capture) {
      await intelWorkspaceManager.ensureInitialized();
      if (capture.kind === 'evidence') {
        return keepEvidence(capture, {
          ask: askUplink, sha256Hex,
          putFile: evidenceStore.putFile, putRecord: evidenceStore.putRecord,
          // Taking a capture in happens on its own: the key this browser has, never a new one.
          sign: (event) => nostrIdentityService.signWithExisting(event),
          addItem: (item) => intelWorkspaceManager.addIntelItem(item),
          uplinkVersion,
        });
      }
      return intelWorkspaceManager.addIntelItem(captureToItem(capture)).id;
    },
    fileTo: (caseId, itemIds) => caseManagerAdapter.linkEntitiesToCase(caseId, itemIds),
    openCaseId: openCaseForCaptures,
    taken: takenMemory(),
    oneAtATime: oneTakingAtATime,
  };
}

export function useUplinkCaptures(): void {
  const state = useStarcomUplink();
  const connected = state.status === 'connected';
  const waitingAtHello = state.status === 'connected' ? state.hello.waiting ?? 0 : 0;
  const version = state.status === 'connected' ? state.hello.extensionVersion : '';
  useEffect(() => {
    if (!connected) return undefined;
    const client = uplinkClient();
    if (!client) return undefined;
    // A failed taking loses nothing: Uplink keeps what it was not told was kept, and the next notice tries again.
    const take = () => { void takeCaptures(appCaptureTaking(version)).catch(() => undefined); };
    if (waitingAtHello > 0) take();
    return client.onCaptured((waiting) => { if (waiting > 0) take(); });
  }, [connected, waitingAtHello, version]);
}
