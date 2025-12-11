import { openDB, type DBSchema } from 'idb';

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

const DB_NAME = 'blueprint-codex-db';
const DB_VERSION = 1;

export async function initDB() {
  return openDB<CodexDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
    },
  });
}

export async function saveFile(file: File): Promise<string> {
  const db = await initDB();
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

export async function getFile(id: string): Promise<Blob | null> {
  const db = await initDB();
  const record = await db.get('files', id);
  return record ? record.blob : null;
}

export async function deleteFile(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('files', id);
}
