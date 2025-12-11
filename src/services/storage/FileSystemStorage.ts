import type { StorageAdapter } from './types';
import type { Project, Asset } from '../../types';

export class FileSystemStorage implements StorageAdapter {
  private dirHandle: FileSystemDirectoryHandle;

  constructor(handle: FileSystemDirectoryHandle) {
    this.dirHandle = handle;
  }

  async loadProjects(): Promise<Project[]> {
    try {
      const fileHandle = await this.dirHandle.getFileHandle('projects.json', { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : (data.projects || []);
    } catch (e) {
      // File might not exist yet
      console.log('No projects.json found, starting fresh.');
      return [];
    }
  }

  async saveProjects(projects: Project[]): Promise<void> {
    const fileHandle = await this.dirHandle.getFileHandle('projects.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(projects, null, 2));
    await writable.close();
  }

  async saveAsset(file: File): Promise<Asset> {
    // Create assets directory if not exists
    const assetsDir = await this.dirHandle.getDirectoryHandle('assets', { create: true });

    // Generate unique name
    const ext = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;

    const fileHandle = await assetsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    return {
      id: fileName,
      filename: fileName,
      originalName: file.name,
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: Date.now(),
      tags: []
    };
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    try {
      const assetsDir = await this.dirHandle.getDirectoryHandle('assets', { create: false });
      const fileHandle = await assetsDir.getFileHandle(assetId, { create: false });
      return await fileHandle.getFile();
    } catch (e) {
      console.error(`Failed to load asset ${assetId}`, e);
      return null;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    try {
      const assetsDir = await this.dirHandle.getDirectoryHandle('assets', { create: false });
      await assetsDir.removeEntry(assetId);
    } catch (e) {
      console.error(`Failed to delete asset ${assetId}`, e);
    }
  }

  async listAssets(): Promise<Asset[]> {
    return [];
  }

  async updateAsset(_assetId: string, _updates: Partial<Asset>): Promise<void> {
    // Not implemented
  }
}
