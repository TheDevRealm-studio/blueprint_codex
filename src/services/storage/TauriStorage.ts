import { writeTextFile, readTextFile, createDir, exists, writeBinaryFile, readBinaryFile, removeFile, BaseDirectory } from '@tauri-apps/api/fs';
import type { StorageAdapter } from './types';
import type { Project } from '../../types';

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

  async saveAsset(file: File): Promise<string> {
    await this.init();
    const ext = file.name.split('.').pop();
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${DATA_DIR}/${ASSETS_DIR}/${filename}`;

    const buffer = await file.arrayBuffer();
    await writeBinaryFile(filePath, new Uint8Array(buffer), { dir: BaseDirectory.Document });

    return filename;
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    await this.init();
    try {
      const filePath = `${DATA_DIR}/${ASSETS_DIR}/${assetId}`;
      const contents = await readBinaryFile(filePath, { dir: BaseDirectory.Document });

      // Determine mime type based on extension
      const ext = assetId.split('.').pop()?.toLowerCase();
      let type = 'application/octet-stream';
      if (ext === 'png') type = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
      if (ext === 'mp4') type = 'video/mp4';

      return new Blob([contents as any], { type });
    } catch (e) {
      console.error('Failed to load asset', e);
      return null;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.init();
    try {
      const filePath = `${DATA_DIR}/${ASSETS_DIR}/${assetId}`;
      if (await exists(filePath, { dir: BaseDirectory.Document })) {
        await removeFile(filePath, { dir: BaseDirectory.Document });
      }
    } catch (e) {
      console.error('Failed to delete asset', e);
    }
  }
}
