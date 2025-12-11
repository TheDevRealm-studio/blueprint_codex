<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronRight, Folder, File, Box, Image, Layers, FileCode } from 'lucide-vue-next';
import type { UnrealAsset } from '../services/unreal';

const props = defineProps<{
  name: string;
  node: any; // The tree node
  depth: number;
}>();

const isOpen = ref(false);

const isFolder = computed(() => props.node.type === 'folder');
const icon = computed(() => {
  if (isFolder.value) return isOpen.value ? Folder : Folder;

  const type = props.node.asset_type;
  if (type === 'Blueprint') return Box;
  if (type === 'Texture') return Image;
  if (type === 'Material') return Layers;
  if (type === 'Level') return FileCode;
  return File;
});

const iconColor = computed(() => {
  if (isFolder.value) return 'text-yellow-500';
  const type = props.node.asset_type;
  if (type === 'Blueprint') return 'text-blue-400';
  if (type === 'Texture') return 'text-red-400';
  if (type === 'Material') return 'text-green-400';
  if (type === 'Level') return 'text-orange-400';
  return 'text-gray-400';
});

function toggle() {
  if (isFolder.value) {
    isOpen.value = !isOpen.value;
  }
}

function handleDragStart(e: DragEvent) {
  if (!isFolder.value && e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy';
    // Pass the full asset object as JSON
    e.dataTransfer.setData('application/x-codex-asset-data', JSON.stringify(props.node));
    // Also pass ID/Path for simple reference
    e.dataTransfer.setData('application/x-codex-asset-ref', props.node.path);
    e.dataTransfer.setData('text/plain', props.node.name);
  }
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1 py-1 px-2 hover:bg-white/5 cursor-pointer select-none text-sm"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="toggle"
      draggable="true"
      @dragstart="handleDragStart"
    >
      <!-- Folder Arrow -->
      <div v-if="isFolder" class="w-4 h-4 flex items-center justify-center text-gray-500">
        <component :is="isOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
      </div>
      <div v-else class="w-4 h-4"></div>

      <!-- Icon -->
      <component :is="icon" class="w-4 h-4" :class="iconColor" />

      <!-- Name -->
      <span class="text-gray-300 truncate flex-1">{{ name }}</span>

      <!-- Status Dot (Placeholder for now) -->
      <!-- <div v-if="!isFolder" class="w-2 h-2 rounded-full bg-red-500/50" title="Undocumented"></div> -->
    </div>

    <!-- Children -->
    <div v-if="isFolder && isOpen">
      <UnrealFileSystemItem
        v-for="(child, childName) in node.children"
        :key="childName"
        :name="childName"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
