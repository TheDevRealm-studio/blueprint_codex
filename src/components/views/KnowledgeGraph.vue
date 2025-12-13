<template>
  <div class="w-full h-full bg-[#1e1e1e] relative overflow-hidden" @click="detailsNode = null">
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

        <div v-if="searchResults.length" class="mt-2 max-h-44 overflow-auto custom-scrollbar border border-white/5 rounded">
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
          <label class="flex items-center gap-2 text-[11px] text-gray-300">
            <input type="checkbox" v-model="focusMode" />
            Focus
          </label>

          <label class="flex items-center gap-2 text-[11px] text-gray-300">
            Hops
            <select v-model.number="focusHops" class="bg-black/20 border border-white/10 rounded px-1 py-0.5 text-[11px] text-gray-200">
              <option :value="1">1</option>
              <option :value="2">2</option>
            </select>
          </label>

          <label class="flex items-center gap-2 text-[11px] text-gray-300">
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

          <label class="flex items-center gap-2 text-[11px] text-gray-300">
            <input type="checkbox" v-model="coverageMode" />
            Coverage
          </label>
        </div>
      </div>

      <div class="flex-1"></div>

      <div class="bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl p-3 w-[340px]">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs text-gray-300 font-bold">Pinned</div>
          <button @click.stop="clearPins" class="text-[11px] text-gray-400 hover:text-gray-200">Clear</button>
        </div>
        <div v-if="pinnedNodes.length" class="flex flex-col gap-1 max-h-40 overflow-auto custom-scrollbar">
          <button
            v-for="p in pinnedNodes"
            :key="p.id"
            @click.stop="selectNodeById(p.id, true)"
            class="px-2 py-1 text-xs rounded hover:bg-white/5 flex items-center justify-between"
          >
            <span class="text-gray-200 truncate">{{ p.title }}</span>
            <span class="text-[10px] text-gray-400 ml-2">{{ p.type === 'asset' ? (p.assetType || 'Asset') : 'Page' }}</span>
          </button>
        </div>
        <div v-else class="text-xs text-gray-500">Pin nodes from the details card.</div>
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
          <div class="text-xs text-gray-400">
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
        <button @click.stop="detailsNode = null" class="text-gray-400 hover:text-gray-200">×</button>
      </div>

      <div class="mt-2 text-xs text-gray-400">{{ detailsNode.connections || 0 }} connections</div>

      <div v-if="detailsNode.type === 'asset'" class="mt-2 text-xs">
        <div class="text-gray-300">
          Doc status:
          <span :class="detailsNode.docStatus === 'missing' ? 'text-red-400' : (detailsNode.docStatus === 'broken' ? 'text-orange-400' : 'text-green-400')">
            {{ detailsNode.docStatus }}
          </span>
        </div>
        <div class="text-gray-500 break-all mt-1">{{ detailsNode.assetRef }}</div>
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

        <button
          v-if="detailsNode.type === 'group'"
          @click.stop="expandGroup(detailsNode.groupKey)"
          class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
        >
          Expand
        </button>

        <button
          @click.stop="togglePin(detailsNode.id)"
          class="px-2 py-1 text-xs bg-black/30 border border-white/10 rounded hover:bg-white/5 text-gray-200"
        >
          {{ isPinned(detailsNode.id) ? 'Unpin' : 'Pin' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import { useProjectStore } from '../../stores/project';
import { unrealService } from '../../services/unreal';

const store = useProjectStore();
const svgRef = ref<SVGSVGElement | null>(null);

type NodeType = 'page' | 'asset' | 'group';
type LinkType = 'doc' | 'asset' | 'blueprint';

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  title: string;
  type: NodeType;
  group?: string;
  tags?: string[];
  connections?: number;

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

const unrealRootPath = computed(() => unrealService.getGraphRootPath().value);

function matchesUnrealRoot(assetPath: string) {
  const root = unrealRootPath.value;
  if (!root) return true;
  return assetPath === root || assetPath.startsWith(root + '/') || assetPath.startsWith(root);
}

const searchQuery = ref('');
const focusMode = ref(true);
const focusHops = ref(1);
const groupMode = ref<'none' | 'category' | 'ue-folder' | 'tag'>('none');
const coverageMode = ref(true);

const selectedNodeId = ref<string | null>(null);
const detailsNode = ref<GraphNode | null>(null);
const detailsPos = ref({ x: 16, y: 120 });

const pinnedIds = ref<string[]>([]);
const collapsedGroups = ref<Record<string, boolean>>({});

const zoomK = ref(1);
const LABEL_ZOOM_THRESHOLD = 0.75;

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let gZoom: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let zoomBehavior: any = null;

function pinsStorageKey() {
  return `codex-graph-pins:${store.project?.id || 'none'}`;
}

function loadPins() {
  try {
    const raw = localStorage.getItem(pinsStorageKey());
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) pinnedIds.value = arr.filter(x => typeof x === 'string');
  } catch {
    // ignore
  }
}

function savePins() {
  try {
    localStorage.setItem(pinsStorageKey(), JSON.stringify(pinnedIds.value));
  } catch {
    // ignore
  }
}

function isPinned(id: string) {
  return pinnedIds.value.includes(id);
}

function togglePin(id: string) {
  if (isPinned(id)) pinnedIds.value = pinnedIds.value.filter(x => x !== id);
  else pinnedIds.value = [...pinnedIds.value, id];
  savePins();
}

function clearPins() {
  pinnedIds.value = [];
  savePins();
}

function getGroupKeyForNode(n: GraphNode): string {
  if (groupMode.value === 'category') {
    if (n.type === 'page') return n.group || 'General';
    return n.assetType || 'Asset';
  }
  if (groupMode.value === 'tag') {
    if (n.type === 'page') return (n.tags && n.tags[0]) ? n.tags[0] : 'Untagged';
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
  if (!store.project) return [];

  const pageNodes: GraphNode[] = Object.values(store.project.pages).map(page => ({
    id: page.id,
    title: page.title,
    type: 'page',
    group: page.category || 'General',
    tags: page.tags || [],
    connections: 0
  }));

  const docByUnrealRef = new Map<string, string>();
  for (const p of Object.values(store.project.pages)) {
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

  Object.values(store.project.pages).forEach(page => {
    const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = assetRegex.exec(page.markdownBody || '')) !== null) {
      const ref = match[1];
      if (!ref) continue;
      const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!matchParts) continue;

      const type = matchParts[1];
      const path = matchParts[2] || '';
      const name = matchParts[3] || 'Unknown';
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
          assetType: type,
          assetPath: path,
          assetName: name,
          assetRef,
          connections: 0,
          group: 'Asset',
          docStatus,
          docPageId
        });
      }

      pagesWithMatchingAssets.add(page.id);
    }

    for (const block of page.blocks || []) {
      if (block.type !== 'asset' || !block.content?.reference) continue;
      const ref = String(block.content.reference);
      const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!matchParts) continue;
      const type = matchParts[1];
      const path = matchParts[2] || '';
      const name = matchParts[3] || 'Unknown';
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
          assetType: type,
          assetPath: path,
          assetName: name,
          assetRef,
          connections: 0,
          group: 'Asset',
          docStatus,
          docPageId
        });
      }

      pagesWithMatchingAssets.add(page.id);
    }
  });

  const filteredPageNodes = unrealRootPath.value
    ? pageNodes.filter(p => pagesWithMatchingAssets.has(p.id))
    : pageNodes;

  return [...filteredPageNodes, ...Array.from(assetNodes.values())];
});

const baseLinks = computed<GraphLink[]>(() => {
  if (!store.project) return [];
  const pageMap = store.project.pages;
  const result: GraphLink[] = [];

  for (const page of Object.values(pageMap)) {
    // Canvas link blocks
    for (const block of page.blocks || []) {
      if (block.type === 'link' && block.content?.pageId && pageMap[block.content.pageId]) {
        result.push({ source: page.id, target: block.content.pageId, type: 'doc' });
      }
    }

    // Markdown links
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikiLinkRegex.exec(page.markdownBody || '')) !== null) {
      const targetTitle = match[1];
      if (!targetTitle) continue;

      // Skip asset-like links
      if (targetTitle.match(/^\w+'[^']+\.[^']+'$/)) continue;

      const targetPage = Object.values(pageMap).find(p => p.title.toLowerCase() === targetTitle.toLowerCase());
      if (targetPage && targetPage.id !== page.id) {
        result.push({ source: page.id, target: targetPage.id, type: 'doc' });
      }
    }

    // Unreal asset links from markdown
    const assetRegex = /\[\[(\w+'[^']+')\]\]/g;
    while ((match = assetRegex.exec(page.markdownBody || '')) !== null) {
      const ref = match[1];
      if (!ref) continue;
      const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!matchParts) continue;
      const type = matchParts[1];
      const path = matchParts[2] || '';
      const name = matchParts[3];
      if (!matchesUnrealRoot(path)) continue;
      const targetId = `asset:${path}.${name}`;
      const linkType: LinkType = String(type).toLowerCase() === 'blueprint' ? 'blueprint' : 'asset';
      result.push({ source: page.id, target: targetId, type: linkType });
    }

    // Unreal asset links from canvas
    for (const block of page.blocks || []) {
      if (block.type !== 'asset' || !block.content?.reference) continue;
      const ref = String(block.content.reference);
      const matchParts = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
      if (!matchParts) continue;
      const type = matchParts[1];
      const path = matchParts[2] || '';
      const name = matchParts[3];
      if (!matchesUnrealRoot(path)) continue;
      const targetId = `asset:${path}.${name}`;
      const linkType: LinkType = String(type).toLowerCase() === 'blueprint' ? 'blueprint' : 'asset';
      result.push({ source: page.id, target: targetId, type: linkType });
    }
  }

  return result;
});

const rendered = computed(() => {
  const nodes = baseNodes.value.map(n => ({ ...n })) as GraphNode[];
  const links = baseLinks.value.map(l => ({ ...l })) as GraphLink[];

  // Assign group keys
  if (groupMode.value !== 'none') {
    for (const n of nodes) n.groupKey = getGroupKeyForNode(n);
  }

  // Collapse groups by replacing members with a group node
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
        groupKey: k,
        memberCount: members.length,
        connections: 0
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

const pinnedNodes = computed(() => {
  const map = new Map(baseNodes.value.map(n => [n.id, n]));
  return pinnedIds.value.map(id => map.get(id)).filter((n): n is GraphNode => !!n);
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
  const projectId = store.project?.id || 'none';
  const root = unrealRootPath.value || 'all';
  return `codex-graph-layout:${projectId}:${root}:${groupMode.value}`;
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

function applyFocusStyling(links: GraphLink[]) {
  if (!gZoom) return;
  const focusId = selectedNodeId.value;
  if (!focusMode.value || !focusId) {
    gZoom.selectAll<SVGGElement, any>('.node').attr('opacity', 1);
    gZoom.selectAll<SVGLineElement, any>('.link').attr('opacity', 0.65);
    return;
  }

  const keep = getNeighborhood(focusId, links, focusHops.value);
  gZoom.selectAll<SVGGElement, any>('.node').attr('opacity', (d: any) => (keep.has(d.id) ? 1 : 0.12));
  const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id);
  gZoom.selectAll<SVGLineElement, any>('.link').attr('opacity', (d: any) => {
    const s = endpointId(d.source);
    const t = endpointId(d.target);
    if (!s || !t) return 0.05;
    return (keep.has(s) && keep.has(t)) ? 0.75 : 0.05;
  });
}

function selectNodeById(id: string, center: boolean) {
  selectedNodeId.value = id;
  const node = rendered.value.nodes.find(n => n.id === id) || baseNodes.value.find(n => n.id === id);
  if (node) detailsNode.value = node;
  if (!center || !svgSel || !zoomBehavior) return;
  const target = (rendered.value.nodes as GraphNode[]).find(n => n.id === id);
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number' || !svgRef.value) return;
  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;
  const k = Math.max(0.5, Math.min(1.4, zoomK.value));
  const transform = d3.zoomIdentity.translate(width / 2 - target.x * k, height / 2 - target.y * k).scale(k);
  svgSel.transition().duration(250).call(zoomBehavior.transform, transform);
}

function openPage(pageId: string) {
  store.setActivePage(pageId);
  (store as any).showKnowledgeGraph = false;
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
  if (!svgRef.value) return;

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
  if (!svgRef.value || !store.project || !svgSel || !gZoom) return;

  const width = svgRef.value.clientWidth;
  const height = svgRef.value.clientHeight;

  const graphNodes = rendered.value.nodes.map(n => ({ ...n })) as GraphNode[];
  const graphLinks = rendered.value.links.map(l => ({ ...l })) as GraphLink[];

  // connection counts
  for (const n of graphNodes) n.connections = 0;
  for (const l of graphLinks) {
    const s = graphNodes.find(n => n.id === String(l.source));
    const t = graphNodes.find(n => n.id === String(l.target));
    if (s) s.connections = (s.connections || 0) + 1;
    if (t) t.connections = (t.connections || 0) + 1;
  }

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

        // If dropped near another page node, allow adding a link
        const dropped = event.subject as any;
        if (dropped.type !== 'page') return;
        for (const other of graphNodes) {
          if (other.id === dropped.id) continue;
          if ((other as any).type !== 'page') continue;
          const dx = (dropped.x ?? 0) - ((other as any).x ?? 0);
          const dy = (dropped.y ?? 0) - ((other as any).y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) {
            if (confirm(`Link "${dropped.title}" to "${other.title}"?`)) {
              store.addLink(dropped.id, other.id);
            }
            break;
          }
        }
      }) as any);

  node.selectAll('circle').remove();
  node.selectAll('text').remove();

  node.append('circle')
    .attr('r', (d: any) => {
      if (d.type === 'group') return 14 + Math.sqrt(d.memberCount || 1);
      if (d.type === 'asset') return 4 + Math.sqrt(d.connections || 1);
      return 6 + Math.sqrt(d.connections || 1) * 1.6;
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
      if (d.id === store.activePageId) return '#3b82f6';
      return '#6b7280';
    })
    .attr('stroke', (d: any) => (d.id === selectedNodeId.value ? '#ffffff' : '#111827'))
    .attr('stroke-width', 1.5)
    .on('click', (event: any, d: any) => {
      event.stopPropagation?.();
      selectedNodeId.value = d.id;
      detailsNode.value = d;
      detailsPos.value = { x: Math.min(window.innerWidth - 380, event.pageX + 12), y: Math.min(window.innerHeight - 240, event.pageY + 12) };
      if (d.type === 'group' && d.groupKey) expandGroup(d.groupKey);
      applyFocusStyling(graphLinks);
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

  applyFocusStyling(graphLinks);
  applyZoomLabelRule();
}

watch([baseNodes, baseLinks, groupMode, collapsedGroups, coverageMode], () => {
  updateGraph();
}, { deep: true });

watch([selectedNodeId, focusMode, focusHops], () => {
  // styles applied against latest rendered selections
  const links = (rendered.value.links as GraphLink[]);
  applyFocusStyling(links);
  applyZoomLabelRule();
});

onMounted(() => {
  loadPins();
  initGraph();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (simulation) simulation.stop();
});
</script>

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
