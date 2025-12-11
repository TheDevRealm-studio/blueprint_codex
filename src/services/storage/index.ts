import { BrowserStorage } from './BrowserStorage';
import type { StorageAdapter } from './types';

// Singleton instance
// In the future, we can swap this based on environment (e.g. if (window.electron) ...)
export const storage: StorageAdapter = new BrowserStorage();
