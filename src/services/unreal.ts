import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { ref, computed } from 'vue';

export interface UnrealAsset {
  name: string;
  path: string; // Relative to Content folder e.g. /Game/Characters/MyChar
  asset_type: string; // e.g. 'Blueprint', 'Texture', 'Material'
  file_path: string;
}

class UnrealService {
  private assets = ref<UnrealAsset[]>([]);
  private isScanning = ref(false);
  private projectPath = ref<string | null>(null);

  // Tree structure for the Content Browser
  get assetTree() {
    const tree: any = { name: 'Content', children: {}, type: 'folder', path: '/Game' };

    this.assets.value.forEach(asset => {
      // Remove /Game/ prefix
      const relative = asset.path.replace(/^\/Game\//, '');
      const parts = relative.split('/');

      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's the file
          current.children[part] = { ...asset, type: 'file' };
        } else {
          // It's a folder
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              children: {},
              type: 'folder',
              path: current.path + '/' + part
            };
          }
          current = current.children[part];
        }
      });
    });

    return tree;
  }

  getAssets() {
    return this.assets;
  }

  getIsScanning() {
    return this.isScanning;
  }

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
        await this.scanProject(selected);
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
      console.log('Scanning project at:', rootPath);
      const assets = await invoke<UnrealAsset[]>('scan_unreal_project', { path: rootPath });
      console.log('Scan complete. Found assets:', assets.length);
      this.assets.value = assets;
    } catch (e) {
      console.error('Failed to scan project', e);
      alert('Failed to scan project: ' + e);
    } finally {
      this.isScanning.value = false;
    }
  }

  search(query: string): UnrealAsset[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.assets.value.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.path.toLowerCase().includes(q)
    ).slice(0, 20); // Limit results
  }
}

export const unrealService = new UnrealService();
