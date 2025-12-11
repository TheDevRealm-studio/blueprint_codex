<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useProjectStore } from '../stores/project';
import { storeToRefs } from 'pinia';

const store = useProjectStore();
const { project } = storeToRefs(store);

const isOpen = ref(false);
const searchQuery = ref('');
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

interface Command {
  id: string;
  title: string;
  type: 'page' | 'action';
  action: () => void;
  icon?: string;
}

const commands = computed<Command[]>(() => {
  const list: Command[] = [];

  // Actions
  list.push({
    id: 'new-page',
    title: 'Create New Page',
    type: 'action',
    icon: '📄',
    action: () => {
      const title = prompt('Page Title:');
      if (title) store.addPage(title);
    }
  });

  list.push({
    id: 'new-folder',
    title: 'Create New Folder',
    type: 'action',
    icon: '📁',
    action: () => {
      const name = prompt('Folder Name:');
      if (name) store.addFolder(name);
    }
  });

  list.push({
    id: 'toggle-graph',
    title: 'Toggle Graph View',
    type: 'action',
    icon: '🕸️',
    action: () => store.setViewMode('graph')
  });

  // Pages
  if (project.value) {
    Object.values(project.value.pages).forEach(page => {
      list.push({
        id: page.id,
        title: page.title,
        type: 'page',
        icon: '📄',
        action: () => store.setActivePage(page.id)
      });
    });
  }

  return list;
});

const filteredCommands = computed(() => {
  if (!searchQuery.value) return commands.value.slice(0, 10);
  const query = searchQuery.value.toLowerCase();
  return commands.value
    .filter(c => c.title.toLowerCase().includes(query))
    .slice(0, 10);
});

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
      nextTick(() => inputRef.value?.focus());
      searchQuery.value = '';
      selectedIndex.value = 0;
    }
  }

  if (!isOpen.value) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = filteredCommands.value[selectedIndex.value];
    if (cmd) executeCommand(cmd);
  } else if (e.key === 'Escape') {
    isOpen.value = false;
  }
}

function executeCommand(command: Command) {
  if (command) {
    command.action();
    isOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" @click.self="isOpen = false">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

    <div class="relative w-[600px] bg-ue-panel border border-ue-accent shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[400px]">
      <div class="p-3 border-b border-gray-700 flex items-center gap-3">
        <span class="text-gray-400">🔍</span>
        <input
          ref="inputRef"
          v-model="searchQuery"
          class="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
          placeholder="Type a command or search for a page..."
        />
        <span class="text-xs text-gray-500 border border-gray-700 px-1 rounded">ESC</span>
      </div>

      <div class="overflow-y-auto custom-scrollbar">
        <div
          v-for="(command, index) in filteredCommands"
          :key="command.id"
          @click="executeCommand(command)"
          @mouseenter="selectedIndex = index"
          class="px-4 py-3 flex items-center gap-3 cursor-pointer border-l-2"
          :class="index === selectedIndex ? 'bg-ue-accent/20 border-ue-accent' : 'border-transparent hover:bg-white/5'"
        >
          <span class="text-lg">{{ command.icon }}</span>
          <div class="flex flex-col">
            <span class="text-sm font-medium text-gray-200">{{ command.title }}</span>
            <span class="text-[10px] text-gray-500 uppercase">{{ command.type }}</span>
          </div>
        </div>

        <div v-if="filteredCommands.length === 0" class="p-4 text-center text-gray-500 italic">
          No results found.
        </div>
      </div>
    </div>
  </div>
</template>
