<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '../../stores/project';
import { unrealService } from '../../services/unreal';

const store = useProjectStore();
const { project } = storeToRefs(store);

const svgRef = ref<SVGSVGElement | null>(null);

type NodeType = 'page' | 'asset' | 'group';
type LinkType = 'doc' | 'asset' | 'blueprint';

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  title: string;
  type: NodeType;
  tags: string[];
  group?: string;

  assetType?: string;
  assetPath?: string;
  assetName?: string;
  assetRef?: string;
  docStatus?: 'documented' | 'missing' | 'broken';
  docPageId?: string;

  groupKey?: string;
  memberCount?: number;
};

type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
  type: LinkType;
  weight?: number;
};

const selectedTag = ref<string | null>(null);
const searchQuery = ref('');
const focusMode = ref(true);
const focusHops = ref(1);
const groupMode = ref<'none' | 'category' | 'ue-folder' | 'tag'>('none');
const coverageMode = ref(true);
const collapsedGroups = ref<Record<string, boolean>>({});

const selectedNodeId = ref<string | null>(null);
const detailsNode = ref<GraphNode | null>(null);
const detailsPos = ref({ x: 16, y: 120 });

const zoomK = ref(1);
const LABEL_ZOOM_THRESHOLD = 0.75;

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let gZoom: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let zoomBehavior: any = null;

const unrealRootPath = computed(() => unrealService.getGraphRootPath().value);

function matchesUnrealRoot(assetPath: string) {
  const root = unrealRootPath.value;
  if (!root) return true;
  return assetPath === root || assetPath.startsWith(root + '/') || assetPath.startsWith(root);
}

const allTags = computed(() => {
  if (!project.value) return [];
  const tags = new Set<string>();
  Object.values(project.value.pages).forEach(p => (p.tags || []).forEach(t => tags.add(t)));
  return Array.from(tags);
});

const tagColors: Record<string, string> = {
  Bug: '#ff4444',
  Feature: '#44ff44',
  Blueprint: '#4444ff',
  UI: '#ffaa00',
  Logic: '#00aaff',
  Asset: '#F08D49'
};

function getColorFromTags(tags: string[]) {
  if (!tags || tags.length === 0) return '#F08D49';
  const tag = tags[0];
  if (!tag) return '#F08D49';
  return tagColors[tag] || '#F08D49';
}

function getGroupKeyForNode(n: GraphNode): string {
  if (groupMode.value === 'category') {
    if (n.type === 'page') return n.group || 'General';
    return n.assetType || 'Asset';
  }
  if (groupMode.value === 'tag') {
    if (n.type === 'page') return n.tags?.[0] || 'Untagged';
    return n.assetType || 'Asset';
  }
  if (groupMode.value === 'ue-folder') {
    if (n.type !== 'asset') return n.group || 'General';
    const p = (n.assetPath || '').replace(/^\/Game\/?/, '');
    const first = p.split('/').filter(Boolean)[0];
    return first || 'Game';
  }
  return 'all';
}

const baseNodes = computed<GraphNode[]>(() => {
  if (!project.value) return [];

  const pageNodes: GraphNode[] = Object.values(project.value.pages).map(page => ({
    id: page.id,
    title: page.title,
    type: 'page',
    tags: page.tags || [],
    group: page.category || 'General'
  }));

  const docByUnrealRef = new Map<string, string>();
  for (const p of Object.values(project.value.pages)) {
    const ref = (p as any)?.metadata?.unrealAssetRef;
    if (ref && typeof ref === 'string') docByUnrealRef.set(ref, p.id);
  }

  const brokenSet = new Set<string>();
  try {
    const scan = store.scanBrokenUnrealReferences?.();
    for (const b of (scan?.broken || [])) brokenSet.add(String(b.ref));
  } catch {
    // ignore
  }

  const assetNodes = new Map<string, GraphNode>();
  const pagesWithMatchingAssets = new Set<string>();

  for (const page of Object.values(project.value.pages) as any[]) {
    // Unreal asset links in markdown
    const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = assetRegex.exec(page.markdownBody || '')) !== null) {
      const ref = match[1];
      if (!ref) continue;
      const parts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!parts) continue;
      const type = parts[1];
      const path = parts[2] || '';
      const name = parts[3] || 'Unknown';
      if (!matchesUnrealRoot(path)) continue;

      const id = `asset:${path}.${name}`;
      const assetRef = `${type}'${path}.${name}'`;
      if (!assetNodes.has(id)) {
        const docPageId = docByUnrealRef.get(assetRef);
        const docStatus: GraphNode['docStatus'] = brokenSet.has(assetRef)
          ? 'broken'
          : (docPageId ? 'documented' : 'missing');
        assetNodes.set(id, {
          id,
          title: name,
          type: 'asset',
          tags: ['Asset'],
          assetType: type,
          assetPath: path,
          assetName: name,
          assetRef,
          docStatus,
          docPageId
        });
      }
      pagesWithMatchingAssets.add(page.id);
    }

    // Unreal asset links in canvas blocks
    for (const block of page.blocks || []) {
      if (block.type !== 'asset' || !block.content?.reference) continue;
      const ref = String(block.content.reference);
      const parts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!parts) continue;
      const type = parts[1];
      const path = parts[2] || '';
      const name = parts[3] || 'Unknown';
      if (!matchesUnrealRoot(path)) continue;

      const id = `asset:${path}.${name}`;
      const assetRef = `${type}'${path}.${name}'`;
      if (!assetNodes.has(id)) {
        const docPageId = docByUnrealRef.get(assetRef);
        const docStatus: GraphNode['docStatus'] = brokenSet.has(assetRef)
          ? 'broken'
          : (docPageId ? 'documented' : 'missing');
        assetNodes.set(id, {
          id,
          title: name,
          type: 'asset',
          tags: ['Asset'],
          assetType: type,
          assetPath: path,
          assetName: name,
          assetRef,
          docStatus,
          docPageId
        });
      }
      pagesWithMatchingAssets.add(page.id);
    }
  }

  const filteredPageNodes = unrealRootPath.value
    ? pageNodes.filter(p => pagesWithMatchingAssets.has(p.id))
    : pageNodes;

  return [...filteredPageNodes, ...Array.from(assetNodes.values())];
});

const baseLinks = computed<GraphLink[]>(() => {
  if (!project.value) return [];
  const pageMap = project.value.pages;
  const links: GraphLink[] = [];

  for (const page of Object.values(pageMap) as any[]) {
    // Canvas Links
    for (const block of page.blocks || []) {
      if (block.type === 'link' && block.content?.pageId && pageMap[block.content.pageId]) {
        links.push({ source: page.id, target: block.content.pageId, type: 'doc' });
      }
    }

    // Markdown page links
    if (page.markdownBody) {
      const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(page.markdownBody)) !== null) {
        const raw = match[1];
        if (!raw) continue;
        const targetTitle = raw.trim();
        if (targetTitle.match(/^\w+'[^']+\.[^']+'$/)) continue;
        const targetPage = (Object.values(pageMap) as any[]).find(p => p.title.toLowerCase() === targetTitle.toLowerCase());
        if (targetPage && targetPage.id !== page.id) {
          links.push({ source: page.id, target: targetPage.id, type: 'doc' });
        }
      }

      // Unreal asset links from Markdown
      const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
      while ((match = assetRegex.exec(page.markdownBody)) !== null) {
        const ref = match[1];
        if (!ref) continue;
        const parts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
        if (!parts) continue;
        const type = parts[1];
        const path = parts[2] || '';
        const name = parts[3] || 'Unknown';
        if (!matchesUnrealRoot(path)) continue;
        const targetId = `asset:${path}.${name}`;
        const linkType: LinkType = String(type).toLowerCase() === 'blueprint' ? 'blueprint' : 'asset';
        links.push({ source: page.id, target: targetId, type: linkType });
      }
    }

    // Unreal asset links from Canvas blocks
    for (const block of page.blocks || []) {
      if (block.type !== 'asset' || !block.content?.reference) continue;
      const ref = String(block.content.reference);
      const parts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!parts) continue;
      const type = parts[1];
      const path = parts[2] || '';
      const name = parts[3] || 'Unknown';
      if (!matchesUnrealRoot(path)) continue;
      const targetId = `asset:${path}.${name}`;
      const linkType: LinkType = String(type).toLowerCase() === 'blueprint' ? 'blueprint' : 'asset';
      links.push({ source: page.id, target: targetId, type: linkType });
    }
  }

  return links;
});

const rendered = computed(() => {
  const nodes = baseNodes.value.map(n => ({ ...n })) as GraphNode[];
  const links = baseLinks.value.map(l => ({ ...l })) as GraphLink[];

  if (groupMode.value !== 'none') {
    for (const n of nodes) n.groupKey = getGroupKeyForNode(n);
  }

  if (groupMode.value !== 'none') {
    const grouped = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      const k = n.groupKey || 'all';
      const arr = grouped.get(k) || [];
      arr.push(n);
      grouped.set(k, arr);
    }

    const hidden = new Set<string>();
    const groupNodes: GraphNode[] = [];
    const groupId = (k: string) => `group:${groupMode.value}:${k}`;

    for (const [k, members] of grouped.entries()) {
      if (!collapsedGroups.value[k]) continue;
      for (const m of members) hidden.add(m.id);
      groupNodes.push({
        id: groupId(k),
        title: k,
        type: 'group',
        tags: [],
        groupKey: k,
        memberCount: members.length
      });
    }

    const visibleNodes = nodes.filter(n => !hidden.has(n.id));
    const keyByNodeId = new Map(nodes.map(n => [n.id, n.groupKey || 'all']));

    const edgeKey = (a: string, b: string, t: LinkType) => `${a}::${b}::${t}`;
    const aggregated = new Map<string, GraphLink>();
    for (const l of links) {
      const s = String(l.source);
      const t = String(l.target);
      const sKey = keyByNodeId.get(s);
      const tKey = keyByNodeId.get(t);
      const sId = (hidden.has(s) && sKey) ? groupId(sKey) : s;
      const tId = (hidden.has(t) && tKey) ? groupId(tKey) : t;
      if (sId === tId) continue;
      const k = edgeKey(sId, tId, l.type);
      const existing = aggregated.get(k);
      if (existing) existing.weight = (existing.weight || 1) + 1;
      else aggregated.set(k, { source: sId, target: tId, type: l.type, weight: 1 });
    }

    return { nodes: [...visibleNodes, ...groupNodes], links: Array.from(aggregated.values()) };
  }

  return { nodes, links };
});

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [] as GraphNode[];
  return baseNodes.value
    .filter(n => (`${n.title} ${n.id} ${n.assetPath || ''} ${n.assetType || ''}`.toLowerCase().includes(q)))
    .slice(0, 8);
});

function selectFirstSearchResult() {
  const first = searchResults.value[0];
  if (first) selectNodeById(first.id, true);
}

function collapseAllGroups() {
  if (groupMode.value === 'none') return;
  const keys = new Set<string>();
  for (const n of baseNodes.value) keys.add(getGroupKeyForNode(n));
  const next: Record<string, boolean> = {};
  for (const k of keys) next[k] = true;
  collapsedGroups.value = next;
}

function expandAllGroups() {
  collapsedGroups.value = {};
}

function expandGroup(key: string | undefined) {
  if (!key) return;
  collapsedGroups.value = { ...collapsedGroups.value, [key]: false };
}

function layoutStorageKey() {
  const projectId = project.value?.id || 'none';
  const root = unrealRootPath.value || 'all';
  return `codex-graphview-layout:${projectId}:${root}:${groupMode.value}`;
}

function loadLayoutPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(layoutStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLayoutPositions(nodes: GraphNode[]) {
  try {
    const out: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      if (typeof n.x === 'number' && typeof n.y === 'number') out[n.id] = { x: n.x, y: n.y };
    }
    localStorage.setItem(layoutStorageKey(), JSON.stringify(out));
  } catch {
    // ignore
  }
}

function buildAdjacency(links: GraphLink[]) {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const s = adj.get(a) || new Set<string>();
    s.add(b);
    adj.set(a, s);
  };
  const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id);
  for (const l of links) {
    const a = endpointId(l.source);
    const b = endpointId(l.target);
    if (!a || !b) continue;
    add(a, b);
    add(b, a);
  }
  return adj;
}

function getNeighborhood(nodeId: string, links: GraphLink[], hops: number) {
  const adj = buildAdjacency(links);
  const seen = new Set<string>();
  const frontier: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
  while (frontier.length) {
    const item = frontier.shift()!;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.depth >= hops) continue;
    const next = adj.get(item.id);
    if (!next) continue;
    for (const n of next) frontier.push({ id: n, depth: item.depth + 1 });
  }
  return seen;
}

function applyZoomLabelRule() {
  if (!gZoom) return;
  const show = zoomK.value >= LABEL_ZOOM_THRESHOLD;
  gZoom.selectAll<SVGTextElement, any>('text').style('display', (d: any) => {
    if (show) return 'block';
    return selectedNodeId.value && d?.id === selectedNodeId.value ? 'block' : 'none';
  });
}

function applyStyling(links: GraphLink[]) {
  if (!gZoom) return;
  const focusId = selectedNodeId.value;
  const focusKeep = (focusMode.value && focusId) ? getNeighborhood(focusId, links, focusHops.value) : null;
  const tag = selectedTag.value;
  const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id);

  gZoom.selectAll<SVGGElement, any>('.node').attr('opacity', (d: any) => {
    const id = d?.id;
    if (!id) return 0.1;
    let o = 1;
    if (focusKeep && !focusKeep.has(id)) o = Math.min(o, 0.12);
    if (tag) {
      if (d?.type === 'group') o = Math.min(o, 0.25);
      else o = Math.min(o, (d?.tags || []).includes(tag) ? 1 : 0.2);
    }
    return o;
  });

  gZoom.selectAll<SVGLineElement, any>('.link').attr('opacity', (d: any) => {
    const s = endpointId(d.source);
    const t = endpointId(d.target);
    if (!s || !t) return 0.05;
    let o = 0.65;
    if (focusKeep && !(focusKeep.has(s) && focusKeep.has(t))) o = 0.05;
    if (tag) {
      // if either endpoint is a node with the tag, keep; otherwise dim
      const nodeById = new Map((rendered.value.nodes as GraphNode[]).map(n => [n.id, n]));
      const sn = nodeById.get(s);
      const tn = nodeById.get(t);
      const match = (sn && (sn.tags || []).includes(tag)) || (tn && (tn.tags || []).includes(tag));
      if (!match) o = Math.min(o, 0.15);
    }
    return o;
  });
}

function resetZoom() {
  if (!svgSel || !zoomBehavior) return;
  svgSel.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity);
}

function handleResize() {
  if (!svgRef.value || !simulation) return;
  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;
  simulation.force('center', d3.forceCenter(width / 2, height / 2));
  simulation.alpha(0.25).restart();
}

async function selectNodeById(id: string, center: boolean, retry = false) {
  selectedNodeId.value = id;
  const base = baseNodes.value.find(n => n.id === id);
  if (!retry && center && base && groupMode.value !== 'none') {
    const k = getGroupKeyForNode(base);
    if (collapsedGroups.value[k]) {
      expandGroup(k);
      await nextTick();
      updateGraph();
      await nextTick();
      return selectNodeById(id, center, true);
    }
  }

  const node = (rendered.value.nodes as GraphNode[]).find(n => n.id === id) || base;
  if (node) detailsNode.value = node;
  if (!center || !svgSel || !zoomBehavior || !svgRef.value) return;
  const target = (rendered.value.nodes as GraphNode[]).find(n => n.id === id);
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return;
  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;
  const k = Math.max(0.5, Math.min(1.4, zoomK.value));
  const transform = d3.zoomIdentity.translate(width / 2 - target.x * k, height / 2 - target.y * k).scale(k);
  svgSel.transition().duration(250).call(zoomBehavior.transform, transform);
}

function openPage(pageId: string) {
  store.setActivePage(pageId);
}

async function openOrCreateAssetDoc(n: GraphNode) {
  if (n.docPageId) {
    openPage(n.docPageId);
    return;
  }
  const assetLike: any = {
    name: n.assetName || n.title,
    path: n.assetPath || '',
    asset_type: n.assetType || 'Asset'
  };
  try {
    await store.createOrUpdateDocPageForUnrealAsset(assetLike, { useAI: false, openPage: true });
  } catch (e) {
    console.error('Failed to create asset doc', e);
  }
}

function setGraphRoot(path: string | undefined) {
  if (!path) return;
  unrealService.setGraphRootPath(path);
}

function initGraph() {
  if (!svgRef.value || !project.value) return;

  svgSel = d3.select(svgRef.value);
  svgSel.selectAll('*').remove();
  gZoom = svgSel.append('g');

  zoomBehavior = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event) => {
    zoomK.value = event.transform.k;
    gZoom?.attr('transform', event.transform);
    applyZoomLabelRule();
  });
  svgSel.call(zoomBehavior as any);

  updateGraph();
}

function updateGraph() {
  if (!svgRef.value || !project.value || !svgSel || !gZoom) return;

  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;

  const graphNodes = rendered.value.nodes.map(n => ({ ...n })) as GraphNode[];
  const graphLinks = rendered.value.links.map(l => ({ ...l })) as GraphLink[];

  const cached = loadLayoutPositions();
  for (const n of graphNodes) {
    const pos = cached[n.id];
    if (pos) {
      n.x = pos.x;
      n.y = pos.y;
    }
  }

  if (simulation) simulation.stop();
  simulation = d3.forceSimulation<GraphNode>(graphNodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id((d: any) => d.id).distance((l: any) => (l.type === 'doc' ? 120 : 90)))
    .force('charge', d3.forceManyBody().strength(-340))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius((d: any) => (d.type === 'group' ? 34 : (d.type === 'page' ? 24 : 18))));

  const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id);
  const linkKey = (d: any) => `${endpointId(d.source)}->${endpointId(d.target)}:${d.type}`;

  const link = gZoom.selectAll<SVGLineElement, GraphLink>('.link')
    .data(graphLinks, (d: any) => linkKey(d))
    .join('line')
    .attr('class', 'link')
    .attr('stroke', (d: any) => {
      if (d.type === 'doc') return '#6b7280';
      if (d.type === 'blueprint') return '#3b82f6';
      return '#F08D49';
    })
    .attr('stroke-opacity', 0.65)
    .attr('stroke-width', (d: any) => Math.min(5, 1.2 + Math.log2((d.weight || 1) + 1)))
    .attr('stroke-dasharray', (d: any) => (d.type === 'doc' ? '0' : (d.type === 'blueprint' ? '6 4' : '2 6')));

  const node = gZoom.selectAll<SVGGElement, GraphNode>('.node')
    .data(graphNodes, (d: any) => d.id)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag<SVGGElement, GraphNode>()
      .on('start', (event: any) => {
        if (!event.active) simulation?.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', (event: any) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on('end', (event: any) => {
        if (!event.active) simulation?.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }) as any);

  node.selectAll('circle').remove();
  node.selectAll('text').remove();

  node.append('circle')
    .attr('r', (d: any) => {
      if (d.type === 'group') return 14 + Math.sqrt(d.memberCount || 1);
      if (d.type === 'asset') return 5;
      return 8;
    })
    .attr('fill', (d: any) => {
      if (d.type === 'group') return '#374151';
      if (d.type === 'asset') {
        if (coverageMode.value) {
          if (d.docStatus === 'documented') return '#16a34a';
          if (d.docStatus === 'broken') return '#f59e0b';
          return '#ef4444';
        }
        return '#F08D49';
      }
      return getColorFromTags(d.tags);
    })
    .attr('stroke', (d: any) => (d.id === selectedNodeId.value ? '#ffffff' : '#111827'))
    .attr('stroke-width', 1.5)
    .on('click', (event: any, d: any) => {
      event.stopPropagation?.();
      selectedNodeId.value = d.id;
      detailsNode.value = d;
      detailsPos.value = { x: Math.min(window.innerWidth - 380, event.pageX + 12), y: Math.min(window.innerHeight - 240, event.pageY + 12) };
      if (d.type === 'group' && d.groupKey) expandGroup(d.groupKey);
      applyStyling(graphLinks);
      applyZoomLabelRule();
    })
    .on('dblclick', (_event: any, d: any) => {
      if (d.type === 'page') openPage(d.id);
      if (d.type === 'asset') openOrCreateAssetDoc(d);
    });

  node.append('text')
    .text((d: any) => d.type === 'group' ? `${d.title} (${d.memberCount})` : d.title)
    .attr('x', 12)
    .attr('y', 4)
    .attr('font-size', '10px')
    .attr('fill', '#d1d5db')
    .style('pointer-events', 'none');

  let saved = false;
  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => (d.source as any).x)
      .attr('y1', (d: any) => (d.source as any).y)
      .attr('x2', (d: any) => (d.target as any).x)
      .attr('y2', (d: any) => (d.target as any).y);

    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    if (!saved && simulation && simulation.alpha() < 0.05) {
      saved = true;
      saveLayoutPositions(graphNodes);
      simulation.stop();
    }
  });

  applyStyling(graphLinks);
  applyZoomLabelRule();
}

watch([project, selectedTag, baseNodes, baseLinks, groupMode, collapsedGroups, coverageMode], () => {
  updateGraph();
}, { deep: true });

watch([selectedNodeId, focusMode, focusHops], () => {
  const links = (rendered.value.links as GraphLink[]);
  applyStyling(links);
  applyZoomLabelRule();
});

onMounted(() => {
  initGraph();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (simulation) simulation.stop();
});
</script>

<template>
  <div class="w-full h-full bg-ue-dark overflow-hidden relative" @click="detailsNode = null">
    <div class="absolute top-4 left-4 right-4 z-20 flex gap-3 items-start">
      <div class="bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl p-3 w-[520px]">
        <div class="flex items-center gap-2">
          <input
            v-model="searchQuery"
            @keydown.enter.prevent="selectFirstSearchResult"
            class="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-[#3b82f6]"
            placeholder="Search pages/assets…"
          />
          <button @click="resetZoom" class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200" title="Reset view">
            Reset
          </button>
        </div>

        <div v-if="searchResults.length" class="mt-2 max-h-44 overflow-auto custom-scrollbar border border-white/10 rounded">
          <button
            v-for="n in searchResults"
            :key="n.id"
            @click.stop="selectNodeById(n.id, true)"
            class="w-full text-left px-2 py-1 text-xs hover:bg-white/5 flex items-center justify-between"
          >
            <span class="text-gray-200 truncate">{{ n.title }}</span>
            <span class="text-[10px] text-gray-400 ml-2 shrink-0">{{ n.type === 'asset' ? (n.assetType || 'Asset') : (n.type === 'group' ? 'Group' : 'Page') }}</span>
          </button>
        </div>

        <div class="mt-3 flex flex-wrap gap-2 items-center">
          <label class="flex items-center gap-2 text-[11px] text-gray-200">
            <input type="checkbox" v-model="focusMode" />
            Focus
          </label>

          <label class="flex items-center gap-2 text-[11px] text-gray-200">
            Hops
            <select v-model.number="focusHops" class="bg-black/20 border border-white/10 rounded px-1 py-0.5 text-[11px] text-gray-200">
              <option :value="1">1</option>
              <option :value="2">2</option>
            </select>
          </label>

          <label class="flex items-center gap-2 text-[11px] text-gray-200">
            Group
            <select v-model="groupMode" class="bg-black/20 border border-white/10 rounded px-1 py-0.5 text-[11px] text-gray-200">
              <option value="none">None</option>
              <option value="category">Category</option>
              <option value="ue-folder">UE Folder</option>
              <option value="tag">Tag</option>
            </select>
          </label>

          <button
            v-if="groupMode !== 'none'"
            @click.stop="collapseAllGroups"
            class="px-2 py-1 text-[11px] bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
          >
            Collapse All
          </button>
          <button
            v-if="groupMode !== 'none'"
            @click.stop="expandAllGroups"
            class="px-2 py-1 text-[11px] bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
          >
            Expand All
          </button>

          <label class="flex items-center gap-2 text-[11px] text-gray-200">
            <input type="checkbox" v-model="coverageMode" />
            Coverage
          </label>
        </div>
      </div>
    </div>

    <svg ref="svgRef" class="w-full h-full cursor-grab active:cursor-grabbing"></svg>

    <div
      v-if="detailsNode"
      class="absolute z-30 bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl p-3 w-[360px]"
      :style="{ left: detailsPos.x + 'px', top: detailsPos.y + 'px' }"
      @click.stop
    >
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-sm text-gray-100 font-bold leading-tight">{{ detailsNode.title }}</div>
          <div class="text-xs text-gray-300">
            <template v-if="detailsNode.type === 'asset'">
              {{ detailsNode.assetType }} • {{ detailsNode.assetPath }}
            </template>
            <template v-else-if="detailsNode.type === 'group'">
              Group • {{ detailsNode.memberCount }} nodes
            </template>
            <template v-else>
              Page • {{ detailsNode.group || 'General' }}
            </template>
          </div>
        </div>
        <button @click.stop="detailsNode = null" class="text-gray-300 hover:text-white">×</button>
      </div>

      <div v-if="detailsNode.type === 'asset'" class="mt-2 text-xs">
        <div class="text-gray-200">
          Doc status:
          <span :class="detailsNode.docStatus === 'missing' ? 'text-red-300' : (detailsNode.docStatus === 'broken' ? 'text-orange-300' : 'text-green-300')">
            {{ detailsNode.docStatus }}
          </span>
        </div>
        <div class="text-gray-400 break-all mt-1">{{ detailsNode.assetRef }}</div>
      </div>

      <div class="mt-3 flex gap-2 flex-wrap">
        <button
          v-if="detailsNode.type === 'page'"
          @click.stop="openPage(detailsNode.id)"
          class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
        >
          Open
        </button>

        <button
          v-if="detailsNode.type === 'asset'"
          @click.stop="openOrCreateAssetDoc(detailsNode)"
          class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
        >
          {{ detailsNode.docPageId ? 'Open Doc' : 'Create Doc' }}
        </button>

        <button
          v-if="detailsNode.type === 'asset'"
          @click.stop="setGraphRoot(detailsNode.assetPath)"
          class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
        >
          Set Root
        </button>
      </div>
    </div>

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
        :style="{ backgroundColor: getColorFromTags([tag]) }"
        :class="{ 'ring-2 ring-white': selectedTag === tag }"
      >
        #{{ tag }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.15);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.10);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.18);
}
</style>
