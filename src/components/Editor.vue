<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';
import DocumentView from './views/DocumentView.vue';
import CanvasView from './views/CanvasView.vue';
import GraphView from './views/GraphView.vue';
import { exportPageToMarkdown, downloadMarkdown } from '../utils/export';
import type { Block } from '../types';
import { storage } from '../services/storage';

const store = useProjectStore();
const { project, activePageId, viewMode, openPageIds } = storeToRefs(store);

const activePage = computed(() =>
  activePageId.value && project.value ? project.value.pages[activePageId.value] : null
);

const openPages = computed(() => {
  if (!project.value) return [];
  return openPageIds.value.map(id => project.value!.pages[id]).filter((p): p is any => !!p);
});

function handleExport() {
  if (activePage.value) {
    const md = exportPageToMarkdown(activePage.value);
    downloadMarkdown(`${activePage.value.slug}.md`, md);
  }
}

function handlePaste(event: ClipboardEvent) {
  if (!activePage.value) return;

  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      if (blob) {
        // Save to storage (Local or Browser)
        storage.saveAsset(blob).then(assetId => {
          const newBlock: Block = {
            id: crypto.randomUUID(),
            type: 'media',
            content: {
              label: 'Pasted Image',
              filePath: assetId, // Store ID instead of Data URL
              kind: 'image'
            },
            x: 100 + Math.random() * 50,
            y: 100 + Math.random() * 50,
            width: 300,
            height: 200
          };

          const currentBlocks = activePage.value!.blocks || [];
          store.updatePage(activePage.value!.id, { blocks: [...currentBlocks, newBlock] });
        }).catch(err => {
          console.error('Failed to save pasted image', err);
          alert('Failed to save image. If using browser storage, you might be out of space.');
        });
      }
    }
  }
}onMounted(() => {
  window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste);
});
</script>

<template>
  <div v-if="viewMode === 'graph'" class="h-full w-full">
    <GraphView />
  </div>
  <div v-else class="flex flex-col h-full">
    <!-- Tab Bar -->
    <div v-if="openPages.length > 0" class="h-9 bg-[#151515] flex items-end px-2 gap-1 overflow-x-auto custom-scrollbar border-b border-black">
      <div
        v-for="page in openPages"
        :key="page.id"
        @click="store.setActivePage(page.id)"
        class="group relative h-8 px-3 min-w-[120px] max-w-[200px] flex items-center justify-between gap-2 rounded-t text-xs cursor-pointer select-none border-t border-x border-transparent hover:bg-[#2a2a2a]"
        :class="activePageId === page.id ? 'bg-ue-panel text-ue-accent border-black !border-b-ue-panel' : 'bg-[#1a1a1a] text-gray-400 border-b-black'"
      >
        <span class="truncate">{{ page.title }}</span>
        <button
          @click.stop="store.closePage(page.id)"
          class="opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white rounded-full w-4 h-4 flex items-center justify-center transition-all"
        >
          ×
        </button>
        <!-- Active Indicator Line -->
        <div v-if="activePageId === page.id" class="absolute top-0 left-0 w-full h-[2px] bg-ue-accent"></div>
      </div>
    </div>

    <!-- Toolbar (Only if active page) -->
    <div v-if="activePage" class="h-12 border-b border-gray-700 flex items-center justify-between px-6 bg-ue-panel">
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

        <!-- Content -->
    <div v-if="activePage" class="flex-1 overflow-hidden relative">
      <DocumentView v-if="activePage.viewMode === 'document'" :page-id="activePage.id" />
      <CanvasView v-else :page-id="activePage.id" />
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-gray-500 italic">
      No page open. Select a page from the sidebar or create a new one.
    </div>
  </div>
</template>
