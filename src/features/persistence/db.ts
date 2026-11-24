import Dexie, { type EntityTable } from 'dexie';
import type { ExperimentRecord, SystemLabProject } from '@/schemas/projectSchema';

export class SystemLabDatabase extends Dexie {
  projects!: EntityTable<SystemLabProject, 'id'>;
  experiments!: EntityTable<ExperimentRecord, 'id'>;

  constructor() {
    super('SystemLabDB');
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      experiments: 'id, projectId, createdAt, name',
    });
  }
}

export const db = new SystemLabDatabase();
