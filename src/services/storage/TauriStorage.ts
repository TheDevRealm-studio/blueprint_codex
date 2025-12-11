import { writeTextFile, readTextFile, createDir, exists, writeBinaryFile, readBinaryFile, removeFile, readDir, BaseDirectory } from '@tauri-apps/api/fs';
import type { StorageAdapter } from './types';
import type { Project, Asset } from '../../types';

const DATA_DIR = 'BlueprintCodex';
const ASSETS_DIR = 'assets';

export class TauriStorage implements StorageAdapter {
  private initialized = false;

  private async init() {
    if (this.initialized) return;

    try {
      // Ensure directories exist in Documents folder
      if (!(await exists(DATA_DIR, { dir: BaseDirectory.Document }))) {
        await createDir(DATA_DIR, { dir: BaseDirectory.Document, recursive: true });
      }

      const assetsPath = `${DATA_DIR}/${ASSETS_DIR}`;
      if (!(await exists(assetsPath, { dir: BaseDirectory.Document }))) {
        await createDir(assetsPath, { dir: BaseDirectory.Document, recursive: true });
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
      const content = await readTextFile(`${DATA_DIR}/projects.json`, { dir: BaseDirectory.Document });
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
      await writeTextFile(`${DATA_DIR}/projects.json`, JSON.stringify(projects, null, 2), { dir: BaseDirectory.Document });
    } catch (e) {
      console.error('Failed to save projects to Tauri FS', e);
      throw e;
    }
  }

  async saveAsset(file: File): Promise<Asset> {
    await this.init();
    const ext = file.name.split('.').pop();
    const id = crypto.randomUUID();
    const filename = `${id}.${ext}`;
    const filePath = `${DATA_DIR}/${ASSETS_DIR}/${filename}`;
    const metaPath = `${DATA_DIR}/${ASSETS_DIR}/${id}.json`;

    const buffer = await file.arrayBuffer();
    await writeBinaryFile(filePath, new Uint8Array(buffer), { dir: BaseDirectory.Document });

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

    await writeTextFile(metaPath, JSON.stringify(asset, null, 2), { dir: BaseDirectory.Document });

    return asset;
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    await this.init();
    try {
      // Try to load metadata first to get filename
      let filename = assetId;
      try {
        const metaPath = `${DATA_DIR}/${ASSETS_DIR}/${assetId}.json`;
        if (await exists(metaPath, { dir: BaseDirectory.Document })) {
            const metaContent = await readTextFile(metaPath, { dir: BaseDirectory.Document });
            const meta = JSON.parse(metaContent) as Asset;
            filename = meta.filename;
        }
      } catch (e) {
        // Fallback to assuming assetId is filename (legacy support)
      }

      const filePath = `${DATA_DIR}/${ASSETS_DIR}/${filename}`;
      const contents = await readBinaryFile(filePath, { dir: BaseDirectory.Document });

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
      // Try to load metadata first to get filename
      let filename = assetId;
      try {
        const metaPath = `${DATA_DIR}/${ASSETS_DIR}/${assetId}.json`;
        if (await exists(metaPath, { dir: BaseDirectory.Document })) {
            const metaContent = await readTextFile(metaPath, { dir: BaseDirectory.Document });
            const meta = JSON.parse(metaContent) as Asset;
            filename = meta.filename;
            await removeFile(metaPath, { dir: BaseDirectory.Document });
        }
      } catch (e) {}

      const filePath = `${DATA_DIR}/${ASSETS_DIR}/${filename}`;
      if (await exists(filePath, { dir: BaseDirectory.Document })) {
        await removeFile(filePath, { dir: BaseDirectory.Document });
      }
    } catch (e) {
      console.error('Failed to delete asset', e);
    }
  }

  async listAssets(): Promise<Asset[]> {
    await this.init();
    try {
      const assetsPath = `${DATA_DIR}/${ASSETS_DIR}`;
      const entries = await readDir(assetsPath, { dir: BaseDirectory.Document });
      
      const assets: Asset[] = [];
      
      for (const entry of entries) {
        if (entry.name?.endsWith('.json')) {
            try {
                const content = await readTextFile(`${assetsPath}/${entry.name}`, { dir: BaseDirectory.Document });
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
      const metaPath = `${DATA_DIR}/${ASSETS_DIR}/${assetId}.json`;
      if (await exists(metaPath, { dir: BaseDirectory.Document })) {
          const content = await readTextFile(metaPath, { dir: BaseDirectory.Document });
          const asset = JSON.parse(content) as Asset;
          const newAsset = { ...asset, ...updates };
          await writeTextFile(metaPath, JSON.stringify(newAsset, null, 2), { dir: BaseDirectory.Document });
      }
  }
}
