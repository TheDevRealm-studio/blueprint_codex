<script setup lang="ts">
import { computed } from 'vue';
import { unrealService } from '../services/unreal';
import { useProjectStore } from '../stores/project';
import UnrealFileSystemItem from './UnrealFileSystemItem.vue';
import { FolderSearch, Network } from 'lucide-vue-next';

const store = useProjectStore();
const assets = unrealService.getAssets();
const isScanning = unrealService.getIsScanning();
const tree = computed(() => unrealService.assetTree);

async function scanProject() {
  await unrealService.selectProject();
}

function toggleGraph() {
  store.viewMode = store.viewMode === 'project-graph' ? 'editor' : 'project-graph';
}
</script>

<template>
  <div class="flex flex-col h-full bg-ue-panel border-t border-black">
    <!-- Header -->
    <div class="p-2 bg-ue-dark border-b border-black flex items-center justify-between">
      <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Unreal Project</span>
      <div class="flex gap-1">
        <button
          @click="toggleGraph"
          class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          title="Toggle Knowledge Graph"
          :class="{ 'text-ue-accent': store.viewMode === 'project-graph' }"
        >
          <Network class="w-4 h-4" />
        </button>
        <button
          @click="scanProject"
          class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          title="Scan Project"
        >
          <FolderSearch class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div v-if="isScanning" class="p-4 text-center text-gray-500 text-sm">
        Scanning project...
      </div>

      <div v-else-if="assets.length === 0" class="p-4 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
        <p>No project linked.</p>
        <button
          @click="scanProject"
          class="px-3 py-1 bg-ue-accent hover:bg-ue-accent/80 text-white rounded text-xs transition-colors"
        >
          Link Project
        </button>
      </div>

      <div v-else>
        <UnrealFileSystemItem
          name="Content"
          :node="tree"
          :depth="0"
        />
      </div>
    </div>
  </div>
</template>
