import type { StorageAdapter } from './types';
import type { Project } from '../../types';

// Temporary in-memory storage until a folder is selected
class MemoryStorage implements StorageAdapter {
  async loadProjects(): Promise<Project[]> { return []; }
  async saveProjects(_projects: Project[]): Promise<void> { 
    // console.warn('Project is in memory only. Open a local folder to save.');
  }
  async saveAsset(_file: File): Promise<string> { 
    console.warn('Assets cannot be saved in memory mode.');
    return ''; 
  }
  async loadAsset(_assetId: string): Promise<Blob | null> { return null; }
  async deleteAsset(_assetId: string): Promise<void> {}
}

class StorageManager implements StorageAdapter {
  private adapter: StorageAdapter;

  constructor() {
    this.adapter = new MemoryStorage();
  }

  setAdapter(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  get currentAdapter() {
    return this.adapter;
  }

  loadProjects() { return this.adapter.loadProjects(); }
  saveProjects(projects: Project[]) { return this.adapter.saveProjects(projects); }
  saveAsset(file: File) { return this.adapter.saveAsset(file); }
  loadAsset(assetId: string) { return this.adapter.loadAsset(assetId); }
  deleteAsset(assetId: string) { return this.adapter.deleteAsset(assetId); }
}

export const storage = new StorageManager();

