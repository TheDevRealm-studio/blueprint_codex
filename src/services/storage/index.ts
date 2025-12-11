import { ServerStorage } from './ServerStorage';
import type { StorageAdapter } from './types';
import type { Project } from '../../types';

class StorageManager implements StorageAdapter {
  private adapter: StorageAdapter;
  private initPromise: Promise<void>;

  constructor() {
    // Default to Server Storage (Localhost)
    this.adapter = new ServerStorage();
    this.initPromise = this.init();
  }

  private async init() {
    // Check if running in Tauri
    // @ts-ignore
    if (window.__TAURI__) {
      try {
        const { TauriStorage } = await import('./TauriStorage');
        this.adapter = new TauriStorage();
        console.log('Storage: Switched to Tauri Storage');
      } catch (e) {
        console.error('Failed to initialize Tauri storage', e);
      }
    }
  }

  setAdapter(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  get currentAdapter() {
    return this.adapter;
  }

  async loadProjects() {
    await this.initPromise;
    return this.adapter.loadProjects();
  }

  async saveProjects(projects: Project[]) {
    await this.initPromise;
    return this.adapter.saveProjects(projects);
  }

  async saveAsset(file: File) {
    await this.initPromise;
    return this.adapter.saveAsset(file);
  }

  async loadAsset(assetId: string) {
    await this.initPromise;
    return this.adapter.loadAsset(assetId);
  }

  async deleteAsset(assetId: string) {
    await this.initPromise;
    return this.adapter.deleteAsset(assetId);
  }
}

export const storage = new StorageManager();

