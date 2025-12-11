<script setup lang="ts">
import { computed, ref } from 'vue';
import { unrealService } from '../services/unreal';
import { useProjectStore } from '../stores/project';
import UnrealFileSystemItem from './UnrealFileSystemItem.vue';
import { FolderSearch, Network, Search, X } from 'lucide-vue-next';

const store = useProjectStore();
const assets = unrealService.getAssets();
const isScanning = unrealService.getIsScanning();
const tree = computed(() => unrealService.assetTree);

const searchQuery = ref('');
const searchResults = computed(() => unrealService.search(searchQuery.value));

async function scanProject() {
  await unrealService.selectProject();
}

function toggleGraph() {
  store.viewMode = store.viewMode === 'project-graph' ? 'editor' : 'project-graph';
}

function clearSearch() {
    searchQuery.value = '';
}
</script>

<template>
  <div class="flex flex-col h-full bg-ue-panel border-t border-black">
    <!-- Header -->
    <div class="p-2 bg-ue-dark border-b border-black flex flex-col gap-2">
      <div class="flex items-center justify-between">
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

      <!-- Search Bar -->
      <div class="relative">
          <Search class="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search assets..."
            class="w-full bg-black/20 border border-gray-700 rounded pl-7 pr-6 py-1 text-xs text-gray-300 focus:outline-none focus:border-ue-accent placeholder:text-gray-600"
          />
          <button
            v-if="searchQuery"
            @click="clearSearch"
            class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <X class="w-3 h-3" />
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

      <!-- Search Results -->
      <div v-else-if="searchQuery" class="flex flex-col">
          <div v-if="searchResults.length === 0" class="p-4 text-center text-gray-500 text-xs">
              No assets found.
          </div>
          <UnrealFileSystemItem
            v-for="asset in searchResults"
            :key="asset.path"
            :name="asset.name"
            :node="{ ...asset, type: 'file' }"
            :depth="0"
          />
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
