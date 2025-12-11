<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import type { Block } from '../../types';
import BlueprintVisualizer from '../BlueprintVisualizer.vue';
import PanZoomCanvas from '../canvas/PanZoomCanvas.vue';
import DraggableBlock from '../canvas/DraggableBlock.vue';
import MediaDisplay from '../canvas/MediaDisplay.vue';
import { storage } from '../../services/storage';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();

const page = computed(() => store.project?.pages.find(p => p.id === props.pageId));

// Canvas State
const zoom = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const selectedBlockId = ref<string | null>(null);

const availableBlocks = [
  { type: 'text', label: 'Text Block', icon: '📝' },
  { type: 'steps', label: 'Steps List', icon: '🔢' },
  { type: 'media', label: 'Media', icon: '🖼️' },
  { type: 'blueprint', label: 'Blueprint', icon: '🕸️' },
];

const exampleBlocks = [
  {
    label: 'NPC Setup',
    type: 'steps',
    content: ['Create Character BP', 'Add Mesh', 'Setup AnimBP', 'Add AI Controller']
  },
  {
    label: 'Note',
    type: 'text',
    content: '⚠️ Important: Remember to compile before saving!'
  }
];

function addBlock(type: Block['type'], x?: number, y?: number, content?: any) {
  if (!page.value) return;

  // Default position: center of current view
  const finalX = x ?? (-offsetX.value + 400) / zoom.value;
  const finalY = y ?? (-offsetY.value + 300) / zoom.value;

  const size = getDefaultSize(type);

  const newBlock: Block = {
    id: crypto.randomUUID(),
    type,
    content: content || getDefaultContent(type),
    x: finalX,
    y: finalY,
    width: size.w,
    height: size.h
  };

  const newBlocks = [...page.value.blocks, newBlock];
  store.updatePage(page.value.id, { blocks: newBlocks });
  selectedBlockId.value = newBlock.id;
}

function getDefaultContent(type: Block['type']) {
  switch (type) {
    case 'text': return 'New text block';
    case 'steps': return ['Step 1', 'Step 2'];
    case 'media': return { label: 'Image', filePath: '', kind: 'image' };
    case 'blueprint': return { blueprintString: '' };
    default: return {};
  }
}

function getDefaultSize(type: Block['type']) {
  switch (type) {
    case 'text': return { w: 300, h: 200 };
    case 'steps': return { w: 300, h: 300 };
    case 'media': return { w: 400, h: 300 };
    case 'blueprint': return { w: 600, h: 400 };
    default: return { w: 200, h: 200 };
  }
}

function updateBlock(id: string, changes: Partial<Block>) {
  if (!page.value) return;
  const block = page.value.blocks.find(b => b.id === id);
  if (block) {
    Object.assign(block, changes);
  }
}

function deleteBlock(blockId: string) {
  if (!page.value) return;
  const newBlocks = page.value.blocks.filter(b => b.id !== blockId);
  store.updatePage(page.value.id, { blocks: newBlocks });
  if (selectedBlockId.value === blockId) {
    selectedBlockId.value = null;
  }
}

async function handleDropFiles(files: FileList, x: number, y: number) {
  const fileArray = Array.from(files);

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    if (!file) continue;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (isImage || isVideo) {
      try {
        const fileId = await storage.saveAsset(file);
        const size = getDefaultSize('media');

        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: 'media',
          content: {
            label: file.name,
            filePath: fileId,
            kind: isImage ? 'image' : 'video'
          },
          x: x + (i * 20),
          y: y + (i * 20),
          width: size.w,
          height: size.h
        };

        if (page.value) {
          store.updatePage(page.value.id, { blocks: [...page.value.blocks, newBlock] });
        }
      } catch (err) {
        console.error('Failed to save file:', err);
      }
    }
  }
}

function handleCanvasDrop(e: any) {
  // This is called by PanZoomCanvas custom event
  if (e.type === 'files') {
    handleDropFiles(e.files, e.x, e.y);
  } else if (e.type === 'data') {
    const pageId = e.dataTransfer.getData('application/x-codex-page');
    const pageTitle = e.dataTransfer.getData('text/plain');
    
    if (pageId && page.value) {
      const newBlock: Block = {
        id: crypto.randomUUID(),
        type: 'link',
        content: {
          pageId,
          title: pageTitle
        },
        x: e.x,
        y: e.y,
        width: 200,
        height: 80
      };
      store.updatePage(page.value.id, { blocks: [...page.value.blocks, newBlock] });
    }
  }
}
</script>

<template>
  <div class="flex h-full" v-if="page">
    <!-- Canvas Area -->
    <div class="flex-1 bg-[#111] relative overflow-hidden">
      <PanZoomCanvas
        v-model:zoom="zoom"
        v-model:offsetX="offsetX"
        v-model:offsetY="offsetY"
        @drop-item="handleCanvasDrop"
      >
        <DraggableBlock
          v-for="block in page.blocks"
          :key="block.id"
          :id="block.id"
          :x="block.x || 0"
          :y="block.y || 0"
          :width="block.width || 300"
          :height="block.height || 200"
          :selected="selectedBlockId === block.id"
          @update="updateBlock"
          @select="selectedBlockId = $event"
        >
          <div class="flex flex-col h-full">
            <!-- Block Header -->
            <div class="flex items-center justify-between px-2 py-1 bg-ue-panel border-b border-gray-700 cursor-move">
              <span class="text-xs font-bold text-gray-400 uppercase select-none">{{ block.type }}</span>
              <button @click.stop="deleteBlock(block.id)" class="text-gray-500 hover:text-red-400 px-1">×</button>
            </div>

            <!-- Block Content -->
            <div class="flex-1 overflow-auto p-2 bg-ue-panel/80" @mousedown.stop>
              <!-- Link Block -->
              <div v-if="block.type === 'link'" class="h-full flex flex-col items-center justify-center bg-brand-surface border border-brand-purple/30 rounded p-4 group hover:border-brand-purple transition-colors cursor-pointer" @click="store.setActivePage(block.content.pageId)">
                <span class="text-2xl mb-2">🔗</span>
                <span class="text-brand-green font-bold text-center hover:underline">{{ block.content.title }}</span>
                <span class="text-xs text-gray-500 mt-1">Click to open</span>
              </div>

              <!-- Text Block -->
              <div v-else-if="block.type === 'text'" class="h-full">
                <textarea
                  class="w-full h-full bg-transparent border-none resize-none focus:outline-none text-gray-300"
                  v-model="block.content"
                ></textarea>
              </div>

              <!-- Steps Block -->
              <div v-else-if="block.type === 'steps'">
                <div v-for="(_, idx) in block.content" :key="idx" class="flex gap-2 mb-2">
                  <span class="text-gray-500 font-mono">{{ idx + 1 }}.</span>
                  <input
                    type="text"
                    v-model="block.content[idx]"
                    class="flex-1 bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm"
                  >
                </div>
                <button
                  @click="block.content.push('New step')"
                  class="text-xs text-ue-accent hover:underline"
                >+ Add Step</button>
              </div>

              <!-- Blueprint Block -->
              <div v-else-if="block.type === 'blueprint'" class="h-full flex flex-col">
                <div v-if="!block.content.blueprintString" class="p-4 text-center">
                  <textarea
                    class="w-full bg-black/20 border border-gray-700 rounded p-2 text-xs font-mono text-gray-400 mb-2"
                    rows="3"
                    placeholder="Paste Blueprint String here..."
                    v-model="block.content.blueprintString"
                  ></textarea>
                </div>
                <div v-else class="flex-1 relative overflow-hidden border border-gray-700 rounded bg-[#1a1a1a]">
                   <BlueprintVisualizer :blueprint="block.content.blueprintString" />
                   <button
                     @click="block.content.blueprintString = ''"
                     class="absolute top-2 right-2 bg-black/50 text-xs text-white px-2 py-1 rounded hover:bg-red-500"
                   >Edit</button>
                </div>
              </div>

              <!-- Media Block -->
              <div v-else-if="block.type === 'media'" class="h-full flex flex-col">
                <MediaDisplay
                  :src="block.content.filePath"
                  :kind="block.content.kind"
                >
                  <template #label>
                    <input
                      type="text"
                      v-model="block.content.label"
                      class="bg-transparent border-none text-xs text-center text-gray-400 w-full focus:outline-none"
                      placeholder="Label..."
                    >
                  </template>
                </MediaDisplay>
              </div>
            </div>
          </div>
        </DraggableBlock>
      </PanZoomCanvas>
    </div>

    <!-- Floating Palette Dock -->
    <div class="absolute top-4 left-4 flex flex-col gap-4 z-20 pointer-events-none">
      <!-- Tools -->
      <div class="bg-brand-surface/90 backdrop-blur border border-gray-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 pointer-events-auto">
        <div class="text-[10px] font-bold text-gray-500 uppercase text-center mb-1 tracking-wider">Tools</div>
        <button
          v-for="item in availableBlocks"
          :key="item.type"
          @click="addBlock(item.type as any)"
          class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-brand-green/20 hover:text-brand-green text-gray-400 transition-all group relative"
          :title="item.label"
        >
          <span class="text-xl filter grayscale group-hover:grayscale-0 transition-all">{{ item.icon }}</span>
          <!-- Tooltip -->
          <span class="absolute left-full ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {{ item.label }}
          </span>
        </button>
      </div>

      <!-- Examples -->
      <div class="bg-brand-surface/90 backdrop-blur border border-gray-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 pointer-events-auto">
        <div class="text-[10px] font-bold text-gray-500 uppercase text-center mb-1 tracking-wider">Presets</div>
        <button
          v-for="(item, idx) in exampleBlocks"
          :key="idx"
          @click="addBlock(item.type as any, undefined, undefined, item.content)"
          class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-brand-purple/20 hover:text-brand-purple text-gray-400 transition-all group relative"
          :title="item.label"
        >
          <span class="text-xl">💡</span>
          <span class="absolute left-full ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {{ item.label }}
          </span>
        </button>
      </div>
    </div>

    <!-- Help Toast -->
    <div class="absolute bottom-4 left-4 bg-brand-surface/80 backdrop-blur border border-gray-700 rounded-lg p-3 text-xs text-gray-400 pointer-events-none select-none">
      <div class="flex items-center gap-2"><span class="font-bold text-gray-300">Space + Drag</span> to Pan</div>
      <div class="flex items-center gap-2"><span class="font-bold text-gray-300">Wheel</span> to Zoom</div>
      <div class="flex items-center gap-2"><span class="font-bold text-gray-300">Drag & Drop</span> media</div>
    </div>
  </div>
</template>
