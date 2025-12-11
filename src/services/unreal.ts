import { open } from '@tauri-apps/api/dialog';
import { readDir } from '@tauri-apps/api/fs';
import { ref } from 'vue';

export interface UnrealAsset {
  name: string;
  path: string; // Relative to Content folder e.g. /Game/Characters/MyChar
  type: string; // e.g. 'Blueprint', 'Texture', 'Material'
  fullPath: string;
}

class UnrealService {
  private assets = ref<UnrealAsset[]>([]);
  private isScanning = ref(false);
  private projectPath = ref<string | null>(null);

  async selectProject(): Promise<string | null> {
    try {
      // @ts-ignore
      if (!window.__TAURI__) {
        alert('Unreal Project linking is only available in the Desktop App.');
        return null;
      }

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Unreal Project Root Folder'
      });

      if (selected && typeof selected === 'string') {
        this.projectPath.value = selected;
        this.scanProject(selected);
        return selected;
      }
    } catch (e) {
      console.error('Failed to select project', e);
    }
    return null;
  }

  async scanProject(rootPath: string) {
    this.isScanning.value = true;
    this.assets.value = [];
    
    try {
      // Look for Content folder
      const contentPath = `${rootPath}/Content`;
      // We need to handle path separators properly or rely on Tauri's handling
      // For now assuming standard forward slashes or OS handling
      
      await this.scanDirectory(contentPath, '/Game');
    } catch (e) {
      console.error('Failed to scan project', e);
    } finally {
      this.isScanning.value = false;
    }
  }

  private async scanDirectory(fsPath: string, gamePath: string) {
    try {
      const entries = await readDir(fsPath);
      
      for (const entry of entries) {
        if (entry.children) {
          // It's a directory (Tauri recursive readDir returns children if recursive is true, 
          // but we might want to control recursion to avoid massive reads at once, 
          // or just use recursive: true in the initial call if available/performant)
          // readDir is not recursive by default unless specified.
          // Let's do manual recursion to build paths correctly.
          await this.scanDirectory(entry.path, `${gamePath}/${entry.name}`);
        } else {
          // It's a file
          if (entry.name?.endsWith('.uasset') || entry.name?.endsWith('.umap')) {
            const name = entry.name.replace(/\.[^/.]+$/, "");
            const type = entry.name.endsWith('.umap') ? 'Level' : 'Asset'; // Simple type inference
            
            this.assets.value.push({
              name,
              path: `${gamePath}/${name}`,
              type,
              fullPath: entry.path
            });
          }
        }
      }
    } catch (e) {
      // Directory might not exist or permission denied
      console.warn(`Skipping directory ${fsPath}`, e);
    }
  }

  search(query: string): UnrealAsset[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.assets.value
      .filter(a => a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q))
      .slice(0, 20); // Limit results
  }

  getAssets() {
    return this.assets;
  }

  getIsScanning() {
    return this.isScanning;
  }
}

export const unrealService = new UnrealService();
