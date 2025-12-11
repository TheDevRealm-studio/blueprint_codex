import type { StorageAdapter } from './types';
import type { Project, Asset } from '../../types';

const API_URL = 'http://localhost:3001/api';
const ASSETS_URL = 'http://localhost:3001/assets';

export class ServerStorage implements StorageAdapter {

  async loadProjects(): Promise<Project[]> {
    try {
      const res = await fetch(`${API_URL}/projects`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.projects || []);
    } catch (e) {
      console.error('Failed to load projects from server', e);
      return [];
    }
  }

  async saveProjects(projects: Project[]): Promise<void> {
    try {
      await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projects)
      });
    } catch (e) {
      console.error('Failed to save projects to server', e);
      throw e;
    }
  }

  async saveAsset(file: File): Promise<Asset> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_URL}/assets`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Failed to upload asset');
    return await res.json();
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    try {
      // Server handles resolution of ID to file
      const res = await fetch(`${ASSETS_URL}/${assetId}`);
      if (!res.ok) return null;
      return await res.blob();
    } catch (e) {
      console.error('Failed to load asset', e);
      return null;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    await fetch(`${API_URL}/assets/${assetId}`, { method: 'DELETE' });
  }

  async listAssets(): Promise<Asset[]> {
    try {
      const res = await fetch(`${API_URL}/assets`);
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error('Failed to list assets from server', e);
      return [];
    }
  }

  async updateAsset(assetId: string, updates: Partial<Asset>): Promise<void> {
      await fetch(`${API_URL}/assets/${assetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
      });
  }
}
