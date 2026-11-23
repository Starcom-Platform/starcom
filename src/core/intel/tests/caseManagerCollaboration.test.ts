/**
 * Tests for CaseManagerAdapter collaboration features — now backed by the
 * unified Intel substrate (IntelCaseService/IntelWorkspaceManager) instead
 * of intelDataStore. Mocks IntelCaseService directly with a stateful
 * getCase/saveCase pair, since the adapter's collaboration methods are all
 * read-modify-write over it.
 */
import { caseManagerAdapter } from '../adapters/caseManagerAdapter';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { CaseStatus, CasePriority } from '../../../types/intel/IntelCaseUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import { vi } from 'vitest';

const { getCase, saveCase, listCases, createCase, updateStatus, deleteCase } = vi.hoisted(() => ({
  getCase: vi.fn(),
  saveCase: vi.fn(),
  listCases: vi.fn(),
  createCase: vi.fn(),
  updateStatus: vi.fn(),
  deleteCase: vi.fn()
}));

vi.mock('../../../services/intel/IntelCaseService', () => ({
  intelCaseService: { getCase, saveCase, listCases, createCase, updateStatus, deleteCase }
}));

vi.mock('../events/enhancedEventEmitter', () => ({
  enhancedEventEmitter: {
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    off: vi.fn(),
    emit: vi.fn()
  }
}));

describe('CaseManagerAdapter - Collaboration Features', () => {
  let mockCase: IntelCaseUI;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCase = {
      id: 'case-123',
      caseNumber: 'SC-2025-0001',
      title: 'Test Case',
      description: 'This is a test case for collaboration features',
      status: CaseStatus.OPEN,
      priority: CasePriority.MEDIUM,
      assignedTo: ['user-001', 'user-002'],
      startDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user-001',
      relatedEntities: [],
      relatedCases: [],
      tags: ['test', 'collaboration'],
      metadata: {},
      collaborators: [],
      comments: [],
      activityLog: [],
      permissions: {
        isPublic: false
      }
    };

    getCase.mockImplementation((id: string) => (id === 'case-123' ? mockCase : null));
    saveCase.mockImplementation((record: IntelCaseUI) => {
      mockCase = { ...record, updatedAt: new Date().toISOString() };
      return Promise.resolve();
    });
  });

  describe('Collaborator Management', () => {
    it('should add a collaborator to a case', async () => {
      const collaborator = {
        userId: 'user-003',
        name: 'Test User',
        addedBy: 'user-001'
      };

      const result = await caseManagerAdapter.addCollaborator('case-123', collaborator);

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.collaborators.length).toBe(1);
      expect(saved.collaborators[0].userId).toBe('user-003');
      // A collaborator is who, not what they may do: no role is stored.
      expect(saved.collaborators[0]).not.toHaveProperty('role');

      // Verify that an activity log entry was created
      expect(saved.activityLog.length).toBe(1);
      expect(saved.activityLog[0].action).toBe('COLLABORATOR_ADDED');

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:collaborator:added', expect.objectContaining({
        caseId: 'case-123'
      }));
    });

    it('should remove a collaborator from a case', async () => {
      // First, add a collaborator
      const collaborator = {
        userId: 'user-003',
        name: 'Test User',
        addedBy: 'user-001'
      };

      await caseManagerAdapter.addCollaborator('case-123', collaborator);

      // Reset mocks (mockCase/getCase/saveCase implementations survive — only calls are cleared)
      vi.clearAllMocks();

      // Now remove the collaborator
      const result = await caseManagerAdapter.removeCollaborator('case-123', 'user-003', 'user-001');

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.collaborators.length).toBe(0);

      // Verify that an activity log entry was created (the mock case record retains
      // the COLLABORATOR_ADDED entry from the earlier addCollaborator call above, so
      // the new COLLABORATOR_REMOVED entry is appended as the second entry).
      expect(saved.activityLog.length).toBe(2);
      expect(saved.activityLog[1].action).toBe('COLLABORATOR_REMOVED');

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:collaborator:removed', expect.objectContaining({
        caseId: 'case-123'
      }));
    });
  });

  describe('Comment Management', () => {
    it('should add a comment to a case', async () => {
      const comment = {
        content: 'This is a test comment',
        createdBy: 'user-001',
        mentions: ['user-002'],
        attachments: []
      };

      const result = await caseManagerAdapter.addComment('case-123', comment);

      expect(result).not.toBeNull();
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.comments.length).toBe(1);
      expect(saved.comments[0].content).toBe('This is a test comment');

      // Verify that an activity log entry was created
      expect(saved.activityLog.length).toBe(1);
      expect(saved.activityLog[0].action).toBe('COMMENTED');

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:comment:added', expect.objectContaining({
        caseId: 'case-123'
      }));
    });

    it('should update a comment on a case', async () => {
      // First, add a comment
      const comment = {
        content: 'This is a test comment',
        createdBy: 'user-001',
        mentions: ['user-002'],
        attachments: []
      };

      const commentId = await caseManagerAdapter.addComment('case-123', comment);

      // Reset mocks
      vi.clearAllMocks();

      // Now update the comment
      const updates = {
        content: 'This is an updated comment',
        mentions: ['user-002', 'user-003']
      };

      const result = await caseManagerAdapter.updateComment('case-123', commentId!, updates);

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.comments.length).toBe(1);
      expect(saved.comments[0].content).toBe('This is an updated comment');
      expect(saved.comments[0].mentions).toEqual(['user-002', 'user-003']);

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:updated', expect.objectContaining({
        caseId: 'case-123'
      }));
    });

    it('should delete a comment from a case', async () => {
      // First, add a comment
      const comment = {
        content: 'This is a test comment',
        createdBy: 'user-001',
        mentions: ['user-002'],
        attachments: []
      };

      const commentId = await caseManagerAdapter.addComment('case-123', comment);

      // Reset mocks
      vi.clearAllMocks();

      // Now delete the comment
      const result = await caseManagerAdapter.deleteComment('case-123', commentId!, 'user-001');

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.comments.length).toBe(0);

      // Verify that an activity log entry was created (the mock case record retains
      // the COMMENTED entry from the earlier addComment call above, so the new
      // "deleted" entry is appended as the second entry).
      expect(saved.activityLog.length).toBe(2);

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:updated', expect.objectContaining({
        caseId: 'case-123'
      }));
    });
  });

  describe('Sharing', () => {
    it('should generate a sharing token', async () => {
      const result = await caseManagerAdapter.generateSharingToken('case-123', 'user-001', 48);

      expect(result).not.toBeNull();
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.shareToken).toBeDefined();
      expect(saved.metadata.shareTokenExpiration).toBeDefined();

      // Verify that an activity log entry was created
      expect(saved.activityLog.length).toBe(1);
      expect(saved.activityLog[0].action).toBe('SHARED');

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:updated', expect.objectContaining({
        caseId: 'case-123'
      }));
    });

    it('should revoke a sharing token', async () => {
      // First generate a token
      await caseManagerAdapter.generateSharingToken('case-123', 'user-001');

      // Reset mocks
      vi.clearAllMocks();

      // Now revoke the token
      const result = await caseManagerAdapter.revokeSharingToken('case-123', 'user-001');

      expect(result).toBe(true);
      expect(saveCase).toHaveBeenCalled();

      const saved = (saveCase as vi.Mock).mock.calls[0][0] as IntelCaseUI;
      expect(saved.shareToken).toBeUndefined();
      expect(saved.metadata.shareTokenExpiration).toBeUndefined();

      // Verify that the event was emitted
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith('case:updated', expect.objectContaining({
        caseId: 'case-123'
      }));
    });
  });

  describe('Activity Log', () => {
    it('should get the activity log for a case', async () => {
      // First, add some activity
      await caseManagerAdapter.addCollaborator('case-123', {
        userId: 'user-003',
        name: 'Test User',
        addedBy: 'user-001'
      });

      // Reset mocks
      vi.clearAllMocks();

      // Mock the case result with a specific activity log
      getCase.mockImplementation((id: string) => {
        if (id !== 'case-123') return null;
        return {
          ...mockCase,
          activityLog: [
            {
              id: 'activity-1',
              action: 'COLLABORATOR_ADDED',
              timestamp: new Date().toISOString(),
              userId: 'user-001',
              details: {
                collaboratorId: 'user-003',
                collaboratorName: 'Test User'
              }
            }
          ]
        };
      });

      const result = await caseManagerAdapter.getActivityLog('case-123');

      expect(result.length).toBe(1);
      expect(result[0].action).toBe('COLLABORATOR_ADDED');
      expect(getCase).toHaveBeenCalledWith('case-123');
    });
  });
});
