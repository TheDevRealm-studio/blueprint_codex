<script setup lang="ts">
import Sidebar from './components/Sidebar.vue';
import Editor from './components/Editor.vue';
</script>

<template>
  <div class="h-screen w-screen bg-ue-dark text-white flex flex-col">
    <header class="h-12 bg-ue-panel border-b border-gray-700 flex items-center px-4 shrink-0">
      <h1 class="text-lg font-bold text-ue-accent">Blueprint Codex</h1>
    </header>
    <main class="flex-1 overflow-hidden flex">
      <Sidebar />
      <div class="flex-1 overflow-hidden bg-ue-dark">
        <Editor />
      </div>
    </main>
  </div>
</template>
