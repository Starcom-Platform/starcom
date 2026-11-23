/**
 * The session's services start once (relay check, 2026-10-12). They were App's effect on
 * [wasmReady, fetchFromMiniServer], so WASM becoming ready stopped every one of them about 135 ms in and
 * started it again: the intel intake closed its relay sockets mid-handshake and opened them a second time.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';

const wasm = vi.hoisted(() => {
  let ready: () => void = () => {};
  return { promise: new Promise<void>((resolve) => { ready = resolve; }), ready: () => ready() };
});
vi.mock('../../utils/wasm', () => ({ initializeWASM: () => wasm.promise, fetchFromMiniServer: async () => null }));

const started = vi.hoisted(() => ({ ingest: 0, ingestStopped: 0, persistence: 0, drain: 0, chat: 0, names: 0, inbox: 0 }));
vi.mock('../../services/intel/startIntelIngestAtBoot', () => ({
  startIntelIngestAtBoot: () => { started.ingest++; return () => { started.ingestStopped++; }; },
}));
vi.mock('../../services/intel/intelPersistenceSink', () => ({ startIntelPersistence: () => { started.persistence++; return () => {}; } }));
vi.mock('../../services/intel/findings/startOutboxDrain', () => ({ startFindingsOutboxDrain: () => { started.drain++; return () => {}; } }));
vi.mock('../../services/intel/outbox/startEventOutboxDrain', () => ({ startEventOutboxDrain: () => () => {} }));
vi.mock('../../services/chat/chatUnread', () => ({ startChatNotices: () => { started.chat++; return () => {}; } }));
vi.mock('../../services/identity/learnNames', () => ({ startLearningNames: () => { started.names++; return () => {}; } }));
vi.mock('../../services/nostr/sealedInbox', () => ({ startSealedInboxAtBoot: () => { started.inbox++; return () => {}; } }));
vi.mock('../../services/bootstrap', () => ({ bootstrapServices: async () => undefined }));
vi.mock('../../core/intel', () => ({ initializeIntelDataCore: async () => undefined, loadIntelSampleData: () => undefined }));
vi.mock('../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { refreshSigner: async () => undefined } }));
vi.mock('../../services/SecureChatIntegrationService', () => ({ secureChatIntegration: { receiveSealed: () => undefined } }));
vi.mock('../../services/intel/bundles/bundleInbox', () => ({ keepBundlePart: () => undefined }));

import { WASMProvider, useWASM } from '../../context/WASMContext';
import { useBootServices } from '../useBootServices';

/** As App's content: it reads the WASM context, so it renders again when WASM becomes ready. */
const Host: React.FC<{ slim?: boolean }> = ({ slim = false }) => {
  const { wasmReady } = useWASM();
  useBootServices({ slim });
  return <span data-testid="wasm">{String(wasmReady)}</span>;
};

beforeEach(() => { for (const k of Object.keys(started) as Array<keyof typeof started>) started[k] = 0; });

describe('useBootServices', () => {
  it('starts each service once, and does not restart them when WASM becomes ready', async () => {
    const { getByTestId, unmount } = render(<WASMProvider><Host /></WASMProvider>);
    expect(started).toMatchObject({ ingest: 1, persistence: 1, drain: 1, chat: 1, names: 1, inbox: 1 });

    await act(async () => { wasm.ready(); await wasm.promise; });
    expect(getByTestId('wasm').textContent).toBe('true');
    expect(started.ingest).toBe(1);
    expect(started.ingestStopped).toBe(0);

    unmount();
    expect(started.ingestStopped).toBe(1);
  });

  it("starts none of them on Uplink's side panel", () => {
    render(<WASMProvider><Host slim /></WASMProvider>);
    expect(started).toMatchObject({ ingest: 0, persistence: 0, drain: 0, chat: 0, names: 0, inbox: 0 });
  });
});
