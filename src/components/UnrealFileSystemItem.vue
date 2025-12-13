<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronRight, Folder, File, Box, Image, Layers, FileCode, Network, FileText, Tags, Wrench } from 'lucide-vue-next';
import { unrealService } from '../services/unreal';
import { useProjectStore } from '../stores/project';

const props = defineProps<{
  name: string;
  node: any; // The tree node
  depth: number;
  initiallyOpen?: boolean;
}>();

const store = useProjectStore();
const isOpen = ref(props.initiallyOpen || false);
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });

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

function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    showContextMenu.value = true;
    contextMenuPos.value = { x: e.clientX, y: e.clientY };

    const closeMenu = () => {
        showContextMenu.value = false;
        window.removeEventListener('click', closeMenu);
    };
    setTimeout(() => window.addEventListener('click', closeMenu), 0);
}

function openInGraph() {
    unrealService.setGraphRootPath(props.node.path);
  store.setViewMode('graph');
}

async function createOrUpdateDocPage() {
  try {
    await store.createOrUpdateDocPageForUnrealAsset(props.node);
  } finally {
    showContextMenu.value = false;
  }
}

async function autoTagDocPage() {
  try {
    const tags = await store.suggestTagsForUnrealAsset(props.node);
    alert(`Suggested tags:\n\n- ${tags.join('\n- ')}`);
  } finally {
    showContextMenu.value = false;
  }
}

function scanBrokenRefs() {
  const res = store.scanBrokenUnrealReferences();
  if (!res.broken.length) {
    alert('No broken Unreal references found.');
    showContextMenu.value = false;
    return;
  }

  const sample = res.broken.slice(0, 12)
    .map(b => `- ${b.pageTitle} (${b.source}): ${b.ref}`)
    .join('\n');

  alert(`Broken Unreal references: ${res.broken.length}\n\n${sample}${res.broken.length > 12 ? '\n\n...more in console' : ''}`);
  // Useful for debugging / copy-paste
  console.table(res.broken);
  showContextMenu.value = false;
}

function autoFixBrokenRefs() {
  store.runReferenceHygieneAutoFix();
  showContextMenu.value = false;
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
      @contextmenu="handleContextMenu"
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

    <!-- Context Menu -->
    <div v-if="showContextMenu" class="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[150px]" :style="{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }">
        <button @click="openInGraph" class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-blue-600 flex items-center gap-2">
            <Network class="w-3 h-3" />
            Open in Graph View
        </button>

      <button v-if="!isFolder" @click="createOrUpdateDocPage" class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2">
        <FileText class="w-3 h-3" />
        AI: Create/Update Doc Page
      </button>
      <button v-if="!isFolder" @click="autoTagDocPage" class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2">
        <Tags class="w-3 h-3" />
        AI: Suggest Tags
      </button>

      <div class="my-1 border-t border-gray-700"></div>
      <button v-if="isFolder" @click="scanBrokenRefs" class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2">
        <Wrench class="w-3 h-3" />
        Reference Hygiene: Scan
      </button>
      <button v-if="isFolder" @click="autoFixBrokenRefs" class="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2">
        <Wrench class="w-3 h-3" />
        Reference Hygiene: Auto-fix
      </button>
    </div>

    <!-- Children -->
    <div v-if="isFolder && isOpen">
      <UnrealFileSystemItem
        v-for="(child, childName) in node.children"
        :key="childName"
        :name="String(childName)"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
