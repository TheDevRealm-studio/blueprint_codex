<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { NodeResizer } from '@vue-flow/node-resizer';
import { computed, ref } from 'vue';
import MediaDisplay from '../MediaDisplay.vue';
import BlueprintVisualizer from '../../BlueprintVisualizer.vue';
import UnrealAssetCard from '../../UnrealAssetCard.vue';
import AIHelperView from '../../AIHelperView.vue';
import { useProjectStore } from '../../../stores/project';
import { unrealService } from '../../../services/unreal';
import { aiService } from '../../../services/ai';
import type { Pin } from '../../../types';
import '@vue-flow/node-resizer/dist/style.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import { marked } from 'marked';
import { Network, Image, ListOrdered, Link, Code, Package, Youtube, Globe, Type, X, Plus, Edit2, Check, Bold, Italic, Heading1, Heading2, Heading3, List, Sparkles, ChevronDown, ChevronUp, Eye, EyeOff, Wand2, Quote } from 'lucide-vue-next';

const props = defineProps<{
  id: string;
  data: {
    type: 'region' | 'text' | 'steps' | 'media' | 'blueprint' | 'link' | 'code' | 'asset' | 'youtube' | 'website';
    content: any;
    label?: string;
    width?: number;
    height?: number;
    selected?: boolean;
    pageId: string;
    pins?: Pin[];
    collapsed?: boolean;
  };
  selected?: boolean;
}>();

const store = useProjectStore();
const isEditingCode = ref(false);
const isEditingText = ref(false);
const isExplainingBlueprint = ref(false);
const showTextPreview = ref(false);
const isGeneratingText = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const assetSearchQuery = ref('');
const showAssetResults = ref(false);

const assetSearchResults = computed(() => {
  if (!assetSearchQuery.value) return [];
  return unrealService.search(assetSearchQuery.value);
});

function selectAsset(asset: any) {
  updateContent({ reference: `Blueprint'${asset.path}.${asset.name}'` });
  showAssetResults.value = false;
  assetSearchQuery.value = '';
}

const nodeStyle = computed(() => ({
  width: props.data.width ? `${props.data.width}px` : 'auto',
  height: props.data.height ? `${props.data.height}px` : 'auto',
}));

const headerColor = computed(() => {
  switch (props.data.type) {
    case 'region': return 'bg-gray-900/40';
    case 'blueprint': return 'bg-blue-700';
    case 'media': return 'bg-purple-700';
    case 'steps': return 'bg-orange-700';
    case 'link': return 'bg-green-700';
    case 'code': return 'bg-gray-800';
    case 'asset': return 'bg-teal-700';
    case 'youtube': return 'bg-red-700';
    case 'website': return 'bg-indigo-700';
    default: return 'bg-gray-700';
  }
});

const icon = computed(() => {
  switch (props.data.type) {
    case 'blueprint': return Network;
    case 'media': return Image;
    case 'steps': return ListOrdered;
    case 'link': return Link;
    case 'code': return Code;
    case 'asset': return Package;
    case 'youtube': return Youtube;
    case 'website': return Globe;
    default: return Type;
  }
});

const highlightedCode = computed(() => {
  if (props.data.type === 'code' && props.data.content.code) {
    try {
      return hljs.highlight(props.data.content.code, { language: props.data.content.language || 'plaintext' }).value;
    } catch (e) {
      return props.data.content.code;
    }
  }
  return '';
});

const textContent = computed(() => {
  if (props.data.type !== 'text') return '';
  if (typeof props.data.content === 'string') return props.data.content;
  return props.data.content.text || '';
});

const textFontSize = computed(() => {
  if (props.data.type !== 'text') return 14;
  if (typeof props.data.content === 'string') return 14;
  return props.data.content.fontSize || 14;
});

const renderedMarkdown = computed(() => {
  if (props.data.type !== 'text') return '';
  // @ts-ignore
  return marked.parse(textContent.value);
});

function insertMarkdown(prefix: string, suffix: string = '') {
    if (!textareaRef.value) return;
    const textarea = textareaRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    updateContent({ text: newText, fontSize: textFontSize.value });

    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
}

function replaceSelectionOrAll(replacement: string) {
  if (!replacement) return;

  // Prefer replacing selection if we have a textarea.
  if (textareaRef.value && isEditingText.value) {
    const textarea = textareaRef.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const hasSelection = end > start;

    const nextText = hasSelection
      ? text.substring(0, start) + replacement + text.substring(end)
      : replacement;

    updateContent({ text: nextText, fontSize: textFontSize.value });
    return;
  }

  updateContent({ text: replacement, fontSize: textFontSize.value });
}

async function generateTextWithAI() {
  if (!aiService.isEnabled()) {
    alert('AI is not configured. Open Settings and add your API key/model.');
    return;
  }

  const topic = prompt('AI: What should this text node write about?', '')?.trim() || '';
  if (!topic) return;

  isGeneratingText.value = true;
  try {
    const promptText = `Write a concise Unreal Engine documentation note in Markdown about: "${topic}".

Rules:
- No emojis.
- Use short headings and bullet points.
- If relevant, include: Overview, Key Concepts, Edge Cases, Replication, Performance.
- If you are unsure, add TODO bullets instead of guessing.
`;

    const res = await aiService.customRequest(promptText, 700);
    const output = res.text.trim();
    if (!output) return;

    // Insert at cursor if editing, else replace all.
    if (textareaRef.value && isEditingText.value) {
      const textarea = textareaRef.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const nextText = text.substring(0, start) + output + text.substring(end);
      updateContent({ text: nextText, fontSize: textFontSize.value });
      setTimeout(() => {
        textarea.focus();
        const pos = start + output.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    } else {
      replaceSelectionOrAll(output);
    }
  } catch (e) {
    console.error('AI generate failed', e);
    alert('AI request failed.');
  } finally {
    isGeneratingText.value = false;
  }
}

const parsedAsset = computed(() => {
  if (props.data.type !== 'asset' || !props.data.content.reference) return null;
  const ref = props.data.content.reference;
  const match = ref.match(/^(\w+)'(.*)\.([^']+)'$/);
  if (match) {
    return {
      asset_type: match[1],
      path: match[2],
      name: match[3]
    };
  }
  return {
    asset_type: 'Unknown',
    path: ref,
    name: 'Unknown Asset'
  };
});


const extraInputs = computed(() => props.data.pins?.filter(p => p.type === 'target') || []);
const extraOutputs = computed(() => props.data.pins?.filter(p => p.type === 'source') || []);

const PIN_TOP_START = 70; // px from top of node container
const PIN_SPACING = 22; // px between pins

function pinTop(index: number) {
  return `${PIN_TOP_START + index * PIN_SPACING}px`;
}

function addPin(type: 'source' | 'target') {
    if (props.data.pageId) {
        const page = store.project?.pages[props.data.pageId];
        if (page) {
            const blocks = [...page.blocks];
            const blockIndex = blocks.findIndex(b => b.id === props.id);
            if (blockIndex !== -1) {
                const block = blocks[blockIndex];
                if (block) {
                    const currentPins = block.pins || [];
                    const newPin: Pin = {
                        id: crypto.randomUUID(),
                        type,
                        label: 'Pin'
                    };
                    blocks[blockIndex] = {
                        ...block,
                        pins: [...currentPins, newPin]
                    } as any;
                    store.updatePage(props.data.pageId, { blocks });
                }
            }
        }
    }
}

function removePin(pinId: string) {
    if (props.data.pageId) {
        const page = store.project?.pages[props.data.pageId];
        if (page) {
            const blocks = [...page.blocks];
            const blockIndex = blocks.findIndex(b => b.id === props.id);
            if (blockIndex !== -1) {
                const block = blocks[blockIndex];
                if (block) {
                    const currentPins = block.pins || [];
                    blocks[blockIndex] = {
                        ...block,
                        pins: currentPins.filter(p => p.id !== pinId)
                    } as any;

          // Remove edges that referenced this handle
          const currentEdges = page.edges || [];
          const filteredEdges = currentEdges.filter(e => e.sourceHandle !== pinId && e.targetHandle !== pinId);

          store.updatePage(props.data.pageId, { blocks, edges: filteredEdges });
                }
            }
        }
    }
}

function renamePin(pinId: string) {
  if (!props.data.pageId) return;
  const page = store.project?.pages[props.data.pageId];
  if (!page) return;

  const blockIndex = page.blocks.findIndex(b => b.id === props.id);
  if (blockIndex === -1) return;

  const block = page.blocks[blockIndex];
  if (!block) return;
  const pins = block.pins || [];
  const pin = pins.find(p => p.id === pinId);
  const currentLabel = pin?.label || '';

  const next = prompt('Pin label:', currentLabel);
  if (next === null) return;

  const updatedPins = pins.map(p => (p.id === pinId ? { ...p, label: next } : p));
  const updatedBlocks = [...page.blocks];
  updatedBlocks[blockIndex] = { ...block, pins: updatedPins } as any;
  store.updatePage(props.data.pageId, { blocks: updatedBlocks });
}

function getEmbedUrl(url: string) {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11)
      ? `https://www.youtube.com/embed/${match[2]}`
      : url;
}

const assetInfo = computed(() => {
  if (props.data.type !== 'asset' || !props.data.content.reference) return null;

  const ref = props.data.content.reference;
  // Try to parse: Blueprint'/Game/Path/To/Asset.Asset'
  const match = ref.match(/([a-zA-Z0-9_]+)'(.*)'/);

  if (match) {
    const type = match[1];
    const path = match[2];
    const name = path.split('.').pop() || path.split('/').pop() || 'Unknown';
    return { type, path, name };
  }

  // Fallback for simple paths
  const name = ref.split('.').pop() || ref.split('/').pop() || ref;
  return { type: 'Asset', path: ref, name };
});

function copyAssetPath() {
  if (props.data.content.reference) {
    navigator.clipboard.writeText(props.data.content.reference);
  }
}

function addTextBlockNearThis(text: string) {
  const pageId = props.data.pageId;
  const page = store.project?.pages[pageId];
  if (!page) return;

  const thisBlock = page.blocks.find(b => b.id === props.id);
  const x = (thisBlock?.x ?? 100) + (thisBlock?.width ?? 300) + 40;
  const y = thisBlock?.y ?? 100;

  const newBlock: any = {
    id: crypto.randomUUID(),
    type: 'text',
    content: { text, fontSize: 12 },
    x,
    y,
    width: 380,
    height: 260
  };

  store.updatePage(pageId, { blocks: [...page.blocks, newBlock] });
}

async function explainBlueprintWithAI() {
  if (props.data.type !== 'blueprint') return;
  const bp = props.data.content?.blueprintString;
  if (!bp || typeof bp !== 'string') return;

  if (!aiService.isEnabled()) {
    alert('AI is not configured. Open Settings and add your API key/model.');
    return;
  }

  isExplainingBlueprint.value = true;
  try {
    const trimmed = bp.length > 12000 ? bp.slice(0, 12000) : bp;
    const explanation = await aiService.explainBlueprint(trimmed);
    if (explanation && explanation.trim().length > 0) {
      addTextBlockNearThis(explanation.trim());
    }
  } catch (e) {
    console.error('Failed to explain blueprint', e);
    alert('Failed to run AI blueprint explanation.');
  } finally {
    isExplainingBlueprint.value = false;
  }
}

function updateContent(newContent: any) {
  if (props.data.pageId) {
    // We need to find the block in the store and update it
    const page = store.project?.pages[props.data.pageId];
    if (page) {
      const blocks = [...page.blocks];
      const blockIndex = blocks.findIndex(b => b.id === props.id);
      if (blockIndex !== -1) {
        blocks[blockIndex] = { ...blocks[blockIndex], content: newContent } as any;
        store.updatePage(props.data.pageId, { blocks });
      }
    }
  }
}

function updateStep(index: number, value: string) {
  const newSteps = [...props.data.content];
  newSteps[index] = value;
  updateContent(newSteps);
}

function addStep() {
  const newSteps = [...props.data.content, 'New Step'];
  updateContent(newSteps);
}

function removeStep(index: number) {
  const newSteps = [...props.data.content];
  newSteps.splice(index, 1);
  updateContent(newSteps);
}

function deleteBlock() {
    if (props.data.pageId) {
        const page = store.project?.pages[props.data.pageId];
        if (page) {
            const blocks = page.blocks.filter(b => b.id !== props.id);
            store.updatePage(props.data.pageId, { blocks });
        }
    }
}

function onResizeEnd(event: any) {
    if (props.data.pageId) {
        const page = store.project?.pages[props.data.pageId];
        if (page) {
            const blocks = [...page.blocks];
            const blockIndex = blocks.findIndex(b => b.id === props.id);
            if (blockIndex !== -1) {
                blocks[blockIndex] = {
                    ...blocks[blockIndex],
                    width: event.params.width,
                    height: event.params.height
                } as any;
                store.updatePage(props.data.pageId, { blocks });
            }
        }
    }
}

function toggleCollapsed() {
  if (!props.data.pageId) return;
  const page = store.project?.pages[props.data.pageId];
  if (!page) return;

  const blocks = [...page.blocks];
  const idx = blocks.findIndex(b => b.id === props.id);
  if (idx === -1) return;

  const block = blocks[idx];
  if (!block) return;

  blocks[idx] = { ...block, collapsed: !Boolean((block as any).collapsed) } as any;
  store.updatePage(props.data.pageId, { blocks });
}
</script>

<template>
  <div
    class="rounded-lg overflow-hidden flex flex-col min-w-[200px] group"
    :class="[
      { 'ring-2 ring-ue-selected': selected },
      data.type === 'region' ? 'bg-transparent border-0 shadow-none' : 'shadow-lg bg-ue-panel border border-black'
    ]"
    :style="nodeStyle"
  >
    <NodeResizer
        :min-width="200"
        :min-height="100"
        :is-visible="selected"
        line-class-name="!border-ue-accent"
        handle-class-name="!bg-ue-accent"
        @resize-end="onResizeEnd"
    />

    <!-- Handles (not for regions) -->
    <Handle v-if="data.type !== 'region'" type="target" :position="Position.Left" class="!bg-white !w-3 !h-3" />
    <Handle v-if="data.type !== 'region'" type="source" :position="Position.Right" class="!bg-white !w-3 !h-3" />

    <!-- Extra Inputs -->
    <div v-if="data.type !== 'region'" class="absolute left-0 top-10 bottom-0 flex flex-col gap-4 py-2 pointer-events-none z-50">
      <div v-for="(pin, i) in extraInputs" :key="pin.id" class="relative pointer-events-auto group/pin">
        <Handle
          :id="pin.id"
          type="target"
          :position="Position.Left"
          class="!bg-ue-accent !w-3 !h-3 !border !border-white"
          :style="{ top: pinTop(i) }"
        />
        <!-- Pin Label/Delete -->
        <div class="absolute left-4" :style="{ top: pinTop(i) }">
          <div class="-translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/pin:opacity-100 transition-opacity bg-black/90 px-1.5 py-0.5 rounded border border-gray-700">
            <button
            @click.stop="renamePin(pin.id)"
            class="text-gray-200 hover:text-white text-[10px] font-bold px-1"
            :title="pin.label || 'Rename pin'"
            >
            <Edit2 class="w-3 h-3" />
            </button>
            <span class="text-[10px] text-gray-200 max-w-[120px] truncate" :title="pin.label || ''">{{ pin.label || 'Pin' }}</span>
            <button @click.stop="removePin(pin.id)" class="text-red-500 hover:text-red-400 text-[10px] font-bold px-1" title="Remove pin">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
        <!-- Add Input Button -->
        <button @click.stop="addPin('target')" class="pointer-events-auto ml-[-8px] mt-2 w-4 h-4 rounded-full bg-gray-700 hover:bg-green-500 text-white flex items-center justify-center text-[10px] shadow border border-black transition-colors" title="Add Input Pin">
            <Plus class="w-3 h-3" />
        </button>
    </div>

    <!-- Extra Outputs -->
    <div v-if="data.type !== 'region'" class="absolute right-0 top-10 bottom-0 flex flex-col gap-4 py-2 items-end pointer-events-none z-50">
      <div v-for="(pin, i) in extraOutputs" :key="pin.id" class="relative pointer-events-auto group/pin">
        <Handle
          :id="pin.id"
          type="source"
          :position="Position.Right"
          class="!bg-ue-accent !w-3 !h-3 !border !border-white"
          :style="{ top: pinTop(i) }"
        />
         <!-- Pin Label/Delete -->
        <div class="absolute right-4" :style="{ top: pinTop(i) }">
          <div class="-translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/pin:opacity-100 transition-opacity bg-black/90 px-1.5 py-0.5 rounded border border-gray-700">
            <button
            @click.stop="renamePin(pin.id)"
            class="text-gray-200 hover:text-white text-[10px] font-bold px-1"
            :title="pin.label || 'Rename pin'"
            >
            <Edit2 class="w-3 h-3" />
            </button>
            <span class="text-[10px] text-gray-200 max-w-[120px] truncate" :title="pin.label || ''">{{ pin.label || 'Pin' }}</span>
            <button @click.stop="removePin(pin.id)" class="text-red-500 hover:text-red-400 text-[10px] font-bold px-1" title="Remove pin">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
        <!-- Add Output Button -->
        <button @click.stop="addPin('source')" class="pointer-events-auto mr-[-8px] mt-2 w-4 h-4 rounded-full bg-gray-700 hover:bg-green-500 text-white flex items-center justify-center text-[10px] shadow border border-black transition-colors" title="Add Output Pin">
            <Plus class="w-3 h-3" />
        </button>
    </div>

    <!-- Region (Lane) -->
    <div v-if="data.type === 'region'" class="bg-ue-panel/30 border border-ue-accent/40 flex-1 flex flex-col">
      <div class="px-3 py-2 flex items-center justify-between handle">
        <input
          :value="data.content?.title || 'Region'"
          @input="(e: Event) => updateContent({ ...(data.content || {}), title: (e.target as HTMLInputElement).value })"
          class="bg-transparent border-b border-white/10 text-xs font-bold uppercase tracking-wider text-gray-200 focus:outline-none focus:border-ue-selected w-full mr-2"
          placeholder="Region title"
        />
        <button @click.stop="deleteBlock" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <X class="w-4 h-4" />
        </button>
      </div>
      <div class="flex-1 rounded-md bg-black/10"></div>
    </div>

    <!-- Header (non-region) -->
    <div v-else :class="['px-3 py-1 flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider handle', headerColor, 'bg-ue-panel border-b border-black']">
      <div class="flex items-center gap-2">
        <component :is="icon" class="w-4 h-4" />
        <span>{{ data.label || 'Block' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click.stop="toggleCollapsed"
          class="text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          :title="data.collapsed ? 'Expand' : 'Collapse'"
        >
          <component :is="data.collapsed ? ChevronDown : ChevronUp" class="w-4 h-4" />
        </button>
        <button @click.stop="deleteBlock" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete block">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Content (non-region) -->
    <div v-if="data.type !== 'region'" class="p-3 flex-1 overflow-auto text-sm text-gray-300 bg-ue-dark/50 nodrag cursor-text">

      <div v-if="data.collapsed" class="h-full flex items-center justify-center text-xs text-gray-500 select-none">
        (collapsed)
      </div>

      <template v-else>

      <!-- Text Block -->
      <div v-if="data.type === 'text'" class="h-full flex flex-col relative group/text">
        <!-- View Mode -->
        <div
            v-if="!isEditingText"
            @dblclick="isEditingText = true"
            class="w-full h-full prose prose-invert prose-sm max-w-none overflow-auto custom-scrollbar p-1"
            :style="{ fontSize: `${textFontSize}px` }"
            v-html="renderedMarkdown"
        ></div>

        <!-- Edit Button (Visible on Hover) -->
        <button
            v-if="!isEditingText"
            @click="isEditingText = true"
            class="absolute top-0 right-0 p-1 bg-black/50 rounded text-gray-400 hover:text-white opacity-0 group-hover/text:opacity-100 transition-opacity"
        >
            <Edit2 class="w-3 h-3" />
        </button>

        <!-- Edit Mode -->
        <div v-else class="h-full flex flex-col">
            <div class="flex items-center justify-between gap-2 mb-1 border-b border-gray-700 pb-1 px-1 bg-black/20">
                <!-- Toolbar -->
                <div class="flex items-center gap-1">
                    <button @click="insertMarkdown('**', '**')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Bold">
                        <Bold class="w-3 h-3" />
                    </button>
                    <button @click="insertMarkdown('*', '*')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Italic">
                        <Italic class="w-3 h-3" />
                    </button>
                    <button @click="insertMarkdown('# ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Heading 1">
                        <Heading1 class="w-3 h-3" />
                    </button>
                    <button @click="insertMarkdown('## ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Heading 2">
                        <Heading2 class="w-3 h-3" />
                    </button>
              <button @click="insertMarkdown('### ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Heading 3">
                <Heading3 class="w-3 h-3" />
              </button>
                    <button @click="insertMarkdown('- ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="List">
                        <List class="w-3 h-3" />
                    </button>
              <button @click="insertMarkdown('- [ ] ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Task">
                <ListOrdered class="w-3 h-3" />
              </button>
              <button @click="insertMarkdown('> ')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Quote">
                <Quote class="w-3 h-3" />
              </button>
              <button @click="insertMarkdown('[[', ']]')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Wiki Link">
                <Link class="w-3 h-3" />
              </button>
              <button @click="insertMarkdown('```\n', '\n```')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Code Block">
                <Code class="w-3 h-3" />
              </button>
                </div>

                <div class="flex items-center gap-2">
              <button
                @click="showTextPreview = !showTextPreview"
                class="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10"
                :title="showTextPreview ? 'Hide Preview' : 'Show Preview'"
              >
                <component :is="showTextPreview ? EyeOff : Eye" class="w-3 h-3" />
              </button>

              <button
                @click="generateTextWithAI"
                class="p-1 rounded text-purple-300 hover:text-white hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isGeneratingText || !aiService.isEnabled()"
                :title="aiService.isEnabled() ? 'AI Generate (insert at cursor)' : 'Configure AI in Settings'"
              >
                <Wand2 class="w-3 h-3" />
              </button>

              <AIHelperView
                :content="textContent"
                @apply="replaceSelectionOrAll"
                class="!px-0"
              />

                    <input
                        type="number"
                        :value="textFontSize"
                        @input="(e: Event) => updateContent({ text: textContent, fontSize: Number((e.target as HTMLInputElement).value) })"
                        class="w-10 bg-black/20 border border-gray-700 rounded px-1 text-xs text-gray-300 focus:outline-none text-center"
                        min="8"
                        max="120"
                        title="Font Size"
                    />
                    <button @click="isEditingText = false" class="text-green-500 hover:text-green-400 bg-green-500/10 p-1 rounded" title="Done">
                        <Check class="w-3 h-3" />
                    </button>
                </div>
            </div>
          <div class="flex-1 flex flex-col gap-2">
            <textarea
              ref="textareaRef"
              :value="textContent"
              @input="(e: Event) => updateContent({ text: (e.target as HTMLTextAreaElement).value, fontSize: textFontSize })"
              class="w-full flex-1 bg-black/20 border border-gray-700 rounded p-2 resize-none focus:outline-none text-gray-300 font-mono text-xs"
              :style="{ fontSize: `${textFontSize}px`, lineHeight: '1.4' }"
              placeholder="Type Markdown here..."
              spellcheck="true"
              @keydown.esc="isEditingText = false"
            ></textarea>

            <div v-if="showTextPreview" class="bg-black/20 border border-gray-700 rounded p-2">
            <div class="text-[10px] text-gray-500 mb-1 uppercase font-bold">Preview</div>
            <div
              class="prose prose-invert prose-sm max-w-none overflow-auto custom-scrollbar"
              :style="{ fontSize: `${textFontSize}px` }"
              v-html="renderedMarkdown"
            ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Steps Block -->
      <div v-else-if="data.type === 'steps'" class="flex flex-col gap-2">
        <div v-for="(step, i) in data.content" :key="i" class="flex gap-2 items-center">
          <span class="font-bold text-ue-accent select-none">{{ i + 1 }}.</span>
          <input
            :value="step"
            @input="(e: Event) => updateStep(i, (e.target as HTMLInputElement).value)"
            class="flex-1 bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm focus:border-ue-selected focus:outline-none"
          />
          <button @click="removeStep(i)" class="text-gray-600 hover:text-red-500 px-1">×</button>
        </div>
        <button @click="addStep" class="text-xs text-ue-accent hover:underline text-left">+ Add Step</button>
      </div>

      <!-- Media Block -->
      <div v-else-if="data.type === 'media'" class="w-full h-full flex flex-col gap-2">
        <div class="flex-1 flex items-center justify-center bg-black/20 rounded min-h-[150px]">
            <MediaDisplay
            :src="data.content.filePath"
            :kind="data.content.kind"
            :label="data.content.label"
            class="max-w-full max-h-full object-contain"
            />
        </div>
        <input
            :value="data.content.label"
            @input="(e: Event) => updateContent({ ...data.content, label: (e.target as HTMLInputElement).value })"
            class="bg-transparent border-b border-gray-700 text-center text-xs text-gray-400 focus:outline-none focus:border-ue-selected"
            placeholder="Label..."
        />
      </div>

      <!-- YouTube Block -->
      <div v-else-if="data.type === 'youtube'" class="w-full h-full flex flex-col gap-2 p-1">
        <div class="flex-1 bg-black rounded overflow-hidden relative min-h-[150px]">
            <iframe
                width="100%"
                height="100%"
                :src="getEmbedUrl(data.content.url)"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                class="absolute top-0 left-0 w-full h-full"
            ></iframe>
        </div>
        <input
            :value="data.content.title"
            @input="(e: Event) => updateContent({ ...data.content, title: (e.target as HTMLInputElement).value })"
            class="bg-transparent border-b border-gray-700 text-center text-xs text-gray-400 focus:outline-none focus:border-ue-selected"
            placeholder="Title..."
        />
      </div>

      <!-- Website Block -->
      <div v-else-if="data.type === 'website'" class="w-full h-full flex flex-col bg-ue-panel border border-gray-700 rounded overflow-hidden group/web">

        <!-- Preview Area -->
        <div class="flex-1 relative bg-black overflow-hidden min-h-[150px]">
            <!-- Image Preview -->
            <img
                v-if="data.content.imageUrl"
                :src="data.content.imageUrl"
                class="w-full h-full object-cover opacity-80 group-hover/web:opacity-100 transition-opacity"
                alt="Link Preview"
            />

            <!-- Iframe Fallback (only if no image) -->
            <iframe
                v-else
                width="100%"
                height="100%"
                :src="data.content.url"
                frameborder="0"
                class="absolute top-0 left-0 w-full h-full bg-white"
            ></iframe>

            <!-- Overlay Link Icon -->
            <a :href="data.content.url" target="_blank" class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/web:opacity-100 transition-opacity z-10">
                <span class="text-4xl drop-shadow-lg">🔗</span>
            </a>
        </div>

        <!-- Info Area -->
        <div class="p-2 flex flex-col gap-1 bg-ue-dark border-t border-gray-700">
            <div class="font-bold text-xs text-white truncate" :title="data.content.title">{{ data.content.title || data.content.url }}</div>
            <div v-if="data.content.description" class="text-[10px] text-gray-400 line-clamp-2 leading-tight">{{ data.content.description }}</div>
            <div class="text-[9px] text-ue-accent truncate opacity-70">{{ data.content.url }}</div>
        </div>
      </div>

      <!-- Asset Block -->
      <div v-else-if="data.type === 'asset'" class="flex flex-col gap-2">
        <UnrealAssetCard v-if="parsedAsset" :asset="parsedAsset" />
        <div v-else class="text-red-500 text-xs">Invalid Asset Reference</div>
      </div>

      <!-- Blueprint Block -->
      <div v-else-if="data.type === 'blueprint'" class="w-full h-full min-h-[100px] flex flex-col">
        <div v-if="!data.content.blueprintString" class="text-xs text-gray-500 italic text-center p-4">
          <textarea
            :value="data.content.blueprintString"
            @change="(e: Event) => updateContent({ blueprintString: (e.target as HTMLTextAreaElement).value })"
            class="w-full h-24 bg-black/20 border border-gray-700 rounded p-2 text-xs font-mono text-gray-400"
            placeholder="Paste Blueprint String here..."
          ></textarea>
        </div>
        <div v-else class="flex-1 relative group/bp">
            <BlueprintVisualizer
            :blueprint="data.content.blueprintString"
            class="w-full h-full min-h-[200px]"
            />
          <button
            @click="explainBlueprintWithAI"
            class="absolute top-2 right-20 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover/bp:opacity-100 transition-opacity flex items-center gap-1"
            :disabled="isExplainingBlueprint"
            :title="aiService.isEnabled() ? 'Explain Blueprint with AI' : 'Configure AI in Settings'"
          >
            <Sparkles class="w-3 h-3" />
            {{ isExplainingBlueprint ? 'AI...' : 'AI Explain' }}
          </button>
            <button
                @click="updateContent({ blueprintString: '' })"
                class="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover/bp:opacity-100 transition-opacity"
            >
                Edit
            </button>
        </div>
      </div>

      <!-- Link Block -->
      <div v-else-if="data.type === 'link'" class="flex flex-col items-center justify-center h-full gap-3 p-2">
        <div class="text-base font-bold text-ue-text text-center">{{ data.content.title }}</div>
        <button
          @click="store.setActivePage(data.content.pageId)"
          class="px-4 py-1.5 bg-ue-accent text-white rounded hover:bg-orange-600 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
        >
          Open Page
        </button>
      </div>

      <!-- Code Block -->
      <div v-else-if="data.type === 'code'" class="flex flex-col h-full relative group/code">
        <!-- Header / Controls -->
        <div class="flex justify-between items-center px-2 py-1 bg-black/20 border-b border-gray-700">
            <span class="text-[10px] text-gray-500 font-mono">{{ data.content.language }}</span>
            <div class="flex gap-2">
                <button
                    v-if="!isEditingCode"
                    @click="isEditingCode = true"
                    class="text-[10px] text-ue-accent hover:text-white uppercase font-bold opacity-0 group-hover/code:opacity-100 transition-opacity"
                >
                    Edit
                </button>
                <button
                    v-else
                    @click="isEditingCode = false"
                    class="text-[10px] text-green-500 hover:text-white uppercase font-bold"
                >
                    Done
                </button>
            </div>
        </div>

        <!-- Editor Mode -->
        <div v-if="isEditingCode" class="flex-1 flex flex-col h-full">
             <div class="flex justify-end px-2 py-1 bg-black/10 border-b border-gray-800">
                <select
                    :value="data.content.language"
                    @change="(e: Event) => updateContent({ ...data.content, language: (e.target as HTMLSelectElement).value })"
                    class="bg-transparent text-xs text-gray-400 focus:outline-none cursor-pointer"
                >
                    <option value="cpp">C++</option>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="json">JSON</option>
                </select>
            </div>
            <textarea
                :value="data.content.code"
                @input="(e: Event) => updateContent({ ...data.content, code: (e.target as HTMLTextAreaElement).value })"
                class="flex-1 w-full bg-[#1e1e1e] text-gray-300 p-2 font-mono text-xs resize-none focus:outline-none custom-scrollbar"
                spellcheck="false"
                placeholder="// Write code here..."
            ></textarea>
        </div>

        <!-- View Mode (Highlighted) -->
        <div v-else class="flex-1 w-full bg-[#282c34] p-2 overflow-auto custom-scrollbar">
            <pre class="m-0"><code class="font-mono text-xs !bg-transparent !p-0" v-html="highlightedCode"></code></pre>
        </div>
      </div>

      <!-- Asset Block -->
      <div v-else-if="data.type === 'asset'" class="flex flex-col h-full gap-2 p-2">
        <div v-if="!data.content.reference" class="flex-1 flex flex-col relative">
             <input
                v-model="assetSearchQuery"
                @focus="showAssetResults = true"
                class="w-full bg-black/20 border border-gray-700 rounded p-2 text-xs text-gray-300 focus:outline-none focus:border-ue-accent"
                placeholder="Search Asset or Paste Reference..."
                @change="(e: Event) => updateContent({ reference: (e.target as HTMLInputElement).value })"
            />

            <!-- Autocomplete Results -->
            <div v-if="showAssetResults && assetSearchResults.length > 0" class="absolute top-full left-0 w-full bg-ue-panel border border-gray-700 shadow-xl z-50 max-h-40 overflow-y-auto mt-1 rounded">
              <!-- Fixed key usage -->
              <div
                v-for="asset in assetSearchResults"
                :key="asset.path"
                @mousedown="selectAsset(asset)"
                class="px-2 py-1 hover:bg-ue-accent hover:text-white cursor-pointer text-xs flex flex-col border-b border-gray-800 last:border-0"
              >
                <span class="font-bold">{{ asset.name }}</span>
                <span class="text-[10px] opacity-70 truncate">{{ asset.path }}</span>
              </div>
            </div>
        </div>
        <div v-else class="flex flex-col gap-2 h-full">
            <div class="flex items-center gap-2 bg-black/40 p-2 rounded border border-gray-700">
                <div class="w-8 h-8 bg-gray-700 rounded flex items-center justify-center text-lg">
                    {{ assetInfo?.type === 'Blueprint' ? 'BP' : '📦' }}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-white truncate" :title="assetInfo?.name">{{ assetInfo?.name }}</div>
                    <div class="text-[10px] text-gray-500 truncate">{{ assetInfo?.type }}</div>
                </div>
            </div>

            <div class="flex-1 bg-black/20 rounded p-2 text-[10px] text-gray-500 font-mono break-all overflow-y-auto custom-scrollbar">
                {{ assetInfo?.path }}
            </div>

            <div class="flex gap-2">
                <button
                    @click="copyAssetPath"
                    class="flex-1 bg-ue-dark border border-gray-600 hover:bg-gray-700 text-white text-xs py-1 rounded transition-colors flex items-center justify-center gap-1"
                >
                    <span>📋</span> Copy Path
                </button>
                <button
                    @click="updateContent({ reference: '' })"
                    class="px-2 bg-ue-dark border border-gray-600 hover:bg-red-900/50 text-gray-400 hover:text-red-400 text-xs py-1 rounded transition-colors"
                    title="Edit Reference"
                >
                    ✏️
                </button>
            </div>
        </div>
      </div>

      </template>

    </div>
  </div>
</template>

<style scoped>
.handle {
  cursor: grab;
}
.nodrag {
    cursor: default;
}
</style>
