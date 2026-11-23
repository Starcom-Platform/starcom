import { IntelRelationshipUI, CreateIntelRelationshipInput } from '../../types/intel/IntelRelationship';
import { intelWorkspaceManager } from './IntelWorkspaceManager';

export interface IntelRelationshipService {
  listRelationships(): Promise<IntelRelationshipUI[]>;
  getRelationshipsForEntity(entityId: string): Promise<IntelRelationshipUI[]>;
  createRelationship(input: CreateIntelRelationshipInput): Promise<IntelRelationshipUI>;
  updateRelationship(relationship: IntelRelationshipUI): Promise<void>;
  deleteRelationship(id: string): Promise<void>;
  onChange(listener: (relationships: IntelRelationshipUI[]) => void): () => void;
}

class WorkspaceBackedIntelRelationshipService implements IntelRelationshipService {
  private listeners = new Set<(relationships: IntelRelationshipUI[]) => void>();
  /** Memoized promise, not a boolean — same concurrent-init hazard IntelReportService/IntelWorkspaceManager already had to fix. */
  private initPromise: Promise<void> | null = null;

  private notify(relationships: IntelRelationshipUI[]) { this.listeners.forEach(l => l(relationships)); }

  private async ensure(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await intelWorkspaceManager.ensureInitialized();
        intelWorkspaceManager.subscribe(async () => {
          this.notify(await this.listRelationships());
        });
      })();
    }
    return this.initPromise;
  }

  async listRelationships(): Promise<IntelRelationshipUI[]> {
    await this.ensure();
    return intelWorkspaceManager.getRelationships();
  }

  async getRelationshipsForEntity(entityId: string): Promise<IntelRelationshipUI[]> {
    await this.ensure();
    return intelWorkspaceManager.getRelationshipsForEntity(entityId);
  }

  async createRelationship(input: CreateIntelRelationshipInput): Promise<IntelRelationshipUI> {
    await this.ensure();
    return intelWorkspaceManager.addRelationship(input);
  }

  async updateRelationship(relationship: IntelRelationshipUI): Promise<void> {
    await this.ensure();
    intelWorkspaceManager.updateRelationship(relationship);
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.ensure();
    intelWorkspaceManager.removeRelationship(id);
  }

  onChange(listener: (relationships: IntelRelationshipUI[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const intelRelationshipService: IntelRelationshipService = new WorkspaceBackedIntelRelationshipService();
