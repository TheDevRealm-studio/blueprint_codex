<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../../stores/project';
import type { Block, RunbookItemStatus } from '../../types';

const props = defineProps<{ pageId: string }>();

const store = useProjectStore();

const page = computed(() => store.project?.pages?.[props.pageId] || null);

type TaskSource = 'markdown' | 'checklist-block' | 'steps-block';

type RunbookTask = {
  source: TaskSource;
  sourceKey: string; // 'markdown' | `block:${id}`
  index: number;
  label: string;
  checkedCapable: boolean;
  blockId?: string;
};

function getPageRunbook() {
  const meta = page.value?.metadata;
  const rb = meta?.runbook;
  if (rb && typeof rb === 'object') return rb;
  return undefined;
}

function ensureRunbook() {
  if (!page.value) return null;
  const meta = (page.value.metadata || (page.value.metadata = {} as any));
  if (!meta.runbook) {
    meta.runbook = { incidentNotes: '', itemNotes: {}, itemStatus: {} };
  }
  if (!meta.runbook.itemNotes) meta.runbook.itemNotes = {};
  if (!meta.runbook.itemStatus) meta.runbook.itemStatus = {};
  return meta.runbook;
}

function parseMarkdownChecklist(text: string) {
  const lines = (text || '').split(/\r?\n/);
  const items: Array<{ lineIndex: number; checked: boolean; label: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    const checked = String(m[1]).toLowerCase() === 'x';
    const label = String(m[2] || '').trim();
    if (label.length === 0) continue;
    items.push({ lineIndex: i, checked, label });
  }

  return { lines, items };
}

function setMarkdownChecklistLine(text: string, lineIndex: number, checked: boolean) {
  const parsed = parseMarkdownChecklist(text);
  if (lineIndex < 0 || lineIndex >= parsed.lines.length) return text;
  const line = parsed.lines[lineIndex] || '';
  const m = line.match(/^(\s*[-*]\s+)\[( |x|X)\](\s+.*)$/);
  if (!m) return text;
  parsed.lines[lineIndex] = `${m[1]}[${checked ? 'x' : ' '}]${m[3]}`;
  return parsed.lines.join('\n');
}

function blockText(block: Block): string {
  if (typeof block.content === 'string') return block.content;
  return String((block as any).content?.text || '');
}

function setBlockText(block: Block, nextText: string) {
  const content = block.content;
  if (typeof content === 'string') return nextText;
  const fontSize = (content && typeof content === 'object' && 'fontSize' in content) ? (content as any).fontSize : 13;
  return { text: nextText, fontSize };
}

const tasks = computed<RunbookTask[]>(() => {
  if (!page.value) return [];

  const out: RunbookTask[] = [];

  // 1) Markdown body checkboxes
  const md = parseMarkdownChecklist(page.value.markdownBody || '');
  for (const it of md.items) {
    out.push({
      source: 'markdown',
      sourceKey: 'markdown',
      index: it.lineIndex,
      label: it.label,
      checkedCapable: true
    });
  }

  // 2) Checklist blocks (markdown-style)
  for (const b of page.value.blocks || []) {
    if (b.type !== 'checklist') continue;
    const txt = blockText(b);
    const parsed = parseMarkdownChecklist(txt);
    for (const it of parsed.items) {
      out.push({
        source: 'checklist-block',
        sourceKey: `block:${b.id}`,
        index: it.lineIndex,
        label: it.label,
        checkedCapable: true,
        blockId: b.id
      });
    }
  }

  // 3) Steps blocks
  for (const b of page.value.blocks || []) {
    if (b.type !== 'steps') continue;
    const arr = Array.isArray(b.content) ? b.content : [];
    for (let i = 0; i < arr.length; i++) {
      const label = String(arr[i] || '').trim();
      if (!label) continue;
      out.push({
        source: 'steps-block',
        sourceKey: `steps:${b.id}`,
        index: i,
        label,
        checkedCapable: false,
        blockId: b.id
      });
    }
  }

  return out;
});

function statusFor(task: RunbookTask): RunbookItemStatus {
  const rb = getPageRunbook();
  const map = rb?.itemStatus?.[task.sourceKey];
  const s = map?.[task.index];
  return (s === 'done' || s === 'failed' || s === 'todo') ? s : 'todo';
}

function noteKey(task: RunbookTask) {
  return `${task.sourceKey}:${task.index}`;
}

function noteFor(task: RunbookTask) {
  const rb = getPageRunbook();
  return String(rb?.itemNotes?.[noteKey(task)] || '');
}

function setStatus(task: RunbookTask, next: RunbookItemStatus) {
  if (!page.value) return;
  const rb = ensureRunbook();
  if (!rb) return;

  rb.itemStatus![task.sourceKey] = rb.itemStatus![task.sourceKey] || {};
  rb.itemStatus![task.sourceKey]![task.index] = next;

  // If this task is backed by markdown checkbox text, keep it in sync for "done".
  if (task.checkedCapable) {
    const shouldCheck = next === 'done';

    if (task.source === 'markdown') {
      const nextBody = setMarkdownChecklistLine(page.value.markdownBody || '', task.index, shouldCheck);
      store.updatePage(page.value.id, { markdownBody: nextBody });
    }

    if (task.source === 'checklist-block' && task.blockId) {
      const blocks = page.value.blocks || [];
      const idx = blocks.findIndex(b => b.id === task.blockId);
      if (idx >= 0) {
        const b = blocks[idx];
        if (!b) return;
        const txt = blockText(b);
        const nextText = setMarkdownChecklistLine(txt, task.index, shouldCheck);
        const nextBlocks = [...blocks];
        nextBlocks[idx] = { ...b, content: setBlockText(b, nextText) };
        store.updatePage(page.value.id, { blocks: nextBlocks });
      }
    }
  } else {
    // Steps blocks don't have checkboxes; only state.
    store.updatePage(page.value.id, { metadata: { ...(page.value.metadata || {}), runbook: rb } });
  }
}

function toggleDone(task: RunbookTask) {
  const cur = statusFor(task);
  setStatus(task, cur === 'done' ? 'todo' : 'done');
}

function toggleFailed(task: RunbookTask) {
  const cur = statusFor(task);
  setStatus(task, cur === 'failed' ? 'todo' : 'failed');
}

function setNote(task: RunbookTask, value: string) {
  if (!page.value) return;
  const rb = ensureRunbook();
  if (!rb) return;
  rb.itemNotes![noteKey(task)] = value;
  store.updatePage(page.value.id, { metadata: { ...(page.value.metadata || {}), runbook: rb } });
}

function setIncidentNotes(value: string) {
  if (!page.value) return;
  const rb = ensureRunbook();
  if (!rb) return;
  rb.incidentNotes = value;
  store.updatePage(page.value.id, { metadata: { ...(page.value.metadata || {}), runbook: rb } });
}
</script>

<template>
  <div class="w-full h-full p-6 overflow-auto custom-scrollbar">
    <div class="text-cyber-green font-bold text-lg">RUNBOOK</div>
    <div class="text-cyber-text/60 text-xs">Task-oriented view of checklists and steps.</div>

    <div v-if="!page" class="mt-6 text-sm text-cyber-text/70">No page selected.</div>

    <div v-else class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-cyber-panel border border-cyber-green/20 rounded p-4">
        <div class="text-xs font-bold text-cyber-text/70 mb-3">STEPS</div>

        <div v-if="tasks.length === 0" class="text-sm text-cyber-text/70">
          No checklist items or steps found. Add a Checklist block or Steps block, or use Markdown checkboxes.
        </div>

        <div v-else class="flex flex-col gap-3">
          <div v-for="t in tasks" :key="t.sourceKey + ':' + t.index" class="bg-cyber-dark/50 border border-cyber-green/10 rounded p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-xs text-cyber-text/60">{{ t.source }}</div>
                <div class="text-sm text-cyber-text break-words">{{ t.label }}</div>
              </div>

              <div class="flex gap-2 shrink-0">
                <button
                  @click="toggleDone(t)"
                  class="text-xs px-2 py-1 rounded border"
                  :class="statusFor(t) === 'done'
                    ? 'border-cyber-green/50 text-cyber-green bg-cyber-green/10'
                    : 'border-cyber-green/20 text-cyber-text/70 hover:bg-cyber-green/5'"
                >
                  DONE
                </button>
                <button
                  @click="toggleFailed(t)"
                  class="text-xs px-2 py-1 rounded border"
                  :class="statusFor(t) === 'failed'
                    ? 'border-red-500/40 text-red-300 bg-red-500/10'
                    : 'border-cyber-green/20 text-cyber-text/70 hover:bg-cyber-green/5'"
                >
                  FAIL
                </button>
              </div>
            </div>

            <div class="mt-2">
              <div class="text-[10px] text-cyber-text/60 mb-1">NOTES</div>
              <input
                :value="noteFor(t)"
                @input="(e: Event) => setNote(t, (e.target as HTMLInputElement).value)"
                class="w-full bg-cyber-dark border border-cyber-green/20 rounded px-2 py-1 text-xs text-cyber-text focus:outline-none"
                placeholder="Optional note…"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="bg-cyber-panel border border-cyber-green/20 rounded p-4">
        <div class="text-xs font-bold text-cyber-text/70 mb-2">INCIDENT NOTES</div>
        <textarea
          :value="page.metadata?.runbook?.incidentNotes || ''"
          @input="(e: Event) => setIncidentNotes((e.target as HTMLTextAreaElement).value)"
          class="w-full h-48 bg-cyber-dark border border-cyber-green/20 rounded p-2 text-xs text-cyber-text focus:outline-none resize-none"
          placeholder="What happened? What did you do? Outcome?"
        ></textarea>

        <div class="mt-3 text-[10px] text-cyber-text/60">PERSISTENCE</div>
        <div class="text-xs text-cyber-text/70">Statuses and notes are stored on this page.</div>
      </div>
    </div>
  </div>
</template>
