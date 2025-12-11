<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { open } from '@tauri-apps/api/dialog';
import { storage } from '../services/storage';
import { TauriStorage } from '../services/storage/TauriStorage';
import { X } from 'lucide-vue-next';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits(['close']);

const currentPath = ref('');
const isLoading = ref(false);

onMounted(async () => {
  // Wait for init if needed, though usually it's done by now
  const adapter = storage.currentAdapter;
  if (adapter instanceof TauriStorage) {
    currentPath.value = await adapter.getLibraryPath();
  }
});

async function selectFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Library Location'
    });

    if (selected && typeof selected === 'string') {
      const adapter = storage.currentAdapter;
      if (adapter instanceof TauriStorage) {
        isLoading.value = true;
        await adapter.setLibraryPath(selected);
        currentPath.value = selected;
        // Reload window to refresh everything cleanly
        window.location.reload();
      }
    }
  } catch (e) {
    console.error('Failed to select folder', e);
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
    <div class="bg-cyber-panel border border-cyber-green/30 rounded-lg w-96 shadow-[0_0_30px_rgba(0,255,157,0.2)] overflow-hidden">
      <div class="bg-cyber-header px-4 py-3 border-b border-cyber-green/20 flex justify-between items-center">
        <h3 class="text-cyber-green font-bold tracking-wider">SETTINGS</h3>
        <button @click="$emit('close')" class="text-cyber-text hover:text-cyber-green transition-colors">
            <X class="w-4 h-4" />
        </button>
      </div>
      
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-xs text-cyber-text/70 mb-1 uppercase tracking-wider">Library Location</label>
          <div class="flex gap-2">
            <div class="flex-1 bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text font-mono truncate" :title="currentPath">
              {{ currentPath || 'Loading...' }}
            </div>
            <button 
              @click="selectFolder"
              class="bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 rounded px-3 py-1 text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,157,0.3)]"
              :disabled="isLoading"
            >
              {{ isLoading ? '...' : 'CHANGE' }}
            </button>
          </div>
          <p class="text-[10px] text-cyber-text/40 mt-2">
            Select a folder to store your projects and assets. This is useful for keeping documentation inside your Unreal Engine project.
          </p>
        </div>
      </div>

      <div class="bg-cyber-dark/30 px-4 py-3 border-t border-cyber-green/10 flex justify-end">
        <button 
          @click="$emit('close')"
          class="px-4 py-1.5 rounded text-xs text-cyber-text hover:text-cyber-green transition-colors"
        >
          CLOSE
        </button>
      </div>
    </div>
  </div>
</template>
