<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';
import DocumentView from './views/DocumentView.vue';
import CanvasView from './views/CanvasView.vue';
import { exportPageToMarkdown, downloadMarkdown } from '../utils/export';

const store = useProjectStore();
const { project, activePageId } = storeToRefs(store);

const activePage = computed(() => 
  project.value?.pages.find(p => p.id === activePageId.value)
);

function handleExport() {
  if (activePage.value) {
    const md = exportPageToMarkdown(activePage.value);
    downloadMarkdown(`${activePage.value.slug}.md`, md);
  }
}
</script>

<template>
  <div v-if="activePage" class="flex flex-col h-full">
    <div class="h-12 border-b border-gray-700 flex items-center justify-between px-6 bg-ue-panel">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold">{{ activePage.title }}</h2>
        <button @click="handleExport" class="text-xs bg-ue-dark border border-gray-600 px-2 py-1 rounded hover:bg-gray-700">
          Export MD
        </button>
      </div>
      <div class="flex gap-2 bg-black/20 p-1 rounded">
        <button 
          @click="store.updatePage(activePage.id, { viewMode: 'document' })"
          class="px-3 py-1 text-sm rounded"
          :class="activePage.viewMode === 'document' ? 'bg-ue-accent text-white' : 'text-gray-400 hover:text-white'"
        >
          Document
        </button>
        <button 
          @click="store.updatePage(activePage.id, { viewMode: 'canvas' })"
          class="px-3 py-1 text-sm rounded"
          :class="activePage.viewMode === 'canvas' ? 'bg-ue-accent text-white' : 'text-gray-400 hover:text-white'"
        >
          Canvas
        </button>
      </div>
    </div>
    
    <div class="flex-1 overflow-hidden relative">
      <DocumentView v-if="activePage.viewMode === 'document'" :page-id="activePage.id" />
      <CanvasView v-else :page-id="activePage.id" />
    </div>
  </div>
  <div v-else class="flex items-center justify-center h-full text-gray-500">
    Select a page to start editing
  </div>
</template>
