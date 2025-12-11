import type { Project } from '../../types';

export interface StorageAdapter {
  // Project Metadata & Content
  loadProjects(): Promise<Project[]>;
  saveProjects(projects: Project[]): Promise<void>;

  // Binary Assets (Images, Videos)
  saveAsset(file: File): Promise<string>;
  loadAsset(assetId: string): Promise<Blob | null>;
  deleteAsset(assetId: string): Promise<void>;
}
