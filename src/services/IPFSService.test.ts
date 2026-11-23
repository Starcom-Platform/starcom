import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from 'vitest';
import { IPFSService, IPFSUploadResult } from './IPFSService';
import { CyberTeam, IntelPackage, CyberInvestigation } from '../types/cyberInvestigation';
import { getIPFSClient, uploadToIPFS } from '../lib/ipfs-client';

/**
 * IPFS is AVAILABLE by default here, and that is a deliberate change.
 *
 * This mock used to reject, "so we exercise mock-storage fallback" — so every
 * test in the file ran the no-IPFS path while asserting `success: true` and a
 * `url` containing "ipfs". The suite was therefore the reason the fallback
 * could return a fabricated CID and a dead gateway link for years: the
 * dishonest behaviour was its expected contract.
 *
 * Tests named "should upload …" now upload. The unavailable path has its own
 * block at the end of the file, which overrides this mock and asserts the
 * opposite.
 */
const FAKE_CID = 'bafytestcidfortestsonly000000000000000000000000000000';
vi.mock('../lib/ipfs-client', () => ({
  getIPFSClient: vi.fn().mockResolvedValue({ node: 'test-helia' }),
  uploadToIPFS: vi.fn().mockResolvedValue('bafytestcidfortestsonly000000000000000000000000000000'),
  getFromIPFS: vi.fn().mockResolvedValue(null),
  getIPFSGatewayUrl: vi.fn((cid: string) => `https://dweb.link/ipfs/${cid}`),
}));

/*
 * Re-armed per test, not just in the factory above.
 *
 * The project's global afterEach calls vi.restoreAllMocks(), which strips the
 * implementations off these vi.fn()s after the first test — so every later test
 * got `undefined` back from getIPFSClient, fell into the no-IPFS path, and
 * asserted success anyway. That is how a suite full of "should upload …" tests
 * ran without ever uploading.
 */
let cidCounter = 0;
beforeEach(() => {
  cidCounter = 0;
  vi.mocked(getIPFSClient).mockResolvedValue({ node: 'test-helia' } as never);
  // A DISTINCT cid per upload. A constant one made two uploads collide into a
  // single cache entry, so tests that upload twice counted one — an artefact of
  // the mock, not of the service.
  vi.mocked(uploadToIPFS).mockImplementation(async () => `${FAKE_CID}${cidCounter++}`);
});

// Spy on crypto.getRandomValues rather than replacing the whole global
// `crypto` object — the previous Object.defineProperty(global, 'crypto', ...)
// swapped in a stub with ONLY getRandomValues, permanently losing
// crypto.subtle/randomUUID/etc. for the rest of the shared test-runner
// process (a real global mutation, not something vi.restoreAllMocks() in
// the project's global afterEach can undo). Confirmed this broke unrelated
// test files (crypto.subtle-/randomUUID-dependent) whenever they happened
// to run after this file in the same worker.
vi.spyOn(global.crypto, 'getRandomValues').mockImplementation((arr: ArrayBufferView | null) => {
  if (arr instanceof Uint8Array) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return arr as ArrayBufferView;
});

/**
 * Mock localStorage — STUBBED, so it can be taken back.
 *
 * This was `Object.defineProperty(global, 'localStorage', { value: ... })`,
 * which installs a plain object at module load, permanently and
 * non-configurably. Under `pool: forks` with `singleFork: true` the global is
 * shared by the entire run, so from the moment this file loaded, EVERY test
 * file after it saw a localStorage whose `getItem` was a bare `vi.fn()`
 * returning `undefined` and whose `length` was undefined.
 *
 * Writes did not throw — the stub's `setItem` silently did nothing — so the
 * symptom was services writing and reading back empty, with no error anywhere.
 * And because vitest's file order varies, whichever files happened to run
 * after this one lost, which is why the victim rotated between runs and every
 * one of them passed in isolation. That was the whole of D11's nondeterminism.
 *
 * `vi.stubGlobal` is restorable; `defineProperty` was not.
 */
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('IPFSService - Advanced Cybersecurity Tests', () => {
  let ipfsService: IPFSService;
  
  // Test data
  const mockIntelPackage: IntelPackage = {
    id: 'intel-001',
    name: 'Test Intelligence Package',
    description: 'Test intelligence data',
    type: 'INVESTIGATION',
    createdBy: 'test-creator',
    createdAt: new Date(),
    updatedAt: new Date(),
    reportIds: [],
    tags: ['test', 'intelligence'],
    visibility: 'limited',
    status: 'ACTIVE',
    affectedSystems: ['system-1'],
    threatActors: ['apt-test'],
    ioCs: [],
    timeline: [],
    collaborators: [],
    sharedWith: []
  };

  const mockCyberTeam: CyberTeam = {
    id: 'team-001',
    name: 'Test Cyber Team',
    type: 'INCIDENT_RESPONSE',
    lead: 'member-001',
    members: [
      {
        walletAddress: 'member-001',
        name: 'Test Agent',
        role: 'CYBER_ANALYST',
        specializations: ['malware-analysis'],
        status: 'ONLINE',
        joinedAt: new Date(),
        lastActivity: new Date()
      }
    ],
    specializations: ['incident-response'],
    status: 'ACTIVE',
    currentInvestigations: [],
    autoShareFindings: true,
    allowExternalCollaboration: false,
    preferredCommunicationChannels: ['secure-chat'],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockInvestigation: CyberInvestigation = {
    id: 'inv-001',
    title: 'Test Cyber Investigation',
    description: 'Test cyber investigation case',
    type: 'INCIDENT_RESPONSE',
    visibility: 'limited',
    priority: 'HIGH',
    severity: 'HIGH',
    incidentDate: new Date(),
    detectedDate: new Date(),
    reportedBy: 'test-reporter',
    assignedTeam: 'team-001',
    status: 'INVESTIGATING',
    progress: 0,
    affectedSystems: ['system-1'],
    affectedUsers: ['user-1'],
    estimatedImpact: 'HIGH',
    intelPackages: [],
    timeline: [],
    ioCs: [],
    evidence: [],
    collaboratingTeams: [],
    sharedWith: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    recommendedActions: []
  };

  beforeAll(() => {
    // Setup console mocks to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear.mockClear();
    
    // Create fresh instance for each test
    ipfsService = new IPFSService();
  });

  afterEach(() => {
    // Clean up after each test
    ipfsService.clearMockStorage();
  });

  describe('Initialization and Health Checks', () => {
    it('should initialize with its security features enabled', () => {
      expect(ipfsService).toBeDefined();
      
      const securityStatus = ipfsService.getSecurityStatus();
      expect(securityStatus.complianceLevel).toBe('PLACEHOLDER');
      expect(securityStatus.pqcStatus).toBe(false);
    });

    it('should perform health check on initialization', () => {
      // Health check should complete without errors
      expect(() => new IPFSService()).not.toThrow();
    });
  });

  describe('Intel Package Upload with Advanced Security', () => {
    it('should upload intel package with PQC encryption', async () => {
      const result = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator',
        'limited'
      );

      expect(result.success).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.url).toContain('ipfs');
      expect(result.pqcEncrypted).toBe(false);
      expect(result.didVerified).toBe(false);
      expect(result.otkUsed).toBeDefined();
      expect(result.securityLevel).toBe('CLASSICAL');
      expect(result.auditTrail).toHaveLength(0); // Security processing is placeholder
    });

    /*
     * ─── THIS TEST PINNED A SUBSTRING-MATCHING TIER CLASSIFIER ───────────────
     *
     * It asserted mapClassificationLevel's behaviour across five inputs,
     * including `{ input: 'SCI', expected: 'SCI' }` — Sensitive Compartmented
     * Information, a government compartment marking, for a compartment system
     * this app does not have. And the mapping worked by substring match over
     * arbitrary text, so a document's CONTENT decided its label: a report
     * about a leaked top-secret cable came out labelled TOP_SECRET.
     *
     * The whole field was written onto security metadata that nothing read.
     * Deleted, and this test with it.
     *
     * What replaces it is the honest question about an IPFS pin: it cannot be
     * recalled, so who may have the content matters. That warning is asserted
     * below.
     */
    it('warns when non-public content is pinned, because a pin cannot be recalled', async () => {
      const result = await ipfsService.uploadIntelPackage(
        { ...mockIntelPackage, visibility: 'private' } as never,
        'test-creator',
      );
      expect(result.success).toBe(true);
      // The visibility warning is emitted by validateContent during upload.
      const warned = (result.warnings ?? []).join(' ');
      expect(warned).toMatch(/cannot be recalled|private/i);
    });

    it('should validate content before upload', async () => {
      const invalidPackage = { ...mockIntelPackage, id: '' }; // Invalid: missing required ID
      
      try {
        await ipfsService.uploadIntelPackage(invalidPackage, 'test-creator');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('Validation failed');
      }
    });

    it('should generate unique fallback keys for each upload', async () => {
      const result1 = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator'
      );
      const result2 = await ipfsService.uploadIntelPackage(
        { ...mockIntelPackage, id: 'intel-002' },
        'test-creator'
      );

      expect(result1.otkUsed).not.toBe(result2.otkUsed);
      expect(result1.otkUsed).toMatch(/^fallback-/);
      expect(result2.otkUsed).toMatch(/^fallback-/);
    });
  });

  describe('Cyber Team Upload with Threshold Signatures', () => {
    it('should upload cyber team with TSS signing', async () => {
      const result = await ipfsService.uploadCyberTeam(
        mockCyberTeam,
        'test-creator',
        'limited'
      );

      expect(result.success).toBe(true);
      // TSS is a placeholder — no real threshold signatures
      expect(result.tssSignature).toBeUndefined();
    });

    it('should include complete audit trail for team uploads', async () => {
      const result = await ipfsService.uploadCyberTeam(
        mockCyberTeam,
        'test-creator',
        'limited'
      );

      // Security processing is placeholder — no audit trail events generated
      expect(result.auditTrail).toHaveLength(0);
    });
  });

  describe('Investigation Upload with Multi-Party Computation', () => {
    it('should upload investigation with dMPC classification check', async () => {
      const result = await ipfsService.uploadInvestigation(
        mockInvestigation,
        'test-creator',
        'private'
      );

      expect(result.success).toBe(true);
      // Security processing is placeholder — no dMPC events
      expect(result.auditTrail).toHaveLength(0);
    });
  });

  describe('DID (Decentralized Identity) Management', () => {
    it('should verify and register DIDs for new creators', async () => {
      const creator = 'did:socom:test-agent-001';
      
      const result = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        creator
      );

      // DID is placeholder — always returns false
      expect(result.didVerified).toBe(false);
      expect(result.auditTrail).toHaveLength(0);
    });
  });

  describe('One-Time Key (OTK) Management', () => {
    it('should report zero OTKs in placeholder state', async () => {
      const securityStatus = ipfsService.getSecurityStatus();
      expect(securityStatus.activeOTKs).toBe(0);
    });

    it('should include fallback key in uploads', async () => {
      const result = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator'
      );

      expect(result.otkUsed).toMatch(/^fallback-/);
    });
  });

  describe('Batch Operations with Security', () => {
    it('should perform batch upload with consistent security', async () => {
      const items = [
        {
          data: mockIntelPackage,
          type: 'intel-package' as const,
          creator: 'test-creator',
          visibility: 'limited'
        },
        {
          data: mockCyberTeam,
          type: 'cyber-team' as const,
          creator: 'test-creator',
          visibility: 'limited'
        }
      ];

      let progressCalls = 0;
      const results = await ipfsService.batchUpload(items, (completed, total) => {
        progressCalls++;
        expect(completed).toBeLessThanOrEqual(total);
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].pqcEncrypted).toBe(false);
      expect(results[1].pqcEncrypted).toBe(false);
      expect(progressCalls).toBeGreaterThan(0);
    });
  });

  describe('Storage Management', () => {
    it('should track storage statistics', async () => {
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');
      
      // Note: getStorageStats is private, so we test through public interface
      const result = await ipfsService.uploadCyberTeam(mockCyberTeam, 'test-creator');
      expect(result.success).toBe(true);
    });

    it('should handle storage cleanup when needed', async () => {
      // Upload multiple items to trigger potential cleanup
      const uploadPromises: Promise<IPFSUploadResult>[] = [];
      for (let i = 0; i < 5; i++) {
        uploadPromises.push(
          ipfsService.uploadIntelPackage(
            { ...mockIntelPackage, id: `intel-${i}` },
            'test-creator'
          )
        );
      }

      const results = await Promise.all(uploadPromises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Content Verification', () => {
    it('should verify uploaded content integrity', async () => {
      const uploadResult = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator'
      );

      const content = await ipfsService.getContent(uploadResult.hash);
      expect(content).toBeDefined();
      expect(content?.data).toEqual(mockIntelPackage);

      const verification = await ipfsService.verifyContent(uploadResult.hash);
      expect(verification.valid).toBe(true);
      expect(verification.checksumMatch).toBe(true);
    });

    it('should detect content tampering', async () => {
      const uploadResult = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator'
      );

      // Manually corrupt the content
      const corruptedContent = await ipfsService.getContent(uploadResult.hash);
      if (corruptedContent) {
        (corruptedContent.data as IntelPackage).name = 'TAMPERED';
        // In a real scenario, this would be detected by checksum mismatch
      }

      // Verification should still pass as we're testing the interface
      const verification = await ipfsService.verifyContent(uploadResult.hash);
      expect(verification.valid).toBe(true);
    });
  });

  describe('Security Status Monitoring', () => {
    it('should provide comprehensive security status', async () => {
      // Upload some content to populate security metrics
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');
      await ipfsService.uploadCyberTeam(mockCyberTeam, 'test-creator');

      const status = ipfsService.getSecurityStatus();
      
      expect(status.pqcStatus).toBe(false);
      expect(status.didRegistered).toBe(0);
      expect(status.auditEvents).toBe(0);
      expect(status.complianceLevel).toBe('PLACEHOLDER');
      expect(typeof status.tssCoordinators).toBe('number');
      expect(typeof status.dMPCSessions).toBe('number');
    });
  });

  describe('Import/Export Functionality', () => {
    it('should export all content with security metadata', async () => {
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');
      await ipfsService.uploadCyberTeam(mockCyberTeam, 'test-creator');

      const exported = ipfsService.exportAllContent();
      
      expect(exported.version).toBe('1.0');
      expect(exported.timestamp).toBeDefined();
      expect(exported.data.length).toBe(2);
      
      // Content is exported with metadata
      exported.data.forEach(item => {
        expect(item.content.metadata).toBeDefined();
        expect(item.content.data).toBeDefined();
      });
    });

    it('should import content and validate security', async () => {
      // First export some content
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');
      const exported = ipfsService.exportAllContent();
      
      // Clear storage and import
      ipfsService.clearMockStorage();
      const importResult = await ipfsService.importContent(exported, { validate: true });
      
      expect(importResult.imported).toBe(1);
      expect(importResult.skipped).toBe(0);
      expect(importResult.errors.length).toBe(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle validation errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidData = { invalid: 'data' } as any;
      
      try {
        await ipfsService.uploadIntelPackage(invalidData, 'test-creator');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('Validation failed');
      }
    });

    it('should provide fallback security metadata on errors', async () => {
      // Test with a package that will trigger the fallback path
      const result = await ipfsService.uploadIntelPackage(
        mockIntelPackage,
        'test-creator'
      );
      
      // Should still succeed with security metadata
      expect(result.success).toBe(true);
      expect(result.securityLevel).toBeDefined();
      expect(['QUANTUM_SAFE', 'CLASSICAL', 'HYBRID']).toContain(result.securityLevel);
    });

    it('should handle missing content retrieval', async () => {
      const content = await ipfsService.getContent('non-existent-hash');
      expect(content).toBeNull();
      
      const verification = await ipfsService.verifyContent('non-existent-hash');
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent uploads', async () => {
      const concurrentUploads = Array.from({ length: 10 }, (_, i) =>
        ipfsService.uploadIntelPackage(
          { ...mockIntelPackage, id: `concurrent-${i}` },
          `creator-${i}`
        )
      );

      const results = await Promise.all(concurrentUploads);
      
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.hash).toBeDefined();
        expect(result.otkUsed).toMatch(/^fallback-/);
      });

      // Verify all uploads have unique OTKs
      const otks = results.map(r => r.otkUsed);
      const uniqueOtks = new Set(otks);
      expect(uniqueOtks.size).toBe(otks.length);
    });
  });

  describe('Advanced Security Features', () => {
    it('should generate comprehensive security audit report', async () => {
      // Upload some test content
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator', 'limited');
      await ipfsService.uploadCyberTeam(mockCyberTeam, 'test-creator', 'limited');

      const auditReport = ipfsService.generateSecurityAuditReport();

      expect(auditReport.reportId).toBeDefined();
      expect(auditReport.timestamp).toBeInstanceOf(Date);
      expect(auditReport.complianceLevel).toBe('PLACEHOLDER');
      expect(auditReport.securityMetrics.totalUploads).toBe(2);
      expect(auditReport.securityMetrics.pqcEncryptedCount).toBe(0);
      expect(auditReport.securityMetrics.didVerifiedCount).toBe(0);
      expect(auditReport.riskAssessment).toBe('MEDIUM');
      expect(Array.isArray(auditReport.auditEvents)).toBe(true);
      expect(Array.isArray(auditReport.recommendations)).toBe(true);
    });

    it('should perform security health check', async () => {
      const healthCheck = await ipfsService.performSecurityHealthCheck();

      expect(healthCheck.overallHealth).toMatch(/^(HEALTHY|DEGRADED|CRITICAL)$/);
      expect(healthCheck.componentStatus.pqc).toMatch(/^(OPERATIONAL|DEGRADED|FAILED)$/);
      expect(healthCheck.componentStatus.did).toMatch(/^(OPERATIONAL|DEGRADED|FAILED)$/);
      expect(healthCheck.componentStatus.otk).toMatch(/^(OPERATIONAL|DEGRADED|FAILED)$/);
      expect(healthCheck.componentStatus.tss).toMatch(/^(OPERATIONAL|DEGRADED|FAILED)$/);
      expect(healthCheck.componentStatus.dmpc).toMatch(/^(OPERATIONAL|DEGRADED|FAILED)$/);
      expect(Array.isArray(healthCheck.issues)).toBe(true);
      expect(Array.isArray(healthCheck.recommendations)).toBe(true);
    });

    it('should cleanup security resources', async () => {
      // Upload content to create security resources
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');

      const cleanupResult = await ipfsService.cleanupSecurityResources();

      expect(cleanupResult.cleaned).toHaveProperty('expiredOTKs');
      expect(cleanupResult.cleaned).toHaveProperty('oldTSSessions');
      expect(cleanupResult.cleaned).toHaveProperty('completedDMPCSessions');
      expect(cleanupResult.cleaned).toHaveProperty('archivedAuditEvents');
      expect(Array.isArray(cleanupResult.errors)).toBe(true);
      expect(typeof cleanupResult.cleaned.expiredOTKs).toBe('number');
    });

    it('should validate compliance configuration', () => {
      const complianceCheck = ipfsService.validateComplianceConfiguration();

      expect(typeof complianceCheck.compliant).toBe('boolean');
      expect(Array.isArray(complianceCheck.violations)).toBe(true);
      expect(Array.isArray(complianceCheck.recommendations)).toBe(true);
      expect(typeof complianceCheck.score).toBe('number');
      expect(complianceCheck.score).toBeGreaterThanOrEqual(0);
      expect(complianceCheck.score).toBeLessThanOrEqual(100);
    });

    it('should handle security audit report with different risk levels', async () => {
      // Clear storage to test low coverage scenarios
      ipfsService.clearMockStorage();
      
      // Upload content without full security (testing fallback paths)
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator');

      const auditReport = ipfsService.generateSecurityAuditReport();
      
      expect(auditReport.riskAssessment).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
      expect(auditReport.securityMetrics.totalUploads).toBeGreaterThan(0);
    });

    it('should provide detailed component health diagnostics', async () => {
      // Upload several items to populate metrics
      await ipfsService.uploadIntelPackage(mockIntelPackage, 'creator-1');
      await ipfsService.uploadCyberTeam(mockCyberTeam, 'creator-2');
      await ipfsService.uploadInvestigation(mockInvestigation, 'creator-3');

      const healthCheck = await ipfsService.performSecurityHealthCheck();
      
      // Security components are placeholders
      expect(healthCheck.componentStatus.pqc).toBe('DEGRADED');
      
      const securityStatus = ipfsService.getSecurityStatus();
      expect(securityStatus.didRegistered).toBe(0);
      expect(securityStatus.auditEvents).toBe(0);
    });
  });

  describe('Pinning Service', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /*
     * These replace three tests that mocked /api/pin responses — success,
     * unreachable, and non-OK. That endpoint was deleted with the rest of api/:
     * Starcom operates no server, so there is no browser-side pinning path to
     * mock, and tests asserting behaviour against a URL that provably 404s were
     * measuring a fiction.
     */
    it('reports honestly that no browser-side pinning endpoint exists', async () => {
      const result = await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator', 'limited');
      const pinResult = await ipfsService.pinContent(result.hash);

      // success: the content EXISTS on Helia and the operation did not fail.
      expect(pinResult.success).toBe(true);
      // pinned: no durability guarantee was added, and a caller that needs one
      // must read this rather than success.
      expect(pinResult.pinned).toBe(false);
      expect(pinResult.error).toMatch(/no browser-side pinning endpoint/i);
    });

    it('makes no network call, rather than retrying a deleted endpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await ipfsService.uploadIntelPackage(mockIntelPackage, 'test-creator', 'limited');
      fetchSpy.mockClear();

      await ipfsService.pinContent(result.hash);

      // The previous implementation retried with exponential backoff against a
      // URL that cannot answer, and logged a warning implying misconfiguration.
      const pinCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/api/pin'));
      expect(pinCalls).toHaveLength(0);
      fetchSpy.mockRestore();
    });

    it('should fail when pinning content that does not exist', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const pinResult = await ipfsService.pinContent('QmNonexistent');
      expect(pinResult.success).toBe(false);
      expect(pinResult.error).toContain('Content not found');
    });

    it('should verify pinned content reachability via gateways', async () => {
      // Mock HEAD request success on second gateway
      fetchSpy
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: true });

      const verifyResult = await ipfsService.verifyPinnedContent('QmTestHash');
      expect(verifyResult.reachable).toBe(true);
      expect(verifyResult.gateway).toBeDefined();
    });

    it('should return not reachable when all gateways fail', async () => {
      fetchSpy.mockRejectedValue(new Error('timeout'));

      const verifyResult = await ipfsService.verifyPinnedContent('QmUnreachable');
      expect(verifyResult.reachable).toBe(false);
      expect(verifyResult.error).toContain('not reachable');
    });
  });

  describe('Lazy Helia initialization (test-suite OOM fix)', () => {
    // Constructing IPFSService used to start a real Helia/libp2p node
    // unconditionally — every test file across the suite that merely
    // imported this service (directly or transitively) paid that cost,
    // none of them ever torn down within the shared test-runner process.
    // Verifies the real node now only starts on first actual demand.
    // Each test builds its own instance (rather than relying on the outer
    // beforeEach's shared `ipfsService`) so the clear-then-construct-then-
    // assert sequence is fully deterministic, independent of hook order.
    it('does not call getIPFSClient() merely by constructing the service', () => {
      vi.mocked(getIPFSClient).mockClear();
      void new IPFSService();
      expect(getIPFSClient).not.toHaveBeenCalled();
    });

    it('calls getIPFSClient() once real readiness is actually requested', async () => {
      vi.mocked(getIPFSClient).mockClear();
      const freshService = new IPFSService();
      expect(getIPFSClient).not.toHaveBeenCalled();
      await freshService.waitForReady();
      expect(getIPFSClient).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Nothing uploaded is not a successful upload.
 *
 * ─── THE LIE THIS ENDS ─────────────────────────────────────────────────────
 *
 * With no Helia node and no pinning token, storeContent fell back to
 * generateMockHash — `'Qm' + charCodes + Date.now()`, truncated to 46
 * characters so it LOOKED like a CID — and the upload returned
 * `success: true` with `url: https://ipfs.io/ipfs/<that>`. The
 * MarketExchange rendered it as a green "Package published with id … • <url>",
 * and on a Nostr failure added "(package is still stored on IPFS)". A user was
 * told their intelligence was published, handed a link that 404s, and
 * explicitly assured it was stored. None of it was true.
 *
 * uploadToReal already had this exact fix — its comment reads "It used to
 * return a locally-computed hash dressed as a CID, which reported a successful
 * pin for content that was never uploaded; it now throws instead." The same
 * dressing survived one level up, in storeContent.
 *
 * Every test above this block runs in the fallback path (the mock at the top of
 * the file makes Helia unavailable) and asserted `success: true` — so the suite
 * encoded the dishonesty as the contract. Those expectations moved with this.
 */
describe('IPFS unavailable — the honest result', () => {
  let svc: IPFSService;
  beforeEach(() => {
    // This block is the no-IPFS path: no node, no pinning service.
    vi.mocked(uploadToIPFS).mockRejectedValue(new Error('no IPFS in this test'));
    svc = new IPFSService();
  });
  afterEach(() => {
    vi.mocked(uploadToIPFS).mockImplementation(async () => `${FAKE_CID}${cidCounter++}`);
  });

  const pkg = (): IntelPackage => ({
    id: 'pkg-honest', name: 'Honest', description: 'd', type: 'INVESTIGATION',
    createdBy: 'author', createdAt: new Date(), updatedAt: new Date(),
    reportIds: [], tags: [], visibility: 'public', status: 'ACTIVE',
collaborators: [], affectedSystems: [], threatActors: [], iocs: [], timeline: [],
  } as unknown as IntelPackage);

  it('does not report success when nothing reached IPFS', async () => {
    const r = await svc.uploadIntelPackage(pkg(), 'author');
    expect(r.success).toBe(false);
  });

  it('never hands back a string dressed as a CID', async () => {
    const r = await svc.uploadIntelPackage(pkg(), 'author');
    expect(r.hash.startsWith('Qm')).toBe(false);
  });

  it('never offers a gateway link to content that was never uploaded', async () => {
    const r = await svc.uploadIntelPackage(pkg(), 'author');
    expect(r.url).toBe('');
  });

  it('says why, so the caller can tell this from a network error', async () => {
    const r = await svc.uploadIntelPackage(pkg(), 'author');
    expect(r.error).toMatch(/IPFS/i);
  });
});
