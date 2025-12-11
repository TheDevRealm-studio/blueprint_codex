<script setup lang="ts">
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

const store = useProjectStore();
const { project, projects, activePageId, currentProjectId } = storeToRefs(store);
const showProjectSelect = ref(false);

function createPage() {
  const title = prompt('Page Title:');
  if (title) {
    store.addPage(title);
  }
}

function createNewProject() {
  const name = prompt('Project Name:');
  if (name) {
    store.createProject(name);
    showProjectSelect.value = false;
  }
}
</script>

<template>
  <div class="w-64 bg-brand-surface border-r border-gray-800 flex flex-col h-full shadow-xl z-20">
    <!-- Project Selector Header -->
    <div class="p-4 border-b border-gray-800 bg-brand-surface">
      <div 
        @click="showProjectSelect = !showProjectSelect"
        class="flex items-center justify-between cursor-pointer group"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-8 h-8 rounded bg-gradient-to-br from-brand-green to-brand-purple flex items-center justify-center text-white font-bold text-xs shrink-0">
            {{ project?.name.substring(0, 2).toUpperCase() || 'BP' }}
          </div>
          <span class="font-bold truncate text-gray-200 group-hover:text-white transition-colors text-sm">{{ project?.name || 'Select Project' }}</span>
        </div>
        <span class="text-xs text-gray-500 group-hover:text-white transition-colors">▼</span>
      </div>
    </div>

    <!-- Project List Dropdown -->
    <div v-if="showProjectSelect" class="bg-brand-dark border-b border-gray-800 max-h-48 overflow-y-auto shadow-inner">
      <div 
        v-for="p in projects" 
        :key="p.id"
        @click="store.selectProject(p.id); showProjectSelect = false"
        class="px-4 py-3 text-sm cursor-pointer hover:bg-brand-surface flex items-center gap-2"
        :class="currentProjectId === p.id ? 'text-brand-green bg-brand-surface/50' : 'text-gray-400'"
      >
        <span class="w-2 h-2 rounded-full" :class="currentProjectId === p.id ? 'bg-brand-green' : 'bg-gray-600'"></span>
        {{ p.name }}
      </div>
      <div 
        @click="createNewProject"
        class="px-4 py-3 text-sm cursor-pointer text-brand-green hover:bg-brand-surface border-t border-gray-800 flex items-center gap-2 font-medium"
      >
        <span>+</span> New Project
      </div>
    </div>

    <!-- Page Explorer -->
    <div class="p-3 flex justify-between items-center">
      <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2">Pages</span>
      <button @click="createPage" class="text-gray-500 hover:text-brand-green transition-colors p-1 rounded hover:bg-gray-800">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
      <div v-if="!project || project.pages.length === 0" class="text-gray-600 text-xs text-center mt-8 italic">
        No pages created yet.
      </div>
      <template v-else>
        <div
          v-for="page in project.pages"
          :key="page.id"
          @click="store.setActivePage(page.id)"
          draggable="true"
          @dragstart="(e) => { e.dataTransfer?.setData('application/x-codex-page', page.id); e.dataTransfer?.setData('text/plain', page.title); }"
          class="cursor-pointer px-3 py-2 rounded-md text-sm mb-1 flex items-center gap-2 group transition-all"
          :class="activePageId === page.id ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'"
        >
          <span class="opacity-50 group-hover:opacity-100">📄</span>
          <span class="truncate">{{ page.title }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
