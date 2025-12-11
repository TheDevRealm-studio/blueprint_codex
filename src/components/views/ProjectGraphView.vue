<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { unrealService } from '../../services/unreal';
import dagre from '@dagrejs/dagre';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const { fitView, onNodeClick } = useVueFlow();

const assets = unrealService.getAssets();
const graphRoot = unrealService.getGraphRootPath();
const selectedNodeData = ref<any>(null);

onNodeClick(async (e) => {
    const node = e.node;
    // Find the asset in the tree or assets list
    // The node ID is the path
    const asset = assets.value.find(a => a.path === node.id);
    if (asset) {
        selectedNodeData.value = { ...asset, loading: true };
        // Fetch metadata
        const metadata = await unrealService.analyzeAsset(asset.file_path);
        selectedNodeData.value = { ...asset, metadata, loading: false };
    } else {
        selectedNodeData.value = null;
    }
});

function buildGraph() {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  const tree = unrealService.assetTree;
  const newNodes: any[] = [];
  const newEdges: any[] = [];

  // Helper to traverse tree
  function traverse(node: any, parentId: string | null = null) {
    const id = node.path || 'root';

    // Filter by Root Path if set
    if (graphRoot.value && !id.startsWith(graphRoot.value) && graphRoot.value !== id) {
        // If this node is not within the root, check if it IS the root or a parent of the root (to reach the root)
        // Actually, simpler: Find the root node in the tree first, then traverse from there.
        // But since we are traversing from top, we can just skip adding nodes until we hit the root.
        // However, the tree structure is nested.
    }

    const label = node.name;
    const isFolder = node.type === 'folder';

    // Add Node
    g.setNode(id, { width: 150, height: 50 });
    newNodes.push({
      id,
      type: 'default',
      data: { label },
      position: { x: 0, y: 0 }, // Layout will set this
      style: {
        background: isFolder ? '#F08D49' : '#1E1E1E',
        color: isFolder ? '#000' : '#fff',
        border: '1px solid #333',
        borderRadius: '4px',
        width: '150px',
        fontSize: '12px'
      }
    });

    // Add Edge
    if (parentId) {
      g.setEdge(parentId, id);
      newEdges.push({
        id: `${parentId}-${id}`,
        source: parentId,
        target: id,
        type: 'smoothstep',
        animated: true
      });
    }

    // Children
    if (node.children) {
      Object.values(node.children).forEach((child: any) => {
        traverse(child, id);
      });
    }
  }

  // Find the start node
  let startNode = tree;
  if (graphRoot.value) {
      // Navigate to the root node
      // Path format: /Game/Folder/Subfolder
      // Tree format: root -> children['Folder'] -> children['Subfolder']
      // Remove /Game/ prefix
      const relative = graphRoot.value.replace(/^\/Game\//, '');
      const parts = relative.split('/').filter(p => p);

      let current = tree;
      for (const part of parts) {
          if (current.children && current.children[part]) {
              current = current.children[part];
          } else {
              // Path not found, fallback to root
              current = tree;
              break;
          }
      }
      startNode = current;
  }

  traverse(startNode);

  dagre.layout(g);

  // Apply layout
  newNodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWithPosition.width / 2,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    };
  });

  nodes.value = newNodes;
  edges.value = newEdges;

  setTimeout(() => fitView(), 100);
}

watch(() => [assets.value, graphRoot.value], () => {
  buildGraph();
}, { deep: true });

onMounted(() => {
  if (assets.value.length > 0) {
    buildGraph();
  }
});

function resetGraph() {
    unrealService.setGraphRootPath(null);
}
</script>

<template>
  <div class="w-full h-full bg-ue-dark relative">
    <div class="absolute top-4 left-4 z-10 flex gap-2">
        <div class="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700 text-xs">
            Graph Mode: {{ graphRoot ? graphRoot : 'Full Project' }}
        </div>
        <button v-if="graphRoot" @click="resetGraph" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
            Reset View
        </button>
    </div>
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-zoom="0.5"
      :min-zoom="0.1"
      :max-zoom="4"
      fit-view-on-init
    >
      <Background pattern-color="#333" :gap="20" />
      <Controls />
    </VueFlow>

    <!-- Metadata Panel -->
    <div v-if="selectedNodeData" class="absolute top-4 right-4 w-80 bg-gray-900 border border-gray-700 rounded p-4 text-white shadow-xl overflow-auto max-h-[90vh]">
        <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold text-lg truncate">{{ selectedNodeData.name }}</h3>
            <button @click="selectedNodeData = null" class="text-gray-400 hover:text-white">×</button>
        </div>
        <div class="text-xs text-gray-400 mb-4">{{ selectedNodeData.path }}</div>

        <div v-if="selectedNodeData.loading" class="text-center py-4 text-blue-400">
            Analyzing Asset...
        </div>
        <div v-else-if="selectedNodeData.metadata">
            <div class="mb-2">
                <span class="text-xs uppercase text-gray-500 font-bold">Engine Version</span>
                <div class="text-sm">{{ selectedNodeData.metadata.engine || 'Unknown' }}</div>
            </div>
            <div class="mb-2">
                <span class="text-xs uppercase text-gray-500 font-bold">Type</span>
                <div class="text-sm break-all">{{ selectedNodeData.metadata.type || selectedNodeData.asset_type }}</div>
            </div>

            <div v-if="selectedNodeData.metadata.dependencies && selectedNodeData.metadata.dependencies.length">
                <span class="text-xs uppercase text-gray-500 font-bold">Dependencies ({{ selectedNodeData.metadata.dependencies.length }})</span>
                <ul class="mt-1 space-y-1 max-h-40 overflow-auto custom-scrollbar">
                    <li v-for="dep in selectedNodeData.metadata.dependencies" :key="dep" class="text-xs text-gray-300 truncate" :title="dep">
                        {{ dep }}
                    </li>
                </ul>
            </div>
        </div>
        <div v-else class="text-center py-4 text-gray-500">
            No detailed metadata available.
        </div>
    </div>
  </div>
</template>
