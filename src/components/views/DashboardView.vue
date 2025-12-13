<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import { unrealService } from '../../services/unreal';
import * as d3 from 'd3';
import { BarChart2, FileText, Wrench } from 'lucide-vue-next';

const store = useProjectStore();
const chartRef = ref<HTMLElement | null>(null);
const unrealAssetsRef = unrealService.getAssets();

const topPages = computed(() => {
  if (!store.project) return [];
  return Object.values(store.project.pages)
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, 10); // Top 10
});

onMounted(() => {
  renderChart();
});

function extractUnrealRefsFromProject() {
  const refs = new Set<string>();
  if (!store.project) return refs;

  const mdRegex = /\[\[([A-Za-z0-9_]+)'([^']+)'\]\]/g;

  for (const page of Object.values(store.project.pages)) {
    const md = page.markdownBody || '';
    let match: RegExpExecArray | null;
    while ((match = mdRegex.exec(md)) !== null) {
      const assetType = match[1];
      const inner = match[2];
      if (assetType && inner) refs.add(`${assetType}'${inner}'`);
    }

    for (const block of page.blocks || []) {
      if (block.type === 'asset' && block.content?.reference) {
        refs.add(String(block.content.reference));
      }
    }
  }

  return refs;
}

const unrealCoverage = computed(() => {
  const totalUnrealAssets = unrealAssetsRef.value?.length || 0;
  const referencedRefs = extractUnrealRefsFromProject();

  const documentedRefs = new Set<string>();
  if (store.project) {
    for (const page of Object.values(store.project.pages)) {
      const ref = page.metadata?.unrealAssetRef;
      if (ref) documentedRefs.add(ref);
    }
  }

  let referencedUndocumented = 0;
  for (const ref of referencedRefs) {
    if (!documentedRefs.has(ref)) referencedUndocumented++;
  }

  return {
    totalUnrealAssets,
    referencedCount: referencedRefs.size,
    documentedCount: documentedRefs.size,
    referencedUndocumented,
    hasUnreal: totalUnrealAssets > 0
  };
});

async function generateMissingDocsForReferencedAssets() {
  if (!store.project) return;

  const refs = extractUnrealRefsFromProject();
  const documentedRefs = new Set<string>();
  for (const page of Object.values(store.project.pages)) {
    const ref = page.metadata?.unrealAssetRef;
    if (ref) documentedRefs.add(ref);
  }

  const missingRefs = Array.from(refs).filter(r => !documentedRefs.has(r));
  if (missingRefs.length === 0) {
    alert('No missing docs for referenced assets.');
    return;
  }

  // Default bulk generation to non-AI to avoid high cost / latency.
  const useAI = confirm(
    `Generate ${missingRefs.length} missing asset doc page(s).\n\nUse AI generation for the content?` +
    `\n(Choosing Cancel will still create pages using the template.)`
  );

  const assets = unrealAssetsRef.value || [];
  const byRef = new Map<string, any>();
  for (const asset of assets) {
    const ref = `${asset.asset_type || 'Asset'}'${asset.path}.${asset.name}'`;
    byRef.set(ref, asset);
  }

  let created = 0;
  for (const ref of missingRefs) {
    const asset = byRef.get(ref);
    if (!asset) continue;
    await store.createOrUpdateDocPageForUnrealAsset(asset, { useAI, openPage: false });
    created++;
  }

  alert(`Created/updated ${created} asset doc page(s).`);
}

function runReferenceHygiene() {
  store.runReferenceHygieneAutoFix();
}

function renderChart() {
  if (!chartRef.value || topPages.value.length === 0) return;

  const data = topPages.value.map(p => ({
    title: p.title,
    count: p.viewCount || 0
  }));

  const margin = { top: 20, right: 20, bottom: 40, left: 150 };
  const width = chartRef.value.clientWidth - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  // Clear previous
  d3.select(chartRef.value).selectAll('*').remove();

  const svg = d3.select(chartRef.value)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // X Axis
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count) || 10])
    .range([0, width]);

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text')
    .attr('transform', 'translate(-10,0)rotate(-45)')
    .style('text-anchor', 'end')
    .style('fill', '#94A3B8'); // Text color

  // Y Axis
  const y = d3.scaleBand()
    .range([0, height])
    .domain(data.map(d => d.title))
    .padding(0.2);

  svg.append('g')
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'monospace');

  // Bars
  svg.selectAll('myRect')
    .data(data)
    .join('rect')
    .attr('x', x(0))
    .attr('y', d => y(d.title)!)
    .attr('width', d => x(d.count))
    .attr('height', y.bandwidth())
    .attr('fill', '#00FF9D') // Cyber Green
    .attr('opacity', 0.7)
    .on('mouseover', function() {
        d3.select(this).attr('opacity', 1);
    })
    .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7);
    });
    
  // Add values at end of bars
  svg.selectAll('myLabels')
    .data(data)
    .join('text')
    .attr('x', d => x(d.count) + 5)
    .attr('y', d => y(d.title)! + y.bandwidth() / 2 + 4)
    .text(d => d.count)
    .style('fill', '#00FF9D')
    .style('font-size', '10px')
    .style('font-family', 'monospace');
}
</script>

<template>
  <div class="p-8 h-full overflow-y-auto custom-scrollbar">
    <div class="max-w-4xl mx-auto">
      <h2 class="text-2xl font-bold text-cyber-green mb-6 flex items-center gap-2">
        <BarChart2 class="w-6 h-6" /> PROJECT_DASHBOARD
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Stats Card -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)]">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Most Viewed Pages</h3>
          <div v-if="topPages.length > 0" ref="chartRef" class="w-full h-[300px]"></div>
          <div v-else class="text-cyber-text/50 italic text-center py-10">
            No data available yet. Start browsing pages!
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)]">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Quick Stats</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Total Pages</span>
              <span class="text-cyber-green font-bold text-xl">{{ Object.keys(store.project?.pages || {}).length }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Total Assets</span>
              <span class="text-cyber-green font-bold text-xl">{{ store.project?.media?.length || 0 }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Last Updated</span>
              <span class="text-cyber-text font-mono text-xs">Just now</span>
            </div>
          </div>
        </div>

        <!-- Unreal Documentation Coverage -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)] md:col-span-2">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Unreal Doc Coverage</h3>

          <div v-if="!unrealCoverage.hasUnreal" class="text-cyber-text/50 italic">
            Link and scan an Unreal project to see coverage.
          </div>

          <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase">Unreal Assets</div>
              <div class="text-cyber-green font-bold text-xl">{{ unrealCoverage.totalUnrealAssets }}</div>
            </div>
            <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase">Referenced</div>
              <div class="text-cyber-green font-bold text-xl">{{ unrealCoverage.referencedCount }}</div>
            </div>
            <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase">Doc Pages</div>
              <div class="text-cyber-green font-bold text-xl">{{ unrealCoverage.documentedCount }}</div>
            </div>
            <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase">Missing Docs</div>
              <div class="text-cyber-orange font-bold text-xl">{{ unrealCoverage.referencedUndocumented }}</div>
            </div>
          </div>

          <div v-if="unrealCoverage.hasUnreal" class="mt-4 flex flex-wrap gap-2">
            <button
              @click="generateMissingDocsForReferencedAssets"
              class="px-3 py-2 rounded border border-cyber-green/30 text-cyber-green hover:bg-cyber-green/10 transition-all flex items-center gap-2 text-xs font-bold"
            >
              <FileText class="w-4 h-4" />
              GENERATE_MISSING_ASSET_DOCS
            </button>
            <button
              @click="runReferenceHygiene"
              class="px-3 py-2 rounded border border-cyber-blue/30 text-cyber-blue hover:bg-cyber-blue/10 transition-all flex items-center gap-2 text-xs font-bold"
            >
              <Wrench class="w-4 h-4" />
              REFERENCE_HYGIENE
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
