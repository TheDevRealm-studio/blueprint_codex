<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProjectStore } from '../../stores/project';
import type { DocPageRevision, DocPageSnapshot, Block, Edge } from '../../types';

const props = defineProps<{ pageId: string }>();

const store = useProjectStore();

const page = computed(() => store.project?.pages?.[props.pageId] || null);
const revisions = computed<DocPageRevision[]>(() => {
  const r = page.value?.metadata?.revisions;
  return Array.isArray(r) ? r : [];
});

const leftId = ref<string>('');
const rightId = ref<string>('');

watch(revisions, (r) => {
  // Default: compare latest vs previous if available.
  if (r.length === 0) {
    leftId.value = '';
    rightId.value = '';
    return;
  }

  const latest = r[r.length - 1];
  const prev = r.length >= 2 ? r[r.length - 2] : undefined;

  if (!rightId.value) rightId.value = latest?.id || '';
  if (!leftId.value) leftId.value = prev?.id || latest?.id || '';

  // Ensure selections still exist
  if (leftId.value && !r.some(x => x.id === leftId.value)) leftId.value = prev?.id || latest?.id || '';
  if (rightId.value && !r.some(x => x.id === rightId.value)) rightId.value = latest?.id || '';
}, { immediate: true });

const left = computed(() => revisions.value.find(r => r.id === leftId.value) || null);
const right = computed(() => revisions.value.find(r => r.id === rightId.value) || null);

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

function blockKey(b: Block) {
  return b.id;
}

function edgeKey(e: Edge) {
  return e.id || `${e.source}:${e.sourceHandle || ''}->${e.target}:${e.targetHandle || ''}`;
}

function diffSnapshots(a: DocPageSnapshot | null, b: DocPageSnapshot | null) {
  if (!a || !b) {
    return {
      titleChanged: false,
      categoryChanged: false,
      tagsChanged: false,
      markdownChanged: false,
      blocks: { added: 0, removed: 0, changed: 0 },
      edges: { added: 0, removed: 0 },
      changedBlockSamples: [] as string[]
    };
  }

  const titleChanged = a.title !== b.title;
  const categoryChanged = a.category !== b.category;

  const aTags = Array.isArray(a.tags) ? a.tags : [];
  const bTags = Array.isArray(b.tags) ? b.tags : [];
  const tagsChanged = aTags.join('|') !== bTags.join('|');

  const markdownChanged = (a.markdownBody || '') !== (b.markdownBody || '');

  const aBlocks = new Map<string, Block>();
  for (const blk of (a.blocks || [])) aBlocks.set(blockKey(blk), blk);
  const bBlocks = new Map<string, Block>();
  for (const blk of (b.blocks || [])) bBlocks.set(blockKey(blk), blk);

  let added = 0;
  let removed = 0;
  let changed = 0;
  const changedSamples: string[] = [];

  for (const [id, blk] of bBlocks.entries()) {
    if (!aBlocks.has(id)) {
      added++;
      continue;
    }
    const prev = aBlocks.get(id)!;
    const prevSig = safeStringify({ type: prev.type, content: prev.content, x: prev.x, y: prev.y, width: prev.width, height: prev.height });
    const nextSig = safeStringify({ type: blk.type, content: blk.content, x: blk.x, y: blk.y, width: blk.width, height: blk.height });
    if (prevSig !== nextSig) {
      changed++;
      if (changedSamples.length < 12) {
        const label = String((blk as any).type || 'block');
        changedSamples.push(`${label} (${id.slice(0, 8)})`);
      }
    }
  }

  for (const [id] of aBlocks.entries()) {
    if (!bBlocks.has(id)) removed++;
  }

  const aEdges = new Set<string>((a.edges || []).map(edgeKey));
  const bEdges = new Set<string>((b.edges || []).map(edgeKey));

  let edgesAdded = 0;
  let edgesRemoved = 0;
  for (const k of bEdges) if (!aEdges.has(k)) edgesAdded++;
  for (const k of aEdges) if (!bEdges.has(k)) edgesRemoved++;

  return {
    titleChanged,
    categoryChanged,
    tagsChanged,
    markdownChanged,
    blocks: { added, removed, changed },
    edges: { added: edgesAdded, removed: edgesRemoved },
    changedBlockSamples: changedSamples
  };
}

const summary = computed(() => diffSnapshots(left.value?.snapshot || null, right.value?.snapshot || null));
</script>

<template>
  <div class="w-full h-full p-6 overflow-auto custom-scrollbar">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="text-cyber-green font-bold text-lg">CHANGE LOG</div>
        <div class="text-cyber-text/60 text-xs">Compare two saved revisions of this page.</div>
      </div>

      <div class="flex gap-3 items-end">
        <div class="flex flex-col gap-1">
          <div class="text-[10px] text-cyber-text/60">FROM</div>
          <select v-model="leftId" class="bg-cyber-dark border border-cyber-green/20 rounded px-2 py-1 text-xs text-cyber-text">
            <option v-for="r in revisions" :key="r.id" :value="r.id">
              {{ new Date(r.createdAt).toLocaleString() }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <div class="text-[10px] text-cyber-text/60">TO</div>
          <select v-model="rightId" class="bg-cyber-dark border border-cyber-green/20 rounded px-2 py-1 text-xs text-cyber-text">
            <option v-for="r in revisions" :key="r.id" :value="r.id">
              {{ new Date(r.createdAt).toLocaleString() }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="revisions.length === 0" class="mt-6 text-sm text-cyber-text/70">
      No revisions yet. Edit the page and wait a few seconds; a revision will be captured automatically.
    </div>

    <div v-else class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-cyber-panel border border-cyber-green/20 rounded p-4">
        <div class="text-xs font-bold text-cyber-text/70 mb-2">SUMMARY</div>
        <div class="text-sm text-cyber-text space-y-1">
          <div>Title: <span :class="summary.titleChanged ? 'text-yellow-300' : 'text-cyber-text/70'">{{ summary.titleChanged ? 'changed' : 'no change' }}</span></div>
          <div>Category: <span :class="summary.categoryChanged ? 'text-yellow-300' : 'text-cyber-text/70'">{{ summary.categoryChanged ? 'changed' : 'no change' }}</span></div>
          <div>Tags: <span :class="summary.tagsChanged ? 'text-yellow-300' : 'text-cyber-text/70'">{{ summary.tagsChanged ? 'changed' : 'no change' }}</span></div>
          <div>Markdown: <span :class="summary.markdownChanged ? 'text-yellow-300' : 'text-cyber-text/70'">{{ summary.markdownChanged ? 'changed' : 'no change' }}</span></div>
          <div>Blocks: <span class="text-cyber-text/80">+{{ summary.blocks.added }} / -{{ summary.blocks.removed }} / ~{{ summary.blocks.changed }}</span></div>
          <div>Edges: <span class="text-cyber-text/80">+{{ summary.edges.added }} / -{{ summary.edges.removed }}</span></div>
        </div>

        <div v-if="summary.changedBlockSamples.length > 0" class="mt-3">
          <div class="text-[10px] text-cyber-text/60 mb-1">CHANGED BLOCKS (SAMPLE)</div>
          <div class="text-xs text-cyber-text/80">
            <div v-for="s in summary.changedBlockSamples" :key="s">- {{ s }}</div>
          </div>
        </div>
      </div>

      <div class="bg-cyber-panel border border-cyber-green/20 rounded p-4">
        <div class="text-xs font-bold text-cyber-text/70 mb-2">REVISION DETAILS</div>
        <div class="text-xs text-cyber-text/80 space-y-2">
          <div>
            <div class="text-[10px] text-cyber-text/60">FROM</div>
            <div v-if="left">{{ new Date(left.createdAt).toLocaleString() }} ({{ left.hash }})</div>
          </div>
          <div>
            <div class="text-[10px] text-cyber-text/60">TO</div>
            <div v-if="right">{{ new Date(right.createdAt).toLocaleString() }} ({{ right.hash }})</div>
          </div>
        </div>

        <div class="mt-3 text-[10px] text-cyber-text/60">NOTE</div>
        <div class="text-xs text-cyber-text/70">This is a structural diff summary (blocks/edges/markdown). It does not show a line-by-line patch.</div>
      </div>
    </div>
  </div>
</template>
