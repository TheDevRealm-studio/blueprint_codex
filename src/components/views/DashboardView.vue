<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import { unrealService } from '../../services/unreal';
import { aiService } from '../../services/ai';
import * as d3 from 'd3';
import { BarChart2, FileText, Wrench, Sparkles } from 'lucide-vue-next';

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

type DocsCoverageKey = 'overview' | 'diagrams' | 'failureModes' | 'replication' | 'performance';

type PageCoverage = {
  pageId: string;
  title: string;
  category: string;
  tags: string[];
  score: number;
  percent: number;
  flags: Record<DocsCoverageKey, boolean>;
  missing: DocsCoverageKey[];
};

function hasAnyHeading(md: string, headings: string[]): boolean {
  for (const h of headings) {
    const re = new RegExp(`^#{1,6}\\s*${h}\\b`, 'im');
    if (re.test(md)) return true;
  }
  return false;
}

function analyzeDocsCoverageForMarkdown(mdRaw: string): Record<DocsCoverageKey, boolean> {
  const md = String(mdRaw || '');

  const overview = hasAnyHeading(md, ['Overview', 'Summary', 'Purpose']);

  const diagrams =
    /```\s*blueprint\b/i.test(md) ||
    /!\[[^\]]*\]\([^\)]+\)/.test(md) ||
    /<video\b[^>]*>/i.test(md);

  const failureModes = hasAnyHeading(md, ['Failure Modes', 'Failure', 'Edge Cases', 'Troubleshooting', 'Common Issues', 'Bugs']);

  const replication = hasAnyHeading(md, ['Replication', 'Networking', 'Network', 'Multiplayer', 'Authority', 'Server/Client', 'Client/Server']);

  const performance = hasAnyHeading(md, ['Performance', 'Optimization', 'Perf', 'Tick', 'Profiling']);

  return { overview, diagrams, failureModes, replication, performance };
}

const docsCoverage = computed<PageCoverage[]>(() => {
  if (!store.project) return [];
  const pages = Object.values(store.project.pages);
  return pages.map(p => {
    const flags = analyzeDocsCoverageForMarkdown(p.markdownBody || '');
    const missing = (Object.keys(flags) as DocsCoverageKey[]).filter(k => !flags[k]);
    const score = 5 - missing.length;
    const percent = Math.round((score / 5) * 100);
    return {
      pageId: p.id,
      title: p.title,
      category: p.category,
      tags: p.tags || [],
      flags,
      missing,
      score,
      percent
    };
  }).sort((a, b) => a.percent - b.percent || a.title.localeCompare(b.title));
});

const docsCoverageSummary = computed(() => {
  const pages = docsCoverage.value;
  const total = pages.length;
  const avg = total ? Math.round(pages.reduce((acc, p) => acc + p.percent, 0) / total) : 0;

  const missingCounts: Record<DocsCoverageKey, number> = {
    overview: 0,
    diagrams: 0,
    failureModes: 0,
    replication: 0,
    performance: 0
  };

  for (const p of pages) {
    for (const k of p.missing) missingCounts[k] += 1;
  }

  const worst = pages.slice(0, 10);
  return { total, avg, missingCounts, worst };
});

function openPage(pageId: string) {
  store.setActivePage(pageId);
}

async function aiFillMissingSections(pageId: string) {
  if (!store.project) return;
  const page = store.project.pages[pageId];
  if (!page) return;
  if (!aiService.isEnabled()) {
    alert('AI is not configured. Open Settings and add your API key/model.');
    return;
  }

  const coverage = docsCoverage.value.find(p => p.pageId === pageId);
  if (!coverage || coverage.missing.length === 0) {
    alert('This page already meets the coverage checklist.');
    return;
  }

  const ok = confirm(
    `AI will append the following missing sections to "${page.title}":\n\n- ${coverage.missing.join('\n- ')}\n\nContinue?`
  );
  if (!ok) return;

  const missingList = coverage.missing
    .map(k => {
      if (k === 'overview') return 'Overview';
      if (k === 'diagrams') return 'Diagrams';
      if (k === 'failureModes') return 'Failure Modes';
      if (k === 'replication') return 'Replication';
      return 'Performance';
    })
    .join(', ');

  const promptText = `You are improving an Unreal Engine project documentation page.
Task: Append ONLY the missing sections to the end of the page.

Rules:
- Do not rewrite or remove any existing text.
- Add only new sections at the end using Markdown headings.
- Keep ALL wiki-links exactly as-is if you mention them (like [[Blueprint'/Game/...']]).
- No emojis.
- If you do not know something, add a short TODO bullet instead of guessing.

Missing sections to add: ${missingList}

Existing Markdown:
${page.markdownBody}
`;

  try {
    const res = await aiService.customRequest(promptText, 900);
    const appended = res.text.trim();
    if (!appended) return;

    // If the model echoed the whole page, keep only the tail by best-effort heuristic.
    // Prefer safe behavior: append whatever it returned.
    const next = `${page.markdownBody.trim()}\n\n${appended}\n`;
    store.updatePage(page.id, { markdownBody: next });
    alert('Appended missing sections.');
  } catch (e) {
    console.error('AI fill missing sections failed', e);
    alert('AI request failed.');
  }
}

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

        <!-- Docs Coverage -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)] md:col-span-2">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Docs Coverage</h3>

          <div v-if="docsCoverageSummary.total === 0" class="text-cyber-text/50 italic">
            No pages yet.
          </div>

          <div v-else>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3 md:col-span-2">
                <div class="text-[10px] text-cyber-text/60 uppercase">Average Coverage</div>
                <div class="text-cyber-green font-bold text-xl">{{ docsCoverageSummary.avg }}%</div>
                <div class="text-[10px] text-cyber-text/50">{{ docsCoverageSummary.total }} pages</div>
              </div>
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
                <div class="text-[10px] text-cyber-text/60 uppercase">Missing Overview</div>
                <div class="text-cyber-orange font-bold text-xl">{{ docsCoverageSummary.missingCounts.overview }}</div>
              </div>
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
                <div class="text-[10px] text-cyber-text/60 uppercase">Missing Diagrams</div>
                <div class="text-cyber-orange font-bold text-xl">{{ docsCoverageSummary.missingCounts.diagrams }}</div>
              </div>
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
                <div class="text-[10px] text-cyber-text/60 uppercase">Missing Failure</div>
                <div class="text-cyber-orange font-bold text-xl">{{ docsCoverageSummary.missingCounts.failureModes }}</div>
              </div>
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
                <div class="text-[10px] text-cyber-text/60 uppercase">Missing Replication</div>
                <div class="text-cyber-orange font-bold text-xl">{{ docsCoverageSummary.missingCounts.replication }}</div>
              </div>
              <div class="bg-cyber-dark/40 border border-cyber-green/10 rounded p-3">
                <div class="text-[10px] text-cyber-text/60 uppercase">Missing Performance</div>
                <div class="text-cyber-orange font-bold text-xl">{{ docsCoverageSummary.missingCounts.performance }}</div>
              </div>
            </div>

            <div class="mt-4">
              <div class="text-[11px] text-cyber-text/60 uppercase mb-2">Lowest Coverage Pages</div>
              <div class="space-y-2">
                <div
                  v-for="p in docsCoverageSummary.worst"
                  :key="p.pageId"
                  class="flex items-center justify-between bg-cyber-dark/30 border border-cyber-green/10 rounded px-3 py-2"
                >
                  <div class="min-w-0">
                    <button
                      class="text-cyber-green hover:underline font-mono text-sm truncate"
                      @click="openPage(p.pageId)"
                      :title="p.title"
                    >
                      {{ p.title }}
                    </button>
                    <div class="text-[10px] text-cyber-text/50 truncate">
                      Missing: {{ p.missing.join(', ') }}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 flex-shrink-0">
                    <div class="text-cyber-orange font-bold text-xs w-10 text-right">{{ p.percent }}%</div>
                    <button
                      v-if="aiService.isEnabled() && p.missing.length > 0"
                      @click="aiFillMissingSections(p.pageId)"
                      class="px-2 py-1 rounded border border-cyber-purple/30 text-cyber-purple hover:bg-cyber-purple/10 transition-all flex items-center gap-1 text-[10px] font-bold"
                      title="AI append missing sections"
                    >
                      <Sparkles class="w-3 h-3" />
                      AI FIX
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
