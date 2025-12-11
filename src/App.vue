<script setup lang="ts">
import Sidebar from './components/Sidebar.vue';
import Editor from './components/Editor.vue';
import CommandPalette from './components/CommandPalette.vue';
import KnowledgeGraph from './components/views/KnowledgeGraph.vue';
import { useProjectStore } from './stores/project';

const projectStore = useProjectStore();
</script>

<template>
  <div class="h-screen w-screen bg-cyber-dark text-cyber-text flex flex-col font-mono">
    <CommandPalette />
    <header class="h-12 bg-cyber-panel border-b border-cyber-green/20 flex items-center px-4 shrink-0 justify-between backdrop-blur-sm bg-opacity-90">
      <h1 class="text-lg font-bold text-cyber-green tracking-wider flex items-center gap-2">
        <span class="text-cyber-purple">&lt;&gt;</span>
        BLUEPRINT_CODEX
      </h1>

      <div class="flex items-center gap-3 text-xs font-mono">
        <button 
          @click="projectStore.showKnowledgeGraph = !projectStore.showKnowledgeGraph"
          class="px-3 py-1 rounded border border-cyber-blue/30 text-cyber-blue hover:bg-cyber-blue/10 transition-all flex items-center gap-2"
          :class="{ 'bg-cyber-blue/20 border-cyber-blue': projectStore.showKnowledgeGraph }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          {{ projectStore.showKnowledgeGraph ? 'CLOSE_GRAPH' : 'KNOWLEDGE_GRAPH' }}
        </button>

        <div v-if="projectStore.serverStatus === 'offline'" class="text-red-400 flex items-center gap-2 bg-red-900/20 px-2 py-1 rounded border border-red-900">
          <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          OFFLINE
        </div>
        <div v-else-if="projectStore.serverStatus === 'checking'" class="text-gray-400">
          CONNECTING...
        </div>
        <div v-else class="flex items-center gap-3">
           <div v-if="projectStore.saveStatus === 'saving'" class="text-cyber-orange">SAVING...</div>
           <div v-else-if="projectStore.saveStatus === 'saved'" class="text-cyber-green">SAVED</div>
           <div v-else-if="projectStore.saveStatus === 'error'" class="text-red-400">ERROR</div>
           <div class="text-gray-600">LOCAL_STORAGE</div>
        </div>
      </div>
    </header>
    <main class="flex-1 overflow-hidden flex p-2 gap-2">
      <Sidebar class="rounded border border-cyber-green/10 bg-cyber-panel/50 backdrop-blur-sm" />
      <div class="flex-1 overflow-hidden bg-cyber-dark relative rounded border border-cyber-green/10 bg-opacity-50">
        <Editor v-show="!projectStore.showKnowledgeGraph" />
        <KnowledgeGraph v-if="projectStore.showKnowledgeGraph" class="absolute inset-0 z-10" />
      </div>
    </main>
  </div>
</template>
