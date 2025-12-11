<template>
  <div class="w-full h-full bg-[#1e1e1e] relative overflow-hidden">
    <div class="absolute top-4 right-4 z-10 bg-[#252526] p-2 rounded shadow-lg border border-[#3e3e42]">
      <div class="text-xs text-gray-400 mb-2">Graph Controls</div>
      <div class="flex gap-2">
        <button @click="resetZoom" class="p-1 hover:bg-[#3e3e42] rounded" title="Reset View">
          <Maximize class="w-4 h-4 text-gray-300" />
        </button>
      </div>
    </div>

    <svg ref="svgRef" class="w-full h-full cursor-grab active:cursor-grabbing"></svg>

    <div v-if="hoveredNode" class="absolute pointer-events-none bg-[#252526] border border-[#3e3e42] p-2 rounded shadow-xl z-20" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="font-bold text-gray-200">{{ hoveredNode.title }}</div>
      <div class="text-xs text-gray-400">{{ hoveredNode.connections }} connections</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import * as d3 from 'd3';
import { useProjectStore } from '../../stores/project';
import { Maximize } from 'lucide-vue-next';

const store = useProjectStore();
const svgRef = ref<SVGSVGElement | null>(null);
const hoveredNode = ref<any>(null);
const tooltipPos = ref({ x: 0, y: 0 });

// Graph data
const nodes = computed(() => {
  if (!store.project) return [];
  
  const pageNodes = Object.values(store.project.pages).map(page => ({
    id: page.id,
    title: page.title,
    type: 'page',
    group: page.category || 'General',
    connections: 0 // Will be calculated
  }));

  const assetNodes = new Map<string, any>();
  
  Object.values(store.project.pages).forEach(page => {
    // Scan Markdown
    const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
    let match;
    while ((match = assetRegex.exec(page.markdownBody || '')) !== null) {
        const ref = match[1];
        if (!ref) continue;
        const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
        if (matchParts) {
            const type = matchParts[1];
            const path = matchParts[2];
            const name = matchParts[3];
            const id = `asset:${path}.${name}`; // Unique ID for asset node

            if (!assetNodes.has(id)) {
                assetNodes.set(id, {
                    id,
                    title: name,
                    type: 'asset',
                    assetType: type,
                    group: 'Asset',
                    connections: 0
                });
            }
        }
    }

    // Scan Canvas Blocks
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
                            type: 'asset',
                            assetType: type,
                            group: 'Asset',
                            connections: 0
                        });
                    }
                }
            }
        });
    }
  });

  return [...pageNodes, ...Array.from(assetNodes.values())];
});

const links = computed(() => {
  if (!store.project) return [];
  const result: { source: string; target: string }[] = [];
  const pageMap = store.project.pages;

  Object.values(pageMap).forEach(page => {
    // 1. Explicit edges from VueFlow
    if (page.edges) {
      // page.edges.forEach(edge => {
        // This is tricky because VueFlow edges are internal to the page graph
        // But if we had page-to-page links, we'd add them here.
        // For now, let's look for WikiLinks in markdown
      // });
    }

    // 2. WikiLinks in Markdown [[Page Name]]
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = wikiLinkRegex.exec(page.markdownBody || '')) !== null) {
      const targetTitle = match[1];
      if (!targetTitle) continue;

      // Check if it's an asset link first (skip if so)
      if (targetTitle.match(/^\w+'[^']+\.[^']+'$/)) continue;

      // Find page by title (case insensitive)
      const targetPage = Object.values(pageMap).find(p => p.title.toLowerCase() === targetTitle.toLowerCase());
      if (targetPage && targetPage.id !== page.id) {
        result.push({ source: page.id, target: targetPage.id });
      }
    }

    // 3. Unreal Asset Links from Markdown [[Type'Path.Name']]
    const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
    while ((match = assetRegex.exec(page.markdownBody || '')) !== null) {
        const ref = match[1];
        if (!ref) continue;
        const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
        if (matchParts) {
            const path = matchParts[2];
            const name = matchParts[3];
            const targetId = `asset:${path}.${name}`;
            result.push({ source: page.id, target: targetId });
        }
    }

    // 4. Unreal Asset Links from Canvas Blocks
    if (page.blocks) {
        page.blocks.forEach((block: any) => {
            if (block.type === 'asset' && block.content?.reference) {
                const ref = block.content.reference;
                const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
                if (matchParts) {
                    const path = matchParts[2];
                    const name = matchParts[3];
                    const targetId = `asset:${path}.${name}`;
                    result.push({ source: page.id, target: targetId });
                }
            }
        });
    }
  });

  return result;
});

let simulation: d3.Simulation<any, any> | null = null;

onMounted(() => {
  initGraph();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (simulation) simulation.stop();
  window.removeEventListener('resize', handleResize);
});

watch([nodes, links], () => {
  updateGraph();
});

function handleResize() {
  if (!svgRef.value) return;
  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;
  if (simulation) {
    simulation.force('center', d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.3).restart();
  }
}

function resetZoom() {
    if (!svgRef.value) return;
    // const svg = d3.select(svgRef.value);
    // Reset transform logic would go here if we used d3-zoom
    // For now, just re-center
    handleResize();
}

function initGraph() {
  if (!svgRef.value) return;

  // const width = svgRef.value.clientWidth;
  // const height = svgRef.value.clientHeight;

  const svg = d3.select(svgRef.value);

  // Clear previous
  svg.selectAll('*').remove();

  const g = svg.append('g');

  // Zoom behavior
  const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
          g.attr('transform', event.transform);
      });

  svg.call(zoom as any);

  updateGraph();
}

function updateGraph() {
  if (!svgRef.value || !store.project) return;

  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;

  // Prepare data
  const graphNodes = nodes.value.map(d => ({ ...d })) as d3.SimulationNodeDatum[];
  const graphLinks = links.value.map(d => ({ ...d }));

  // Calculate connection counts
  graphLinks.forEach(link => {
      const source = graphNodes.find((n: any) => n.id === link.source);
      const target = graphNodes.find((n: any) => n.id === link.target);
      if (source) (source as any).connections++;
      if (target) (target as any).connections++;
  });

  const svg = d3.select(svgRef.value);
  const g = svg.select('g');

  // Simulation
  simulation = d3.forceSimulation(graphNodes)
      .force('link', d3.forceLink(graphLinks).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(30));

  // Render Links
  const link = g.selectAll('.link')
      .data(graphLinks)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', '#4b5563')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5);

  // Render Nodes
  const node = g.selectAll('.node')
      .data(graphNodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any);

  // Node Circles
  node.append('circle')
      .attr('r', (d: any) => {
          if (d.type === 'asset') return 4 + Math.sqrt(d.connections);
          return 5 + Math.sqrt(d.connections) * 2;
      })
      .attr('fill', (d: any) => {
          if (d.type === 'asset') return '#F08D49'; // Unreal Orange
          if (d.id === store.activePageId) return '#3b82f6'; // Active blue
          return '#6b7280'; // Gray
      })
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1.5)
      .on('mouseover', (event, d: any) => {
          hoveredNode.value = d;
          tooltipPos.value = { x: event.pageX + 10, y: event.pageY + 10 };
          d3.select(event.currentTarget).attr('stroke', '#fff');
      })
      .on('mouseout', (event) => {
          hoveredNode.value = null;
          d3.select(event.currentTarget).attr('stroke', '#1f2937');
      })
      .on('click', (_event, d: any) => {
          if (d.type === 'page') {
            store.setActivePage(d.id);
            store.showKnowledgeGraph = false;
          } else if (d.type === 'asset') {
             // Maybe show asset details?
             console.log('Clicked asset', d);
          }
      });

  // Node Labels
  node.append('text')
      .text((d: any) => d.title)
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#d1d5db')
      .style('pointer-events', 'none');

  simulation.on('tick', () => {
      link
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

      node
          .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event: any) {
      if (!event.active) simulation?.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
  }

  function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
  }

  function dragended(event: any) {
      if (!event.active) simulation?.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;

      // Check for collision with other nodes to create link
      // Simple distance check
      const droppedNode = event.subject;
      const nodes = graphNodes as any[]; // Cast to any to access custom props

      for (const other of nodes) {
          if (other.id === droppedNode.id) continue;

          const dx = droppedNode.x - other.x;
          const dy = droppedNode.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If dropped very close to another node (overlapping)
          if (distance < 20) {
              if (confirm(`Link "${droppedNode.title}" to "${other.title}"?`)) {
                  store.addLink(droppedNode.id, other.id);
              }
              break;
          }
      }
  }
}
</script>

<style scoped>
/* Add any specific styles if needed */
</style>
