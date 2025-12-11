import type { StorageAdapter } from './types';
import type { Project } from '../../types';
import { openDB, type DBSchema } from 'idb';

const STORAGE_KEY = 'blueprint-codex-projects';
const DB_NAME = 'blueprint-codex-db';
const DB_VERSION = 1;

interface CodexDB extends DBSchema {
  files: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      name: string;
      type: string;
      createdAt: number;
    };
  };
}

export class BrowserStorage implements StorageAdapter {
  private dbPromise;

  constructor() {
    this.dbPromise = openDB<CodexDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
      },
    });
  }

  // --- Project Data (LocalStorage) ---

  async loadProjects(): Promise<Project[]> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Handle both old format (just array) and new format (object)
        return Array.isArray(data) ? data : (data.projects || []);
      } catch (e) {
        console.error('Failed to parse projects', e);
        return [];
      }
    }
    return [];
  }

  async saveProjects(projects: Project[]): Promise<void> {
    // We only save the projects array here.
    // The store might handle currentProjectId separately or we can bundle it.
    // For the adapter, let's just save the data.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects }));
  }

  // --- Asset Data (IndexedDB) ---

  async saveAsset(file: File): Promise<string> {
    const db = await this.dbPromise;
    const id = crypto.randomUUID();
    await db.put('files', {
      id,
      blob: file,
      name: file.name,
      type: file.type,
      createdAt: Date.now(),
    });
    return id;
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    const db = await this.dbPromise;
    const record = await db.get('files', assetId);
    return record ? record.blob : null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('files', assetId);
  }
}
