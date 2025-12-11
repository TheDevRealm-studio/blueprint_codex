<script setup lang="ts">
import Sidebar from './components/Sidebar.vue';
import Editor from './components/Editor.vue';
import CommandPalette from './components/CommandPalette.vue';
import { useProjectStore } from './stores/project';

const projectStore = useProjectStore();
</script>

<template>
  <div class="h-screen w-screen bg-ue-dark text-white flex flex-col">
    <CommandPalette />
    <header class="h-12 bg-ue-panel border-b border-gray-700 flex items-center px-4 shrink-0 justify-between">
      <h1 class="text-lg font-bold text-ue-accent">Blueprint Codex</h1>

      <div class="flex items-center gap-3 text-xs font-mono">
        <div v-if="projectStore.serverStatus === 'offline'" class="text-red-400 flex items-center gap-2 bg-red-900/20 px-2 py-1 rounded border border-red-900">
          <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          STORAGE OFFLINE - Run 'npm run server'
        </div>
        <div v-else-if="projectStore.serverStatus === 'checking'" class="text-gray-400">
          Connecting...
        </div>
        <div v-else class="flex items-center gap-3">
           <div v-if="projectStore.saveStatus === 'saving'" class="text-yellow-400">Saving...</div>
           <div v-else-if="projectStore.saveStatus === 'saved'" class="text-green-400">Saved</div>
           <div v-else-if="projectStore.saveStatus === 'error'" class="text-red-400">Save Failed</div>
           <div class="text-gray-500">Local Storage Active</div>
        </div>
      </div>
    </header>
    <main class="flex-1 overflow-hidden flex">
      <Sidebar />
      <div class="flex-1 overflow-hidden bg-ue-dark">
        <Editor />
      </div>
    </main>
  </div>
</template>
