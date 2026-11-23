/**
 * What the host is told it is signing.
 *
 * Starcom holds no signing key. On the desktop host the key lives outside the
 * page, and the host asks the operator to authorise each signature — showing
 * them the KIND it was given. That string was the literal 'finding' for all
 * three payloads that pass through here, so somebody withdrawing a claim about
 * a named individual was told they were publishing a finding.
 *
 * It is the same concern publisherConsent exists for, one layer down: the
 * moment a person is asked to put their own key behind something is the moment
 * they must be told accurately what it is.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signCalls: string[] = [];

vi.mock('../../../native/nativeHost', () => ({
  nativeHost: () => ({
    signer: {
      status: async () => ({ ready: true }),
      sign: async (kind: string, content: Record<string, unknown>) => {
        signCalls.push(kind);
        // The canonical form must match or the caller refuses the signature,
        // so it is produced the same way the caller produces it.
        const { stableStringify } = await import('../signFinding');
        return { canonical: stableStringify(content as never), pubkey: 'pk-host', sig: 'sig' };
      },
    },
  }),
}));

const { signFindingPreferNative } = await import('../signFindingPreferNative');
const { buildRetraction } = await import('../retraction');
const { buildRefutation } = await import('../refutation');

const method = {
  algorithm: 'test', algorithmVersion: '1', criteria: 'c', sourceCount: 1,
  observedFrom: '2026-01-01T00:00:00.000Z', observedTo: '2026-01-02T00:00:00.000Z',
  timePrecisionMs: 1000, parameters: {}, modality: 'record-linkage', weakBacking: false,
} as never;

const finding = {
  schemaVersion: 2,
  claim: { subjectRef: 'gb:1', subjectKind: 'company', attribute: 'a', value: 'v' },
  method,
  publishedAt: '2026-01-02T00:00:00.000Z',
} as never;

beforeEach(() => { signCalls.length = 0; });

describe('the kind handed to the host signer', () => {
  it('names a retraction a retraction', async () => {
    const retraction = buildRetraction({ subjectRef: 'gb:1', attribute: 'a' }, 'error', 'wrong input');
    const { route } = await signFindingPreferNative(retraction as never);
    expect(route).toBe('host-signer');
    // Not 'finding'. A person withdrawing a claim is doing the opposite of
    // publishing one, and this is the string they are shown.
    expect(signCalls).toEqual(['retraction']);
  });

  it('names a refutation a refutation', async () => {
    const refutation = buildRefutation(
      { subjectRef: 'gb:1', attribute: 'a', authorPubkey: 'pk' } as never,
      { kind: 'contradicting-evidence' } as never,
      method,
    );
    await signFindingPreferNative(refutation as never);
    expect(signCalls).toEqual(['refutation']);
  });

  it('still names a finding a finding', async () => {
    await signFindingPreferNative(finding);
    expect(signCalls).toEqual(['finding']);
  });

  it('checks retraction before refutation, since the two are not exclusive by shape', async () => {
    /*
     * Order matters and is not arbitrary. Both guards are structural — one
     * looks for `retracted`, the other for `refutes` — so a payload carrying
     * both would be classified by whichever runs first. A withdrawal is the
     * stronger statement about what is happening to the operator's key, so it
     * wins.
     */
    const odd = { ...buildRetraction({ subjectRef: 'gb:1', attribute: 'a' }, 'error'), refutes: {} };
    await signFindingPreferNative(odd as never);
    expect(signCalls).toEqual(['retraction']);
  });
});
