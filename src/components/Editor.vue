<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';
import DocumentView from './views/DocumentView.vue';
import CanvasView from './views/CanvasView.vue';
import RunbookView from './views/RunbookView.vue';
import ChangeLogView from './views/ChangeLogView.vue';
import GraphView from './views/GraphView.vue';
import DashboardView from './views/DashboardView.vue';
import PageProperties from './PageProperties.vue';
import { exportPageToMarkdown, downloadMarkdown } from '../utils/export';
import type { Block } from '../types';
import { storage } from '../services/storage';
import { Info } from 'lucide-vue-next';

const store = useProjectStore();
const { project, activePageId, viewMode, openPageIds } = storeToRefs(store);
const showProperties = ref(false);

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
        storage.saveAsset(blob).then(asset => {
          const newBlock: Block = {
            id: crypto.randomUUID(),
            type: 'media',
            content: {
              label: asset.name,
              filePath: asset.id, // Store ID instead of Data URL
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
  <div v-else class="flex flex-col h-full font-mono">
    <!-- Tab Bar -->
    <div v-if="openPages.length > 0" class="h-9 bg-cyber-dark flex items-end px-2 gap-1 overflow-x-auto custom-scrollbar border-b border-cyber-green/20">
      <div
        v-for="page in openPages"
        :key="page.id"
        @click="store.setActivePage(page.id)"
        class="group relative h-8 px-3 min-w-[120px] max-w-[200px] flex items-center justify-between gap-2 rounded-t text-xs cursor-pointer select-none border-t border-x border-transparent hover:bg-cyber-green/5 transition-all"
        :class="activePageId === page.id ? 'bg-cyber-panel text-cyber-green border-cyber-green/20 !border-b-cyber-panel' : 'bg-cyber-dark text-cyber-text/50 border-b-cyber-green/20'"
      >
        <span class="truncate">{{ page.title }}</span>
        <button
          @click.stop="store.closePage(page.id)"
          class="opacity-0 group-hover:opacity-100 hover:text-red-400 rounded-full w-4 h-4 flex items-center justify-center transition-all"
        >
          ×
        </button>
        <!-- Active Indicator Line -->
        <div v-if="activePageId === page.id" class="absolute top-0 left-0 w-full h-[2px] bg-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.5)]"></div>
      </div>
    </div>

    <!-- Toolbar (Only if active page) -->
    <div v-if="activePage" class="h-12 border-b border-cyber-green/20 flex items-center justify-between px-6 bg-cyber-panel shrink-0">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-bold text-cyber-text tracking-wide">{{ activePage.title }}</h2>
        <button @click="handleExport" class="text-xs bg-cyber-dark border border-cyber-green/30 text-cyber-green px-2 py-1 rounded hover:bg-cyber-green/10 transition-all">
          EXPORT_MD
        </button>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex gap-2 bg-cyber-dark/50 p-1 rounded border border-cyber-green/10">
          <button
            @click="store.updatePage(activePage.id, { viewMode: 'document' })"
            class="px-3 py-1 text-sm rounded transition-all"
            :class="activePage.viewMode === 'document' ? 'bg-cyber-green/20 text-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.2)]' : 'text-cyber-text/50 hover:text-cyber-text'"
          >
            DOCUMENT
          </button>
          <button
            @click="store.updatePage(activePage.id, { viewMode: 'canvas' })"
            class="px-3 py-1 text-sm rounded transition-all"
            :class="activePage.viewMode === 'canvas' ? 'bg-cyber-green/20 text-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.2)]' : 'text-cyber-text/50 hover:text-cyber-text'"
          >
            CANVAS
          </button>
          <button
            @click="store.updatePage(activePage.id, { viewMode: 'runbook' })"
            class="px-3 py-1 text-sm rounded transition-all"
            :class="activePage.viewMode === 'runbook' ? 'bg-cyber-green/20 text-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.2)]' : 'text-cyber-text/50 hover:text-cyber-text'"
          >
            RUNBOOK
          </button>
          <button
            @click="store.updatePage(activePage.id, { viewMode: 'changelog' })"
            class="px-3 py-1 text-sm rounded transition-all"
            :class="activePage.viewMode === 'changelog' ? 'bg-cyber-green/20 text-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.2)]' : 'text-cyber-text/50 hover:text-cyber-text'"
          >
            CHANGELOG
          </button>
        </div>
        <button
          @click="showProperties = !showProperties"
          class="p-2 rounded hover:bg-cyber-green/10 transition-colors"
          :class="showProperties ? 'text-cyber-green' : 'text-cyber-text/50'"
          title="Toggle Properties"
        >
          <Info class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div v-if="activePage" class="flex-1 flex overflow-hidden bg-cyber-dark/50">
      <div class="flex-1 overflow-hidden relative">
        <DocumentView v-if="activePage.viewMode === 'document'" :page-id="activePage.id" />
        <CanvasView v-else-if="activePage.viewMode === 'canvas'" :page-id="activePage.id" />
        <RunbookView v-else-if="activePage.viewMode === 'runbook'" :page-id="activePage.id" />
        <ChangeLogView v-else-if="activePage.viewMode === 'changelog'" :page-id="activePage.id" />
        <CanvasView v-else :page-id="activePage.id" />
      </div>

      <!-- Properties Panel -->
      <PageProperties v-if="showProperties" :page-id="activePage.id" />
    </div>

    <div v-else class="flex-1 flex overflow-hidden bg-cyber-dark/50">
      <DashboardView class="w-full h-full" />
    </div>
  </div>
</template>
