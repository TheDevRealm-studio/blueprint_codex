<script setup lang="ts">
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import FileSystemItem from './FileSystemItem.vue';
import InputModal from './InputModal.vue';
import type { FileSystemNode } from '../types';

const store = useProjectStore();
const { project, projects, currentProjectId } = storeToRefs(store);
const showProjectSelect = ref(false);

// Modal State
const modalState = ref<{
  show: boolean;
  title: string;
  placeholder: string;
  initialValue: string;
  mode: 'createPage' | 'createFolder' | 'createProject' | 'rename' | 'createPageInFolder' | 'createFolderInFolder';
  targetId?: string;
}>({
  show: false,
  title: '',
  placeholder: '',
  initialValue: '',
  mode: 'createPage'
});

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  node: FileSystemNode | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  node: null
});

function openModal(mode: typeof modalState.value.mode, title: string, placeholder: string, initialValue = '', targetId?: string) {
  modalState.value = {
    show: true,
    title,
    placeholder,
    initialValue,
    mode,
    targetId
  };
}

function handleModalConfirm(value: string, templateId?: string) {
  const { mode, targetId } = modalState.value;
  
  switch (mode) {
    case 'createPage':
      store.addPage(value, undefined, templateId);
      break;
    case 'createFolder':
      store.addFolder(value);
      break;
    case 'createProject':
      store.createProject(value);
      showProjectSelect.value = false;
      break;
    case 'rename':
      if (targetId) store.renameNode(targetId, value);
      break;
    case 'createPageInFolder':
      if (targetId) store.addPage(value, targetId, templateId);
      break;
    case 'createFolderInFolder':
      if (targetId) store.addFolder(value, targetId);
      break;
  }
}

function createPage() {
  openModal('createPage', 'New Page', 'Enter page title');
}

function createFolder() {
  openModal('createFolder', 'New Folder', 'Enter folder name');
}

function createNewProject() {
  openModal('createProject', 'New Project', 'Enter project name');
}

function openContextMenu(e: MouseEvent, node: FileSystemNode) {
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node
  };
  // Add global click listener to close
  setTimeout(() => window.addEventListener('click', closeContextMenu), 0);
}

function closeContextMenu() {
  contextMenu.value.visible = false;
  window.removeEventListener('click', closeContextMenu);
}

function handleRename() {
  if (!contextMenu.value.node) return;
  openModal('rename', 'Rename Item', 'Enter new name', contextMenu.value.node.name, contextMenu.value.node.id);
}

function handleDelete() {
  if (!contextMenu.value.node) return;
  if (confirm(`Delete "${contextMenu.value.node.name}"?`)) {
    store.deleteNode(contextMenu.value.node.id);
  }
}

function handleNewPageInFolder() {
    if (!contextMenu.value.node) return;
    openModal('createPageInFolder', 'New Page', 'Enter page title', '', contextMenu.value.node.id);
}

function handleNewFolderInFolder() {
    if (!contextMenu.value.node) return;
    openModal('createFolderInFolder', 'New Folder', 'Enter folder name', '', contextMenu.value.node.id);
}

function exportProject() {
  if (!project.value) return;
  const data = JSON.stringify(project.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.value.name.replace(/\s+/g, '_')}_backup.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedProject = JSON.parse(content);
        if (importedProject.id && importedProject.name) {
          store.importProject(importedProject);
        } else {
          alert('Invalid project file');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse project file');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

</script>

<template>
  <div class="w-72 bg-cyber-panel border-r border-cyber-green/20 flex flex-col h-full shadow-xl z-20 select-none font-mono">
    <!-- Project Selector Header -->
    <div class="p-3 border-b border-cyber-green/20 bg-cyber-header">
      <div
        @click="showProjectSelect = !showProjectSelect"
        class="flex items-center justify-between cursor-pointer group"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-6 h-6 rounded bg-cyber-green/20 border border-cyber-green text-cyber-green flex items-center justify-center font-bold text-[10px] shrink-0 shadow-[0_0_10px_rgba(0,255,157,0.2)]">
            {{ project?.name.substring(0, 2).toUpperCase() || 'BP' }}
          </div>
          <span class="font-bold truncate text-cyber-text group-hover:text-cyber-green transition-colors text-sm">{{ project?.name || 'SELECT_PROJECT' }}</span>
        </div>
        <span class="text-[10px] text-cyber-text/50 group-hover:text-cyber-green transition-colors">▼</span>
      </div>

      <!-- Project Actions -->
      <div class="flex gap-1 mt-2 pt-2 border-t border-cyber-green/10">
        <button @click="exportProject" class="flex-1 bg-cyber-dark/50 hover:bg-cyber-green/10 border border-transparent hover:border-cyber-green/30 text-[10px] text-cyber-text hover:text-cyber-green py-1 rounded transition-all" title="Export Project">
          EXPORT
        </button>
        <button @click="importProject" class="flex-1 bg-cyber-dark/50 hover:bg-cyber-green/10 border border-transparent hover:border-cyber-green/30 text-[10px] text-cyber-text hover:text-cyber-green py-1 rounded transition-all" title="Import Project">
          IMPORT
        </button>
        <button @click="store.linkUnrealProject" class="flex-1 bg-cyber-dark/50 hover:bg-cyber-green/10 border border-transparent hover:border-cyber-green/30 text-[10px] text-cyber-text hover:text-cyber-green py-1 rounded transition-all" :title="project?.unrealProjectPath ? 'Linked: ' + project.unrealProjectPath : 'Link Unreal Project'">
          {{ project?.unrealProjectPath ? 'LINKED' : 'LINK_UE' }}
        </button>
      </div>

      <!-- Search Trigger -->
      <div class="mt-2 relative" @click="store.isCommandPaletteOpen = true">
        <div class="bg-cyber-dark/50 border border-cyber-green/20 rounded px-2 py-1 text-xs text-cyber-text/70 flex items-center gap-2 cursor-pointer hover:border-cyber-green/50 hover:text-cyber-green transition-all">
          <span>🔍</span>
          <span>SEARCH...</span>
          <span class="ml-auto text-[10px] border border-cyber-green/20 px-1 rounded text-cyber-green/70">CMD+K</span>
        </div>
      </div>
    </div>

    <!-- Project List Dropdown -->
    <div v-if="showProjectSelect" class="bg-cyber-dark border border-cyber-green/30 max-h-48 overflow-y-auto shadow-[0_0_20px_rgba(0,0,0,0.5)] absolute top-12 w-72 z-50 rounded-b">
      <div
        v-for="p in projects"
        :key="p.id"
        @click="store.selectProject(p.id); showProjectSelect = false"
        class="px-4 py-2 text-sm cursor-pointer hover:bg-cyber-green/10 flex items-center gap-2 border-l-2 border-transparent hover:border-cyber-green"
        :class="currentProjectId === p.id ? 'text-cyber-green bg-cyber-green/5 border-cyber-green' : 'text-cyber-text'"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="currentProjectId === p.id ? 'bg-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.5)]' : 'bg-cyber-text/30'"></span>
        {{ p.name }}
      </div>
      <div
        @click="createNewProject"
        class="px-4 py-2 text-sm cursor-pointer text-cyber-green hover:bg-cyber-green/10 border-t border-cyber-green/20 flex items-center gap-2 font-medium"
      >
        <span>+</span> NEW_PROJECT
      </div>
    </div>

    <!-- Content Browser Header -->
    <div class="px-3 py-2 flex justify-between items-center bg-cyber-panel border-b border-cyber-green/20">
      <span class="text-xs font-bold text-cyber-green/70 uppercase tracking-wider flex items-center gap-2">
        <span>></span> CONTENT_BROWSER
      </span>
      <div class="flex gap-1">
        <button @click="createFolder" class="text-cyber-text hover:text-cyber-green transition-colors p-1 rounded hover:bg-cyber-green/10" title="New Folder">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
        </button>
        <button @click="createPage" class="text-cyber-text hover:text-cyber-green transition-colors p-1 rounded hover:bg-cyber-green/10" title="New Page">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        </button>
      </div>
    </div>

    <!-- Tree View -->
    <div class="flex-1 overflow-y-auto py-2 custom-scrollbar bg-cyber-dark/30">
      <div v-if="!project || project.structure.length === 0" class="text-cyber-text/40 text-xs text-center mt-8 italic font-mono">
        // NO_CONTENT_FOUND
      </div>
      <template v-else>
        <FileSystemItem
            v-for="node in project.structure"
            :key="node.id"
            :node="node"
            :depth="0"
            @node-context-menu="openContextMenu"
        />
      </template>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="fixed bg-cyber-panel border border-cyber-green/30 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-50 py-1 rounded min-w-[150px]"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
    >
      <div @click="handleRename" class="px-4 py-1 text-xs text-cyber-text hover:bg-cyber-green/20 hover:text-cyber-green cursor-pointer font-mono">> RENAME</div>
      <div @click="handleDelete" class="px-4 py-1 text-xs text-cyber-text hover:bg-red-900/50 hover:text-red-400 cursor-pointer font-mono">> DELETE</div>
      <div v-if="contextMenu.node?.type === 'folder'" class="border-t border-cyber-green/10 my-1"></div>
      <div v-if="contextMenu.node?.type === 'folder'" @click="handleNewPageInFolder" class="px-4 py-1 text-xs text-cyber-text hover:bg-cyber-green/20 hover:text-cyber-green cursor-pointer font-mono">> NEW_PAGE</div>
      <div v-if="contextMenu.node?.type === 'folder'" @click="handleNewFolderInFolder" class="px-4 py-1 text-xs text-cyber-text hover:bg-cyber-green/20 hover:text-cyber-green cursor-pointer font-mono">> NEW_FOLDER</div>
    </div>

    <InputModal
      :show="modalState.show"
      :title="modalState.title"
      :placeholder="modalState.placeholder"
      :initial-value="modalState.initialValue"
      :show-templates="modalState.mode === 'createPage' || modalState.mode === 'createPageInFolder'"
      @close="modalState.show = false"
      @confirm="handleModalConfirm"
    />
  </div>
</template>
