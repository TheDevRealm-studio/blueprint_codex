<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from '../../stores/project';
import { storage } from '../../services/storage';
import type { Block, LinkBlock, Edge as BlockEdge, YoutubeBlock, WebsiteBlock, MediaBlock } from '../../types';
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import CustomNode from '../canvas/nodes/CustomNode.vue';
import { Type, ListOrdered, Image, Network, Code, Package } from 'lucide-vue-next';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();

const page = computed(() => store.project?.pages[props.pageId]);

// --- Vue Flow State ---

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

const { onConnect, onNodeDragStop, screenToFlowCoordinate, onNodesChange, onEdgesChange } = useVueFlow();

// Sync from Store to Local State
watch(() => page.value, (newPage: any) => {
  if (!newPage) return;

  // Map Blocks to Nodes
  nodes.value = newPage.blocks.map((block: Block) => ({
    id: block.id,
    type: 'custom', // Use our custom node type
    position: { x: block.x, y: block.y },
    data: {
      type: block.type,
      content: block.content,
      width: block.width,
      height: block.height,
      label: getBlockLabel(block),
      pageId: props.pageId, // Pass pageId to node data
      pins: block.pins
    },
  }));

  // Map Edges
  edges.value = (newPage.edges || []).map((edge: BlockEdge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: true,
    style: { stroke: '#555' },
  }));
}, { immediate: true, deep: true });

function getBlockLabel(block: Block) {
    if (block.type === 'media') return block.content.label || 'Media';
    if (block.type === 'steps') return 'Steps';
    if (block.type === 'blueprint') return 'Blueprint';
    if (block.type === 'asset') return 'Asset';
    if (block.type === 'youtube') return 'YouTube';
    if (block.type === 'website') return 'Website';
    return 'Note';
}

// --- Event Handlers ---

onConnect((params: Connection) => {
  const newEdge: BlockEdge = {
    id: crypto.randomUUID(),
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle
  };

  // Update Store
  if (page.value) {
    const currentEdges = page.value.edges || [];
    store.updatePage(page.value.id, { edges: [...currentEdges, newEdge] });
  }
});

onNodesChange((changes) => {
  if (!page.value) return;

  let blocksChanged = false;
  let currentBlocks = [...page.value.blocks];

  changes.forEach((change) => {
    if (change.type === 'remove') {
      const index = currentBlocks.findIndex(b => b.id === change.id);
      if (index !== -1) {
        currentBlocks.splice(index, 1);
        blocksChanged = true;
      }
    }
  });

  if (blocksChanged) {
    store.updatePage(page.value.id, { blocks: currentBlocks });
  }
});

onEdgesChange((changes) => {
  if (!page.value) return;

  let edgesChanged = false;
  let currentEdges = [...(page.value.edges || [])];

  changes.forEach((change) => {
    if (change.type === 'remove') {
      const index = currentEdges.findIndex(e => e.id === change.id);
      if (index !== -1) {
        currentEdges.splice(index, 1);
        edgesChanged = true;
      }
    }
  });

  if (edgesChanged) {
    store.updatePage(page.value.id, { edges: currentEdges });
  }
});

onNodeDragStop((e) => {
  // Update block positions in store
  if (!page.value) return;

  const updatedBlocks = page.value.blocks.map((block: Block) => {
    // Find the matching node in the event nodes or local state
    const matchingNode = e.nodes.find((n: Node) => n.id === block.id) || nodes.value.find((n: Node) => n.id === block.id);
    if (matchingNode) {
      return { ...block, x: matchingNode.position.x, y: matchingNode.position.y };
    }
    return block;
  });

  store.updatePage(page.value.id, { blocks: updatedBlocks });
});

const isDragging = ref(false);

function onDragEnter() {
    isDragging.value = true;
}

function onDragLeave(e: DragEvent) {
    // Only set to false if we're leaving the main container, not entering a child
    if (e.currentTarget === e.target) {
        isDragging.value = false;
    }
}

async function onDrop(event: DragEvent) {
  isDragging.value = false;
  console.log('Drop event detected', event);

  // 1. Handle Internal Page Links
  const pageId = event.dataTransfer?.getData('application/x-codex-page');
  if (pageId && store.project && page.value) {
     const targetPage = store.project.pages[pageId];
     if (targetPage) {
        const position = screenToFlowCoordinate({
            x: event.clientX,
            y: event.clientY,
        });

        const newBlock: LinkBlock = {
            id: crypto.randomUUID(),
            type: 'link',
            content: {
                pageId: targetPage.id,
                title: targetPage.title
            },
            x: position.x,
            y: position.y,
            width: 200,
            height: 100
        };

        const currentBlocks = page.value.blocks || [];
        store.updatePage(page.value.id, { blocks: [...currentBlocks, newBlock] });
     }
     return;
  }

  // 1.5 Handle Internal Assets
  const assetId = event.dataTransfer?.getData('application/x-codex-asset');
  if (assetId && page.value) {
      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      createMediaBlock(assetId, position.x, position.y);
      return;
  }

  // 1.6 Handle Unreal Assets
  const unrealAssetData = event.dataTransfer?.getData('application/x-codex-asset-data');
  if (unrealAssetData && page.value) {
      const asset = JSON.parse(unrealAssetData);
      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      // Construct UE Reference format: Type'/Game/Path/Name.Name'
      // My asset.path is /Game/Path/Name (no extension)
      const reference = `${asset.asset_type}'${asset.path}.${asset.name}'`;

      const newBlock: Block = {
          id: crypto.randomUUID(),
          type: 'asset',
          content: { reference },
          x: position.x,
          y: position.y,
          width: 250,
          height: 100
      };

      const currentBlocks = page.value.blocks || [];
      store.updatePage(page.value.id, { blocks: [...currentBlocks, newBlock] });
      return;
  }

  // 2. Handle Files (Images/Videos)
  const files = event.dataTransfer?.files;
  if (files && files.length > 0 && page.value) {
      console.log('Processing dropped files:', files.length);

      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      // Process files in background without blocking UI
      handleDroppedFiles(Array.from(files), position);
  } else {
      console.log('No files found in drop event. DataTransfer types:', event.dataTransfer?.types);
  }
}

async function handleDroppedFiles(fileArray: File[], position: { x: number; y: number }) {
  const pageId = props.pageId;

  for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file) continue;

      let kind: 'image' | 'video' | null = null;

      if (file.type.startsWith('image/')) kind = 'image';
      else if (file.type.startsWith('video/')) kind = 'video';

      if (!kind) {
          console.log('Skipping file (not image/video):', file.name, file.type);
          continue;
      }

      try {
          console.log('Starting upload for file:', file.name);
          let assetId = '';
          let assetName = file.name;

          // Try to save to storage, fallback to blob URL if it fails
          try {
              const asset = await storage.saveAsset(file);
              assetId = asset.id;
              assetName = asset.name;
              console.log('File uploaded to storage, id:', assetId);
          } catch (storageError) {
              console.warn('Storage save failed, using blob URL:', storageError);
              assetId = URL.createObjectURL(file);
          }

          // Ensure we still have a valid page reference
          const currentPage = store.project?.pages[pageId];
          if (!currentPage) {
              console.error('Page reference lost during file upload');
              return;
          }

          const newBlock: MediaBlock = {
              id: crypto.randomUUID(),
              type: 'media',
              content: {
                  label: assetName,
                  filePath: assetId,
                  kind: kind
              },
              x: position.x + (i * 50),
              y: position.y + (i * 50),
              width: kind === 'video' ? 400 : 300,
              height: 300
          };

          console.log('Creating block for:', file.name);
          const updatedBlocks = [...currentPage.blocks, newBlock];
          store.updatePage(pageId, { blocks: updatedBlocks });
          console.log('Block created and page updated');

      } catch (e) {
          console.error('Failed to process dropped file:', file.name, e);
      }
  }
  console.log('Finished processing all dropped files');
}

// --- Paste Handler ---

async function handlePaste(event: ClipboardEvent) {
    if (!page.value) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    // Calculate position (center of screen or mouse position if we tracked it)
    // For now, let's use a random offset from center or just a fixed point + random
    const x = 200 + Math.random() * 50;
    const y = 200 + Math.random() * 50;

    for (const item of items) {
        if (item.kind === 'string' && item.type === 'text/plain') {
            item.getAsString((text) => {
                if (isValidUrl(text)) {
                    if (isYoutubeUrl(text)) {
                        createYoutubeBlock(text, x, y);
                    } else {
                        createWebsiteBlock(text, x, y);
                    }
                }
            });
        } else if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                try {
                    const asset = await storage.saveAsset(file);
                    createMediaBlock(asset.id, x, y);
                } catch (e) {
                    console.warn('Failed to save asset to storage, using blob URL fallback', e);
                    const blobUrl = URL.createObjectURL(file);
                    createMediaBlock(blobUrl, x, y);
                }
            }
        }
    }
}

function isValidUrl(string: string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function isYoutubeUrl(url: string) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function createYoutubeBlock(url: string, x: number, y: number) {
    if (!page.value) return;
    const newBlock: YoutubeBlock = {
        id: crypto.randomUUID(),
        type: 'youtube',
        content: { url, title: 'YouTube Video' },
        x, y, width: 400, height: 300
    };
    store.updatePage(page.value.id, { blocks: [...page.value.blocks, newBlock] });
}

async function createWebsiteBlock(url: string, x: number, y: number) {
    if (!page.value) return;

    let title = 'Website Link';
    let description = '';
    let imageUrl = '';

    try {
        // Fetch metadata from our local server proxy
        const res = await fetch(`http://localhost:3001/api/metadata?url=${encodeURIComponent(url)}`);
        if (res.ok) {
            const data = await res.json();
            title = data.title || title;
            description = data.description || '';
            imageUrl = data.image || '';
        }
    } catch (e) {
        console.error('Failed to fetch metadata', e);
    }

    const newBlock: WebsiteBlock = {
        id: crypto.randomUUID(),
        type: 'website',
        content: { url, title, description, imageUrl },
        x, y, width: 400, height: 300
    };

    // Get latest state
    const currentPage = store.project?.pages[props.pageId];
    if (currentPage) {
        store.updatePage(props.pageId, { blocks: [...currentPage.blocks, newBlock] });
    }
}

function createMediaBlock(assetId: string, x: number, y: number) {
    if (!page.value) return;

    // We don't have the full asset metadata here synchronously, but we can fetch it or just use the ID.
    // The MediaDisplay component will handle loading.
    // We can try to guess the kind if we had the metadata, but for now default to 'image' and let MediaDisplay handle it?
    // Actually, MediaDisplay needs 'kind' prop.
    // Let's fetch metadata quickly or just default.

    storage.loadAsset(assetId).then(blob => {
        let kind: 'image' | 'video' = 'image';
        if (blob) {
             if (blob.type.startsWith('video')) kind = 'video';
        }

        const newBlock: MediaBlock = {
            id: crypto.randomUUID(),
            type: 'media',
            content: { label: 'Asset', filePath: assetId, kind },
            x, y, width: 300, height: 300
        };
        store.updatePage(page.value!.id, { blocks: [...page.value!.blocks, newBlock] });
    });
}

onMounted(() => {
    window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
    window.removeEventListener('paste', handlePaste);
});

// --- Toolbar ---

const availableBlocks = [
  { type: 'text', label: 'Text Block', icon: Type },
  { type: 'steps', label: 'Steps List', icon: ListOrdered },
  { type: 'media', label: 'Media', icon: Image },
  { type: 'blueprint', label: 'Blueprint', icon: Network },
  { type: 'code', label: 'Code', icon: Code },
  { type: 'asset', label: 'Asset Ref', icon: Package },
];

function addBlock(type: Block['type']) {
  if (!page.value) return;

  // Center of view? For now just random offset or center
  // We can use `project` from useVueFlow to project screen center to flow coords if we had access to viewport
  // For now, fixed position + random offset
  const x = 100 + Math.random() * 50;
  const y = 100 + Math.random() * 50;

  const newBlock: Block = {
    id: crypto.randomUUID(),
    type,
    content: getDefaultContent(type),
    x,
    y,
    width: 300,
    height: 200
  };

  const newBlocks = [...page.value.blocks, newBlock];
  store.updatePage(page.value.id, { blocks: newBlocks });
}

function getDefaultContent(type: Block['type']) {
  switch (type) {
    case 'text': return 'New text block';
    case 'steps': return ['Step 1', 'Step 2'];
    case 'media': return { label: 'Image', filePath: '', kind: 'image' };
    case 'blueprint': return { blueprintString: '' };
    case 'code': return { code: '// Write your code here...', language: 'cpp' };
    default: return {};
  }
}

</script>

<template>
  <div
    class="w-full h-full bg-ue-dark relative"
    @drop.prevent="onDrop"
    @dragover.prevent
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
  >
    <!-- Drag Overlay -->
    <div v-if="isDragging" class="absolute inset-0 z-50 bg-ue-accent/20 border-4 border-ue-accent flex items-center justify-center pointer-events-none">
        <div class="text-white text-2xl font-bold bg-black/80 px-6 py-4 rounded-lg shadow-xl border border-ue-accent backdrop-blur-sm">
            Drop to Add Media
        </div>
    </div>

    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-zoom="1"
      :min-zoom="0.1"
      :max-zoom="4"
      fit-view-on-init
      class="bg-ue-dark"
    >
      <template #node-custom="props">
        <CustomNode v-bind="props" />
      </template>

      <Background pattern-color="#333" :gap="20" />
      <Controls />
    </VueFlow>

    <!-- Floating Toolbar -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-ue-panel border border-black rounded-lg shadow-xl p-2 flex gap-2 z-10">
      <button
        v-for="block in availableBlocks"
        :key="block.type"
        @click="addBlock(block.type as any)"
        class="flex flex-col items-center justify-center w-16 h-14 rounded hover:bg-white/10 transition-colors group"
        :title="block.label"
      >
        <component :is="block.icon" class="w-5 h-5 mb-1 text-gray-300 group-hover:text-white group-hover:scale-110 transition-all" />
        <span class="text-[10px] text-gray-400 uppercase font-bold">{{ block.label.split(' ')[0] }}</span>
      </button>
    </div>
  </div>
</template>

<style>
/* Override Vue Flow styles to match UE theme */
.vue-flow__controls {
  box-shadow: none;
  border: 1px solid #000;
}
.vue-flow__controls-button {
  background: #1E1E1E;
  border-bottom: 1px solid #000;
  fill: #aaa;
}
.vue-flow__controls-button:hover {
  background: #333;
  fill: #fff;
}
.vue-flow__edge-path {
  stroke: #777;
  stroke-width: 2;
}
.vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #F08D49; /* UE Accent */
}
</style>
