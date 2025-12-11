<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProjectStore } from '../../stores/project';
import type { Block, LinkBlock, Edge as BlockEdge } from '../../types';
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import CustomNode from '../canvas/nodes/CustomNode.vue';

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

const { onConnect, onNodeDragStop, screenToFlowCoordinate } = useVueFlow();

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

function onDrop(event: DragEvent) {
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
  }
}

// --- Toolbar ---

const availableBlocks = [
  { type: 'text', label: 'Text Block', icon: '📝' },
  { type: 'steps', label: 'Steps List', icon: '🔢' },
  { type: 'media', label: 'Media', icon: '🖼️' },
  { type: 'blueprint', label: 'Blueprint', icon: '🕸️' },
  { type: 'code', label: 'Code', icon: '💻' },
  { type: 'asset', label: 'Asset Ref', icon: '📦' },
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
  <div class="w-full h-full bg-ue-dark relative" @drop.prevent="onDrop" @dragover.prevent>
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
        <span class="text-xl mb-1 group-hover:scale-110 transition-transform">{{ block.icon }}</span>
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
