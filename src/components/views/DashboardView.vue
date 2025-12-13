<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useProjectStore } from '../../stores/project';
import { unrealService } from '../../services/unreal';
import { aiService } from '../../services/ai';
import * as d3 from 'd3';
import { BarChart2, FileText, Wrench, Sparkles, Loader2 } from 'lucide-vue-next';

const store = useProjectStore();
const chartRef = ref<HTMLElement | null>(null);
const auditChartRef = ref<HTMLElement | null>(null);
const dependencyGraphRef = ref<HTMLElement | null>(null);
const unrealAssetsRef = unrealService.getAssets();

type AuditItem = {
  id: string;
  kind: 'asset' | 'page';
  title: string;
  detail: string;
  pageId?: string;
  assetRef?: string;
};

type DependencyNode = {
  id: string;
  label: string;
  type: 'root' | 'dependency' | 'dependent';
};

type DependencyLink = {
  source: string;
  target: string;
};

const isBuildingDepIndex = ref(false);
const depIndexProgress = ref({ done: 0, total: 0, stage: '' });
const depAnalysisByFile = ref(new Map<string, any>());

const isAnalyzingSelectedAsset = ref(false);
const impactError = ref<string | null>(null);

const selectedAssetQuery = ref('');
const selectedAsset = ref<any | null>(null);
const selectedAssetAnalysis = ref<any | null>(null);

const assetSearchResults = computed(() => {
  const q = selectedAssetQuery.value.trim();
  if (!q) return [] as any[];
  return unrealService.search(q);
});

function buildUnrealRefFromAsset(asset: any): string {
  return `${asset.asset_type || 'Asset'}'${asset.path}.${asset.name}'`;
}

function selectAssetForImpact(asset: any) {
  selectedAsset.value = asset;
  selectedAssetQuery.value = asset ? `${asset.name}  (${asset.path})` : '';
  selectedAssetAnalysis.value = null;
  // dependencyGraphRef is inside a v-if; wait for DOM to update.
  nextTick(() => renderDependencyGraph());
}

function buildMentionsIndex() {
  const mentions = new Map<string, Set<string>>();
  if (!store.project) return mentions;

  const add = (ref: string, pageId: string) => {
    if (!ref) return;
    const key = String(ref);
    const set = mentions.get(key) || new Set<string>();
    set.add(pageId);
    mentions.set(key, set);
  };

  const assetRegex = /\[\[(\w+'[^']+')\]\]/g;

  for (const page of Object.values(store.project.pages)) {
    const md = page.markdownBody || '';
    let match: RegExpExecArray | null;
    while ((match = assetRegex.exec(md)) !== null) {
      const ref = match[1];
      if (ref) add(ref, page.id);
    }

    for (const block of page.blocks || []) {
      if (block.type === 'asset' && (block as any).content?.reference) {
        add(String((block as any).content.reference), page.id);
      }
    }
  }

  return mentions;
}

function classifyExpectedPrefix(assetType: string): string[] {
  const t = String(assetType || '').toLowerCase();
  if (t === 'blueprint') return ['BP_', 'BPI_', 'ABP_', 'WBP_', 'AnimBP_'];
  if (t === 'material') return ['M_'];
  if (t === 'staticmesh') return ['SM_'];
  if (t === 'texture') return ['T_'];
  if (t === 'level') return ['L_', 'LVL_'];
  return [];
}

function isTitleLikelyBad(title: string): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  if (t.includes('_')) return true;
  if (/\.(md|txt|docx?)$/i.test(t)) return true;
  return false;
}

const consistencyAudit = computed(() => {
  const items: AuditItem[] = [];
  const counts: Record<'assetPrefix' | 'assetRootFolder' | 'pageTitle' | 'pageTags', number> = {
    assetPrefix: 0,
    assetRootFolder: 0,
    pageTitle: 0,
    pageTags: 0
  };

  const assets = unrealAssetsRef.value || [];
  for (const a of assets) {
    const name = String(a.name || '');
    const path = String(a.path || '');
    const ref = buildUnrealRefFromAsset(a);

    // Rule: assets should not live directly under /Game (folder convention)
    const relative = path.replace(/^\/Game\/?/, '');
    const hasFolder = relative.includes('/');
    if (!hasFolder) {
      counts.assetRootFolder += 1;
      items.push({
        id: `assetRoot:${ref}`,
        kind: 'asset',
        title: `Move asset out of /Game root`,
        detail: `${name} is in ${path}. Consider putting it in a folder.`,
        assetRef: ref
      });
    }

    // Rule: naming prefix consistency (BP_ vs BPI_, etc.)
    const expectedPrefixes = classifyExpectedPrefix(a.asset_type);
    if (expectedPrefixes.length) {
      const ok = expectedPrefixes.some(p => name.startsWith(p));
      if (!ok) {
        counts.assetPrefix += 1;
        items.push({
          id: `assetPrefix:${ref}`,
          kind: 'asset',
          title: `Check naming prefix`,
          detail: `${name} is type ${a.asset_type}. Expected prefix like: ${expectedPrefixes.join(' / ')}`,
          assetRef: ref
        });
      }
    }
  }

  if (store.project) {
    for (const p of Object.values(store.project.pages)) {
      if (isTitleLikelyBad(p.title)) {
        counts.pageTitle += 1;
        items.push({
          id: `pageTitle:${p.id}`,
          kind: 'page',
          title: `Fix page title convention`,
          detail: `Title "${p.title}" looks inconsistent (avoid underscores / extensions).`,
          pageId: p.id
        });
      }

      const badTags = (p.tags || []).filter(t => !t || /\s/.test(t) || t !== t.trim());
      if (badTags.length) {
        counts.pageTags += 1;
        items.push({
          id: `pageTags:${p.id}`,
          kind: 'page',
          title: `Clean up tags`,
          detail: `Tags contain whitespace/empty values: ${badTags.join(', ')}`,
          pageId: p.id
        });
      }
    }
  }

  const ordered = items.sort((a, b) => a.title.localeCompare(b.title));
  return { counts, items: ordered };
});

function renderAuditChart() {
  if (!auditChartRef.value) return;
  const data: Array<{ label: string; value: number }> = [
    { label: 'Asset Prefix', value: Number(consistencyAudit.value.counts.assetPrefix) },
    { label: 'Asset Folder', value: Number(consistencyAudit.value.counts.assetRootFolder) },
    { label: 'Page Titles', value: Number(consistencyAudit.value.counts.pageTitle) },
    { label: 'Tags', value: Number(consistencyAudit.value.counts.pageTags) }
  ];

  d3.select(auditChartRef.value).selectAll('*').remove();

  const margin = { top: 10, right: 10, bottom: 30, left: 110 };
  const width = auditChartRef.value.clientWidth - margin.left - margin.right;
  const height = 220 - margin.top - margin.bottom;

  const svg = d3.select(auditChartRef.value)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value) || 1])
    .range([0, width]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.label))
    .range([0, height])
    .padding(0.25);

  svg.append('g')
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'monospace');

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'monospace');

  svg.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', 0)
    .attr('y', d => y(d.label)!)
    .attr('width', d => x(d.value))
    .attr('height', y.bandwidth())
    .attr('fill', '#00FF9D')
    .attr('opacity', 0.75);

  svg.selectAll('labels')
    .data(data)
    .join('text')
    .attr('x', d => x(d.value) + 6)
    .attr('y', d => (y(d.label)! + y.bandwidth() / 2 + 4))
    .text(d => String(d.value))
    .style('fill', '#00FF9D')
    .style('font-size', '10px')
    .style('font-family', 'monospace');
}

async function analyzeSelectedAsset() {
  if (!selectedAsset.value) return;
  const fp = String(selectedAsset.value.file_path || '');
  if (!fp) return;

  impactError.value = null;
  isAnalyzingSelectedAsset.value = true;
  depIndexProgress.value = { done: 0, total: 0, stage: 'Analyzing selected asset…' };
  try {
    const analysis = await unrealService.analyzeAsset(fp);
    selectedAssetAnalysis.value = analysis;
    depAnalysisByFile.value.set(fp, analysis);
  } catch (e: any) {
    const msg = String(e?.message || e || 'Failed to analyze asset');
    impactError.value = msg;
  } finally {
    isAnalyzingSelectedAsset.value = false;
    await nextTick();
    renderDependencyGraph();
  }
}

function normalizeDepPath(dep: any): string {
  const raw = String(dep || '').trim();
  if (!raw) return '';

  // Try to extract a /Game/... token from common dependency strings.
  const m = raw.match(/(\/Game\/[A-Za-z0-9_\/]+(?:\.[A-Za-z0-9_]+)?)/);
  let s = (m && m[1]) ? m[1] : raw;

  // Remove wrapping quotes.
  s = s.replace(/^['"]|['"]$/g, '');

  // Drop suffix after ':' (sometimes appears in script/object strings).
  if (s.includes(':')) s = s.split(':')[0] ?? s;

  // Convert object path "/Game/Foo/Bar.Bar" => "/Game/Foo/Bar".
  const lastSlash = s.lastIndexOf('/');
  const dot = s.indexOf('.', lastSlash);
  if (dot !== -1) s = s.slice(0, dot);

  return s;
}

function resolveAssetByUePath(uePath: string) {
  const pathOnly = String(uePath || '').trim();
  if (!pathOnly) return null;
  const assets = unrealAssetsRef.value || [];
  return assets.find(a => a.path === pathOnly) || null;
}

function getDependenciesForAsset(_asset: any, analysis: any | null) {
  // Server guarantees `dependencies` when possible, but older cached analyses may not.
  const depsRaw: any[] = Array.isArray(analysis?.dependencies)
    ? analysis.dependencies
    : (Array.isArray((analysis as any)?.dependencyRefs) ? (analysis as any).dependencyRefs : []);
  const deps: any[] = [];
  for (const d of depsRaw) {
    const p = normalizeDepPath(d);
    if (!p) continue;
    const depAsset = resolveAssetByUePath(p);
    deps.push({ uePath: p, asset: depAsset });
  }
  // Dedup by path
  const seen = new Set<string>();
  return deps.filter(x => {
    if (seen.has(x.uePath)) return false;
    seen.add(x.uePath);
    return true;
  });
}

async function buildDependencyIndex() {
  const assets = unrealAssetsRef.value || [];
  if (!assets.length) return;

  // Keep it bounded to avoid freezing large projects.
  const MAX = 120;
  const list = assets.slice(0, MAX);

  isBuildingDepIndex.value = true;
  depIndexProgress.value = { done: 0, total: list.length, stage: 'Building dependency index…' };
  try {
    // Limited concurrency to speed up without overwhelming disk.
    const concurrency = 4;
    let cursor = 0;

    const worker = async () => {
      while (cursor < list.length) {
        const i = cursor++;
        const a = list[i];
        if (!a) continue;
        depIndexProgress.value = { done: i, total: list.length, stage: `Analyzing assets (${i + 1}/${list.length})…` };
        const fp = String(a.file_path || '');
        if (!fp) continue;
        if (depAnalysisByFile.value.has(fp)) continue;
        const analysis = await unrealService.analyzeAsset(fp);
        depAnalysisByFile.value.set(fp, analysis);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } catch (e: any) {
    depIndexProgress.value = { done: depIndexProgress.value.done, total: list.length, stage: `Failed: ${String(e?.message || e || 'Error')}` };
  } finally {
    depIndexProgress.value = { done: list.length, total: list.length, stage: 'Done' };
    isBuildingDepIndex.value = false;
    renderDependencyGraph();
  }
}

const selectedAssetRef = computed(() => {
  if (!selectedAsset.value) return '';
  return buildUnrealRefFromAsset(selectedAsset.value);
});

const impactReport = computed(() => {
  const mentions = buildMentionsIndex();
  const ref = selectedAssetRef.value;
  const mentionPages = ref ? Array.from(mentions.get(ref) || []) : [];

  const analysis = selectedAssetAnalysis.value;
  const deps = selectedAsset.value ? getDependenciesForAsset(selectedAsset.value, analysis) : [];
  const depRefs = deps
    .map(d => (d.asset ? buildUnrealRefFromAsset(d.asset) : ''))
    .filter(Boolean);

  // Reverse deps (dependents) only from built index.
  const dependents: string[] = [];

  const selectedPath = selectedAsset.value ? String(selectedAsset.value.path || '') : '';
  if (selectedPath) {
    for (const a of (unrealAssetsRef.value || [])) {
      const fp = String(a.file_path || '');
      if (!fp) continue;
      const analyzed = depAnalysisByFile.value.get(fp);
      const depsRaw: any[] = Array.isArray(analyzed?.dependencies) ? analyzed.dependencies : [];
      const hasSelected = depsRaw.some((d: any) => normalizeDepPath(d) === selectedPath);
      if (hasSelected) dependents.push(buildUnrealRefFromAsset(a));
    }
  }

  const dependencyCount = depRefs.length;
  const dependentCount = dependents.length;
  const mentionCount = mentionPages.length;

  const impactScore = mentionCount * 3 + dependentCount * 2 + dependencyCount;

  return {
    mentionPages,
    dependencyRefs: depRefs,
    dependentRefs: dependents,
    impactScore
  };
});

function renderDependencyGraph() {
  if (!dependencyGraphRef.value) return;
  d3.select(dependencyGraphRef.value).selectAll('*').remove();
  if (!selectedAsset.value) return;

  const analysis = selectedAssetAnalysis.value;
  const deps = getDependenciesForAsset(selectedAsset.value, analysis);
  const depsRefs = deps.map(d => (d.asset ? buildUnrealRefFromAsset(d.asset) : `Asset'${d.uePath}.${d.uePath.split('/').pop() || 'Asset'}'`));

  const dependents = impactReport.value.dependentRefs;
  const rootRef = selectedAssetRef.value;

  const nodes: DependencyNode[] = [
    { id: rootRef, label: selectedAsset.value.name, type: 'root' },
    ...depsRefs.map(r => ({ id: r, label: r.split('.').pop()?.replace("'", '') || r, type: 'dependency' as const })),
    ...dependents.map(r => ({ id: r, label: r.split('.').pop()?.replace("'", '') || r, type: 'dependent' as const }))
  ];

  const seen = new Set<string>();
  const uniqNodes = nodes.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  const links: DependencyLink[] = [];
  for (const r of depsRefs) links.push({ source: rootRef, target: r });
  for (const r of dependents) links.push({ source: r, target: rootRef });

  const width = Math.max(320, dependencyGraphRef.value.clientWidth || 0);
  const height = 260;

  const svg = d3.select(dependencyGraphRef.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const color = (t: DependencyNode['type']) => {
    if (t === 'root') return '#00FF9D';
    if (t === 'dependency') return '#3b82f6';
    return '#f97316';
  };

  const sim = d3.forceSimulation<any>(uniqNodes as any)
    .force('link', d3.forceLink<any, any>(links as any).id((d: any) => d.id).distance(80).strength(0.8))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .stop();

  // Run a few ticks synchronously for stable initial layout.
  for (let i = 0; i < 120; i++) sim.tick();

  svg.append('g')
    .attr('stroke', '#94A3B8')
    .attr('stroke-opacity', 0.35)
    .selectAll('line')
    .data(links as any)
    .join('line')
    .attr('x1', (d: any) => (d.source as any).x)
    .attr('y1', (d: any) => (d.source as any).y)
    .attr('x2', (d: any) => (d.target as any).x)
    .attr('y2', (d: any) => (d.target as any).y);

  const gNodes = svg.append('g')
    .selectAll('g')
    .data(uniqNodes as any)
    .join('g');

  gNodes.append('circle')
    .attr('r', (d: any) => d.type === 'root' ? 10 : 7)
    .attr('fill', (d: any) => color(d.type))
    .attr('opacity', 0.85)
    .attr('cx', (d: any) => d.x)
    .attr('cy', (d: any) => d.y);

  gNodes.append('text')
    .text((d: any) => d.label)
    .attr('x', (d: any) => d.x + 10)
    .attr('y', (d: any) => d.y + 3)
    .style('fill', '#e5e7eb')
    .style('font-size', '10px')
    .style('font-family', 'monospace');
}

const topPages = computed(() => {
  if (!store.project) return [];
  return Object.values(store.project.pages)
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, 10); // Top 10
});

onMounted(() => {
  renderChart();
  renderAuditChart();
});

watch([() => store.project, unrealAssetsRef], () => {
  // Re-render charts when project/assets change.
  renderChart();
  renderAuditChart();
  renderDependencyGraph();
});

const depIndexSize = computed(() => depAnalysisByFile.value.size);

watch([selectedAsset, selectedAssetAnalysis, depIndexSize], async () => {
  await nextTick();
  renderDependencyGraph();
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

        <!-- Consistency Audits -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)] md:col-span-2">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Consistency Audits</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-cyber-dark/30 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase mb-2">Issues Summary</div>
              <div ref="auditChartRef" class="w-full h-[220px]"></div>
              <div class="text-[10px] text-cyber-text/50 mt-2">Outputs a TODO list only (no auto-fix).</div>
            </div>

            <div class="bg-cyber-dark/30 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase mb-2">TODO List</div>
              <div v-if="consistencyAudit.items.length === 0" class="text-cyber-text/50 italic text-xs">No audit issues found.</div>
              <div v-else class="max-h-[240px] overflow-auto custom-scrollbar space-y-2">
                <div
                  v-for="it in consistencyAudit.items.slice(0, 50)"
                  :key="it.id"
                  class="border border-cyber-green/10 rounded px-3 py-2"
                >
                  <div class="text-xs text-cyber-green font-bold">{{ it.title }}</div>
                  <div class="text-[11px] text-cyber-text/60 mt-1">{{ it.detail }}</div>
                  <button
                    v-if="it.pageId"
                    @click="openPage(it.pageId)"
                    class="mt-2 text-[10px] px-2 py-1 rounded border border-cyber-green/20 text-cyber-green hover:bg-cyber-green/10"
                  >
                    OPEN_PAGE
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dependency & Impact View -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)] md:col-span-2 relative">
          <div
            v-if="isBuildingDepIndex"
            class="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex items-center justify-center"
          >
            <div class="bg-cyber-panel border border-cyber-green/30 rounded p-4 w-[420px] max-w-[92%]">
              <div class="flex items-center gap-2 text-cyber-green font-bold text-sm">
                <Loader2 class="w-4 h-4 animate-spin" />
                BUILDING_DEPENDENCY_INDEX
              </div>
              <div class="text-xs text-cyber-text/60 mt-2">{{ depIndexProgress.stage }}</div>
              <div class="text-xs text-cyber-text/60 mt-1">{{ depIndexProgress.done }} / {{ depIndexProgress.total }}</div>
              <div class="mt-3 h-1 w-full bg-black/30 rounded overflow-hidden">
                <div
                  class="h-full bg-cyber-green/60"
                  :style="{ width: depIndexProgress.total ? `${Math.round((depIndexProgress.done / depIndexProgress.total) * 100)}%` : '0%' }"
                ></div>
              </div>
            </div>
          </div>

          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Dependency & Impact View</h3>

          <div class="flex flex-col md:flex-row gap-3 md:items-center">
            <div class="flex-1 relative">
              <input
                v-model="selectedAssetQuery"
                class="w-full bg-black/20 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text focus:outline-none focus:border-cyber-green/60"
                placeholder="Search Unreal asset (name or /Game path)…"
              />
              <div v-if="assetSearchResults.length" class="absolute z-10 mt-1 w-full bg-cyber-panel border border-cyber-green/20 rounded max-h-56 overflow-auto custom-scrollbar">
                <button
                  v-for="a in assetSearchResults"
                  :key="a.file_path"
                  @click="selectAssetForImpact(a)"
                  class="w-full text-left px-3 py-2 text-xs hover:bg-white/5"
                >
                  <div class="text-cyber-green font-bold truncate">{{ a.name }}</div>
                  <div class="text-[10px] text-cyber-text/50 truncate">{{ a.asset_type }} • {{ a.path }}</div>
                </button>
              </div>
            </div>

            <button
              @click="analyzeSelectedAsset"
              :disabled="!selectedAsset || isAnalyzingSelectedAsset"
              class="px-3 py-2 rounded border border-cyber-purple/30 text-cyber-purple hover:bg-cyber-purple/10 transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="inline-flex items-center gap-2">
                <Loader2 v-if="isAnalyzingSelectedAsset" class="w-4 h-4 animate-spin" />
                ANALYZE
              </span>
            </button>

            <button
              @click="buildDependencyIndex"
              :disabled="isBuildingDepIndex"
              class="px-3 py-2 rounded border border-cyber-blue/30 text-cyber-blue hover:bg-cyber-blue/10 transition-all text-xs font-bold"
              title="Analyzes up to 250 assets to build upstream/dependent relationships"
            >
              BUILD_INDEX
            </button>
          </div>

          <div v-if="impactError" class="mt-3 text-xs text-cyber-orange border border-cyber-orange/30 bg-black/20 rounded px-3 py-2">
            {{ impactError }}
          </div>

          <div v-if="selectedAsset" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-cyber-dark/30 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase">Impact</div>
              <div class="mt-2 text-xs text-cyber-text/80 font-mono break-all">{{ selectedAssetRef }}</div>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div class="bg-black/20 border border-cyber-green/10 rounded p-2">
                  <div class="text-[10px] text-cyber-text/60 uppercase">Score</div>
                  <div class="text-cyber-green font-bold text-lg">{{ impactReport.impactScore }}</div>
                </div>
                <div class="bg-black/20 border border-cyber-green/10 rounded p-2">
                  <div class="text-[10px] text-cyber-text/60 uppercase">Mentions</div>
                  <div class="text-cyber-green font-bold text-lg">{{ impactReport.mentionPages.length }}</div>
                </div>
                <div class="bg-black/20 border border-cyber-green/10 rounded p-2">
                  <div class="text-[10px] text-cyber-text/60 uppercase">Dependents</div>
                  <div class="text-cyber-orange font-bold text-lg">{{ impactReport.dependentRefs.length }}</div>
                </div>
              </div>

              <div class="mt-4">
                <div class="text-[10px] text-cyber-text/60 uppercase mb-2">Pages/Canvases Mentioning This</div>
                <div v-if="impactReport.mentionPages.length === 0" class="text-xs text-cyber-text/50 italic">No mentions found.</div>
                <div v-else class="space-y-1 max-h-40 overflow-auto custom-scrollbar">
                  <button
                    v-for="pid in impactReport.mentionPages"
                    :key="pid"
                    @click="openPage(pid)"
                    class="w-full text-left text-xs px-2 py-1 rounded hover:bg-white/5 text-cyber-green font-mono"
                  >
                    {{ store.project?.pages[pid]?.title || pid }}
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-cyber-dark/30 border border-cyber-green/10 rounded p-3">
              <div class="text-[10px] text-cyber-text/60 uppercase mb-2">Dependency Graph</div>
              <div class="relative">
                <div
                  v-if="isAnalyzingSelectedAsset"
                  class="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-10 flex items-center justify-center"
                >
                  <div class="flex items-center gap-2 text-cyber-green text-xs font-bold">
                    <Loader2 class="w-4 h-4 animate-spin" />
                    ANALYZING…
                  </div>
                </div>
                <div ref="dependencyGraphRef" class="w-full h-[260px]"></div>
              </div>
              <div class="text-[10px] text-cyber-text/50 mt-2">Green = selected, Blue = dependencies, Orange = dependents (requires index).</div>
            </div>
          </div>

          <div v-else class="mt-4 text-cyber-text/50 italic text-xs">Select an Unreal asset to see impact.</div>
        </div>
      </div>
    </div>
  </div>
</template>
