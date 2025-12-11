import type { Project, Asset } from '../../types';

export interface StorageAdapter {
  // Project Metadata & Content
  loadProjects(): Promise<Project[]>;
  saveProjects(projects: Project[]): Promise<void>;

  // Binary Assets (Images, Videos)
  saveAsset(file: File): Promise<Asset>;
  loadAsset(assetId: string): Promise<Blob | null>;
  deleteAsset(assetId: string): Promise<void>;
  listAssets(): Promise<Asset[]>;
  updateAsset(assetId: string, updates: Partial<Asset>): Promise<void>;
}
