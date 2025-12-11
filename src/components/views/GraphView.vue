<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted, computed } from 'vue';
import * as d3 from 'd3';
import { useProjectStore } from '../../stores/project';
import { storeToRefs } from 'pinia';

const store = useProjectStore();
const { project } = storeToRefs(store);
const container = ref<HTMLElement | null>(null);
const selectedTag = ref<string | null>(null);

let simulation: d3.Simulation<any, any> | null = null;

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  tags: string[];
  group: number;
}

const allTags = computed(() => {
  if (!project.value) return [];
  const tags = new Set<string>();
  Object.values(project.value.pages).forEach(p => p.tags.forEach(t => tags.add(t)));
  return Array.from(tags);
});

const tagColors: Record<string, string> = {
  'Bug': '#ff4444',
  'Feature': '#44ff44',
  'Blueprint': '#4444ff',
  'UI': '#ffaa00',
  'Logic': '#00aaff',
  'Asset': '#F08D49'
};

function getColor(tags: string[]) {
  if (!tags || tags.length === 0) return '#F08D49'; // Default UE Accent
  const tag = tags[0]; // Use first tag for color
  if (!tag) return '#F08D49';
  return tagColors[tag] || '#F08D49';
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

function initGraph() {
  if (!container.value || !project.value) return;

  // Clear previous
  d3.select(container.value).selectAll('*').remove();

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;

  // Prepare Data
  const pageNodes: GraphNode[] = (Object.values(project.value.pages) as any[]).map(page => ({
    id: page.id,
    title: page.title,
    tags: (page.tags as string[]) || [],
    group: 1,
    type: 'page'
  }));

  const links: GraphLink[] = [];
  const assetNodes = new Map<string, GraphNode>();

  (Object.values(project.value.pages) as any[]).forEach(page => {
    // 1. Canvas Links
    page.blocks.forEach((block: any) => {
      if (block.type === 'link') {
        // Check if target exists
        if (project.value?.pages[block.content.pageId]) {
          links.push({
            source: page.id,
            target: block.content.pageId
          });
        }
      }
    });

    // 2. Markdown Links
    if (page.markdownBody && project.value) {
      const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      let match;
      while ((match = regex.exec(page.markdownBody)) !== null) {
        if (match[1]) {
            const targetTitle = match[1].trim();
            
            // Skip if it looks like an asset link
            if (targetTitle.match(/^\w+'[^']+\.[^']+'$/)) continue;

            const targetPage = (Object.values(project.value.pages) as any[]).find(p => p.title.toLowerCase() === targetTitle.toLowerCase());

            if (targetPage) {
            links.push({
                source: page.id,
                target: targetPage.id
            });
            }
        }
      }

      // 3. Unreal Asset Links from Markdown
      const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
      while ((match = assetRegex.exec(page.markdownBody)) !== null) {
          const ref = match[1];
          if (!ref) continue;
          const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
          if (matchParts) {
              const type = matchParts[1];
              const path = matchParts[2];
              const name = matchParts[3];
              const id = `asset:${path}.${name}`;

              if (!assetNodes.has(id)) {
                  assetNodes.set(id, {
                      id,
                      title: name,
                      tags: ['Asset'],
                      group: 2,
                      type: 'asset',
                      assetType: type
                  } as any);
              }
              
              links.push({
                  source: page.id,
                  target: id
              });
          }
      }

      // 4. Unreal Asset Links from Canvas Blocks
      if (page.blocks) {
        page.blocks.forEach((block: any) => {
            if (block.type === 'asset' && block.content?.reference) {
                const ref = block.content.reference;
                const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
                if (matchParts) {
                    const type = matchParts[1];
                    const path = matchParts[2];
                    const name = matchParts[3];
                    const id = `asset:${path}.${name}`;

                    if (!assetNodes.has(id)) {
                        assetNodes.set(id, {
                            id,
                            title: name,
                            tags: ['Asset'],
                            group: 2,
                            type: 'asset',
                            assetType: type
                        } as any);
                    }
                    
                    links.push({
                        source: page.id,
                        target: id
                    });
                }
            }
        });
      }
    }
  });

  const nodes = [...pageNodes, ...assetNodes.values()];

  // SVG
  const svg = d3.select(container.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto;');

  // Simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius(30));

  // Elements
  const link = svg.append('g')
    .attr('stroke', '#555')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke-width', 2);

  const node = svg.append('g')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .selectAll('g')
    .data(nodes)
    .join('g')
    .call(drag(simulation) as any);

  node.append('circle')
    .attr('r', (d: any) => d.type === 'asset' ? 5 : 8)
    .attr('fill', d => getColor(d.tags))
    .attr('opacity', d => {
      if (!selectedTag.value) return 1;
      return d.tags.includes(selectedTag.value) ? 1 : 0.2;
    });

  node.append('text')
    .text(d => d.title)
    .attr('x', 12)
    .attr('y', 4)
    .attr('fill', '#ccc')
    .attr('font-size', '10px')
    .attr('stroke', 'none')
    .style('pointer-events', 'none');

  node.on('click', (_event, d: any) => {
    if (d.type === 'page') {
        store.setActivePage(d.id);
    }
  });

  // Tick
  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    node
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
  });

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      svg.selectAll('g').attr('transform', event.transform);
    });

  // @ts-ignore
  svg.call(zoom);
}

function drag(simulation: any) {
  function dragstarted(event: any) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event: any) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event: any) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

watch([project, selectedTag], () => {
  initGraph();
}, { deep: true });

onMounted(() => {
  initGraph();
  window.addEventListener('resize', initGraph);
});

onUnmounted(() => {
  window.removeEventListener('resize', initGraph);
  if (simulation) simulation.stop();
});
</script>

<template>
  <div ref="container" class="w-full h-full bg-ue-dark overflow-hidden relative">
    <div class="absolute top-4 left-4 bg-black/50 p-2 rounded text-xs text-gray-400 pointer-events-none">
      Graph View
    </div>

    <!-- Tag Filter -->
    <div class="absolute bottom-4 left-4 flex gap-2 flex-wrap max-w-[50%]">
      <button
        v-if="selectedTag"
        @click="selectedTag = null"
        class="px-2 py-1 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
      >
        Clear Filter
      </button>
      <button
        v-for="tag in allTags"
        :key="tag"
        @click="selectedTag = tag"
        class="px-2 py-1 rounded text-xs font-bold text-black hover:opacity-80 transition-opacity"
        :style="{ backgroundColor: getColor([tag]) }"
        :class="{ 'ring-2 ring-white': selectedTag === tag }"
      >
        #{{ tag }}
      </button>
    </div>
  </div>
</template>
