import { writeTextFile, readTextFile, createDir, exists, writeBinaryFile, readBinaryFile, removeFile, readDir } from '@tauri-apps/api/fs';
import { documentDir, join } from '@tauri-apps/api/path';
import type { StorageAdapter } from './types';
import type { Project, Asset } from '../../types';

const DEFAULT_DIR_NAME = 'BlueprintCodex';
const ASSETS_DIR_NAME = 'assets';

export class TauriStorage implements StorageAdapter {
  private initialized = false;
  private rootPath: string | null = null;

  // Helper to get the configured root path
  async getLibraryPath(): Promise<string> {
    if (this.rootPath) return this.rootPath;

    try {
      const docDir = await documentDir();
      const configPath = await join(docDir, DEFAULT_DIR_NAME, 'config.json');

      if (await exists(configPath)) {
        const configStr = await readTextFile(configPath);
        const config = JSON.parse(configStr);
        if (config.libraryPath) {
          this.rootPath = config.libraryPath;
          return this.rootPath!;
        }
      }

      // Default path
      this.rootPath = await join(docDir, DEFAULT_DIR_NAME);
    } catch (e) {
      console.warn('Failed to resolve library path, using default', e);
      const docDir = await documentDir();
      this.rootPath = await join(docDir, DEFAULT_DIR_NAME);
    }
    return this.rootPath!;
  }

  async setLibraryPath(path: string): Promise<void> {
    try {
      const docDir = await documentDir();
      const configDir = await join(docDir, DEFAULT_DIR_NAME);
      if (!(await exists(configDir))) {
        await createDir(configDir, { recursive: true });
      }

      const configPath = await join(configDir, 'config.json');
      await writeTextFile(configPath, JSON.stringify({ libraryPath: path }, null, 2));

      this.rootPath = path;
      this.initialized = false; // Force re-init
      await this.init();
    } catch (e) {
      console.error('Failed to set library path', e);
      throw e;
    }
  }

  private async init() {
    if (this.initialized) return;

    try {
      const root = await this.getLibraryPath();

      if (!(await exists(root))) {
        await createDir(root, { recursive: true });
      }

      const assetsPath = await join(root, ASSETS_DIR_NAME);
      if (!(await exists(assetsPath))) {
        await createDir(assetsPath, { recursive: true });
      }

      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize Tauri storage directories', e);
      throw e;
    }
  }

  async loadProjects(): Promise<Project[]> {
    await this.init();
    try {
      const root = await this.getLibraryPath();
      const projectsPath = await join(root, 'projects.json');

      if (!(await exists(projectsPath))) return [];

      const content = await readTextFile(projectsPath);
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : (data.projects || []);
    } catch (e) {
      console.warn('No projects found or failed to load', e);
      return [];
    }
  }

  async saveProjects(projects: Project[]): Promise<void> {
    await this.init();
    try {
      const root = await this.getLibraryPath();
      const projectsPath = await join(root, 'projects.json');
      await writeTextFile(projectsPath, JSON.stringify(projects, null, 2));
    } catch (e) {
      console.error('Failed to save projects to Tauri FS', e);
      throw e;
    }
  }

  async saveAsset(file: File): Promise<Asset> {
    await this.init();
    const root = await this.getLibraryPath();
    const ext = file.name.split('.').pop();
    const id = crypto.randomUUID();
    const filename = `${id}.${ext}`;

    const assetsDir = await join(root, ASSETS_DIR_NAME);
    const filePath = await join(assetsDir, filename);
    const metaPath = await join(assetsDir, `${id}.json`);

    const buffer = await file.arrayBuffer();
    await writeBinaryFile(filePath, new Uint8Array(buffer));

    const asset: Asset = {
      id,
      filename,
      originalName: file.name,
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: Date.now(),
      tags: []
    };

    await writeTextFile(metaPath, JSON.stringify(asset, null, 2));

    return asset;
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    await this.init();
    try {
      const root = await this.getLibraryPath();
      const assetsDir = await join(root, ASSETS_DIR_NAME);

      // Try to load metadata first to get filename
      let filename = assetId;
      try {
        const metaPath = await join(assetsDir, `${assetId}.json`);
        if (await exists(metaPath)) {
            const metaContent = await readTextFile(metaPath);
            const meta = JSON.parse(metaContent) as Asset;
            filename = meta.filename;
        }
      } catch (e) {
        // Fallback to assuming assetId is filename (legacy support)
      }

      const filePath = await join(assetsDir, filename);
      const contents = await readBinaryFile(filePath);

      // Determine mime type based on extension
      const ext = filename.split('.').pop()?.toLowerCase();
      let type = 'application/octet-stream';
      if (ext === 'png') type = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
      if (ext === 'mp4') type = 'video/mp4';
      if (ext === 'mov') type = 'video/quicktime';
      if (ext === 'webm') type = 'video/webm';

      return new Blob([contents as any], { type });
    } catch (e) {
      console.error('Failed to load asset', e);
      return null;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.init();
    try {
      const root = await this.getLibraryPath();
      const assetsDir = await join(root, ASSETS_DIR_NAME);

      // Try to load metadata first to get filename
      let filename = assetId;
      try {
        const metaPath = await join(assetsDir, `${assetId}.json`);
        if (await exists(metaPath)) {
            const metaContent = await readTextFile(metaPath);
            const meta = JSON.parse(metaContent) as Asset;
            filename = meta.filename;
            await removeFile(metaPath);
        }
      } catch (e) {}

      const filePath = await join(assetsDir, filename);
      if (await exists(filePath)) {
        await removeFile(filePath);
      }
    } catch (e) {
      console.error('Failed to delete asset', e);
    }
  }

  async listAssets(): Promise<Asset[]> {
    await this.init();
    try {
      const root = await this.getLibraryPath();
      const assetsPath = await join(root, ASSETS_DIR_NAME);
      const entries = await readDir(assetsPath);

      const assets: Asset[] = [];

      for (const entry of entries) {
        if (entry.name?.endsWith('.json')) {
            try {
                const metaPath = await join(assetsPath, entry.name);
                const content = await readTextFile(metaPath);
                assets.push(JSON.parse(content));
            } catch (e) {
                console.warn('Failed to parse asset metadata', entry.name);
            }
        } else if (entry.name && !entry.name.startsWith('.') && !entries.some(e => e.name === entry.name?.split('.')[0] + '.json')) {
            // Legacy/Orphaned file
            assets.push({
                id: entry.name,
                filename: entry.name,
                originalName: entry.name,
                name: entry.name,
                type: 'unknown',
                size: 0,
                createdAt: 0,
                tags: []
            });
        }
      }

      return assets.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Failed to list assets', e);
      return [];
    }
  }

  async updateAsset(assetId: string, updates: Partial<Asset>): Promise<void> {
      await this.init();
      const root = await this.getLibraryPath();
      const assetsDir = await join(root, ASSETS_DIR_NAME);
      const metaPath = await join(assetsDir, `${assetId}.json`);

      if (await exists(metaPath)) {
          const content = await readTextFile(metaPath);
          const asset = JSON.parse(content) as Asset;
          const newAsset = { ...asset, ...updates };
          await writeTextFile(metaPath, JSON.stringify(newAsset, null, 2));
      }
  }
}
