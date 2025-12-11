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
const { fitView } = useVueFlow();

const assets = unrealService.getAssets();

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

  traverse(tree);

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

watch(() => assets.value, () => {
  buildGraph();
}, { deep: true });

onMounted(() => {
  if (assets.value.length > 0) {
    buildGraph();
  }
});
</script>

<template>
  <div class="w-full h-full bg-ue-dark">
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
  </div>
</template>
