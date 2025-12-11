<script setup lang="ts">
import { computed } from 'vue';
import type { FileSystemNode } from '../types';
import { useProjectStore } from '../stores/project';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-vue-next';

const props = defineProps<{
  node: FileSystemNode;
  depth: number;
}>();

const emit = defineEmits<{
  (e: 'node-context-menu', event: MouseEvent, node: FileSystemNode): void;
}>();

const store = useProjectStore();

const isFolder = computed(() => props.node.type === 'folder');
const isActive = computed(() => props.node.type === 'page' && store.activePageId === props.node.pageId);

function handleClick() {
  if (isFolder.value) {
    store.toggleFolder(props.node.id);
  } else if (props.node.pageId) {
    store.setActivePage(props.node.pageId);
  }
}

function handleDragStart(e: DragEvent) {
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'all';
        e.dataTransfer.setData('application/x-codex-node', props.node.id);
        if (props.node.type === 'page' && props.node.pageId) {
            e.dataTransfer.setData('application/x-codex-page', props.node.pageId);
            e.dataTransfer.setData('text/plain', `[[${props.node.name}]]`);
        }
    }
}

function handleDrop(e: DragEvent) {
  const nodeId = e.dataTransfer?.getData('application/x-codex-node');
  if (nodeId && isFolder.value) {
    e.stopPropagation(); // Prevent bubbling
    store.moveNode(nodeId, props.node.id);
    // Open folder on drop
    if (!props.node.isOpen) store.toggleFolder(props.node.id);
  }
}

function handleContextMenu(e: MouseEvent) {
  emit('node-context-menu', e, props.node);
}
</script>

<template>
  <div>
    <div
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu"
      @dragstart="handleDragStart"
      @drop="handleDrop"
      @dragover.prevent
      draggable="true"
      class="flex items-center gap-2 py-1 px-2 cursor-pointer select-none transition-colors border-l-2"
      :class="[
        isActive ? 'bg-ue-selected/20 border-ue-selected text-white' : 'border-transparent hover:bg-white/5 text-ue-text',
        depth > 0 ? 'ml-3' : ''
      ]"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
    >
      <!-- Folder Icon / Arrow -->
      <span v-if="isFolder" class="text-[10px] w-4 text-center text-gray-500 flex items-center justify-center">
        <ChevronDown v-if="node.isOpen" class="w-3 h-3" />
        <ChevronRight v-else class="w-3 h-3" />
      </span>

      <!-- Type Icon -->
      <span class="text-sm opacity-80 flex items-center">
        <template v-if="isFolder">
            <Folder class="w-3.5 h-3.5 text-brand-orange" />
        </template>
        <template v-else>
            <FileText class="w-3.5 h-3.5 text-brand-purple" />
        </template>
      </span>

      <span class="text-sm truncate">{{ node.name }}</span>
    </div>

    <!-- Children -->
    <div v-if="isFolder && node.isOpen && node.children">
      <FileSystemItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        @node-context-menu="(e: MouseEvent, n: FileSystemNode) => emit('node-context-menu', e, n)"
      />
    </div>
  </div>
</template>
