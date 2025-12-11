<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { NodeResizer } from '@vue-flow/node-resizer';
import { computed, ref } from 'vue';
import MediaDisplay from '../MediaDisplay.vue';
import BlueprintVisualizer from '../../BlueprintVisualizer.vue';
import { useProjectStore } from '../../../stores/project';
import type { Pin } from '../../../types';
import '@vue-flow/node-resizer/dist/style.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

const props = defineProps<{
  id: string;
  data: {
    type: 'text' | 'steps' | 'media' | 'blueprint' | 'link' | 'code' | 'asset';
    content: any;
    label?: string;
    width?: number;
    height?: number;
    selected?: boolean;
    pageId: string;
    pins?: Pin[];
  };
  selected?: boolean;
}>();

const store = useProjectStore();
const isEditingCode = ref(false);

const nodeStyle = computed(() => ({
  width: props.data.width ? `${props.data.width}px` : 'auto',
  height: props.data.height ? `${props.data.height}px` : 'auto',
}));

const headerColor = computed(() => {
  switch (props.data.type) {
    case 'blueprint': return 'bg-blue-700';
    case 'media': return 'bg-purple-700';
    case 'steps': return 'bg-orange-700';
    case 'link': return 'bg-green-700';
    case 'code': return 'bg-gray-800';
    case 'asset': return 'bg-teal-700';
    default: return 'bg-gray-700';
  }
});

const icon = computed(() => {
  switch (props.data.type) {
    case 'blueprint': return '🕸️';
    case 'media': return '🖼️';
    case 'steps': return '🔢';
    case 'link': return '🔗';
    case 'code': return '💻';
    case 'asset': return '📦';
    default: return '📝';
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

const extraInputs = computed(() => props.data.pins?.filter(p => p.type === 'target') || []);
const extraOutputs = computed(() => props.data.pins?.filter(p => p.type === 'source') || []);

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
                    store.updatePage(props.data.pageId, { blocks });
                }
            }
        }
    }
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
</script>

<template>
  <div
    class="rounded-lg shadow-lg bg-ue-panel border border-black overflow-hidden flex flex-col min-w-[200px] group"
    :class="{ 'ring-2 ring-ue-selected': selected }"
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

    <!-- Handles -->
    <Handle type="target" :position="Position.Left" class="!bg-white !w-3 !h-3" />
    <Handle type="source" :position="Position.Right" class="!bg-white !w-3 !h-3" />

    <!-- Extra Inputs -->
    <div class="absolute left-0 top-10 bottom-0 flex flex-col gap-4 py-2 pointer-events-none z-50">
        <div v-for="pin in extraInputs" :key="pin.id" class="relative pointer-events-auto group/pin">
            <Handle :id="pin.id" type="target" :position="Position.Left" class="!bg-ue-accent !w-3 !h-3 !border !border-white" />
            <!-- Pin Label/Delete -->
            <div class="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/pin:opacity-100 transition-opacity bg-black/90 px-1 rounded border border-gray-700">
                <button @click.stop="removePin(pin.id)" class="text-red-500 hover:text-red-400 text-[10px] font-bold px-1">×</button>
            </div>
        </div>
        <!-- Add Input Button -->
        <button @click.stop="addPin('target')" class="pointer-events-auto ml-[-8px] mt-2 w-4 h-4 rounded-full bg-gray-700 hover:bg-green-500 text-white flex items-center justify-center text-[10px] shadow border border-black transition-colors" title="Add Input Pin">+</button>
    </div>

    <!-- Extra Outputs -->
    <div class="absolute right-0 top-10 bottom-0 flex flex-col gap-4 py-2 items-end pointer-events-none z-50">
        <div v-for="pin in extraOutputs" :key="pin.id" class="relative pointer-events-auto group/pin">
            <Handle :id="pin.id" type="source" :position="Position.Right" class="!bg-ue-accent !w-3 !h-3 !border !border-white" />
             <!-- Pin Label/Delete -->
            <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/pin:opacity-100 transition-opacity bg-black/90 px-1 rounded border border-gray-700">
                <button @click.stop="removePin(pin.id)" class="text-red-500 hover:text-red-400 text-[10px] font-bold px-1">×</button>
            </div>
        </div>
        <!-- Add Output Button -->
        <button @click.stop="addPin('source')" class="pointer-events-auto mr-[-8px] mt-2 w-4 h-4 rounded-full bg-gray-700 hover:bg-green-500 text-white flex items-center justify-center text-[10px] shadow border border-black transition-colors" title="Add Output Pin">+</button>
    </div>

    <!-- Header -->
    <div :class="['px-3 py-1 flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider handle', headerColor]">
      <div class="flex items-center gap-2">
        <span>{{ icon }}</span>
        <span>{{ data.label || 'Block' }}</span>
      </div>
      <button @click.stop="deleteBlock" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    </div>

    <!-- Content -->
    <div class="p-3 flex-1 overflow-auto text-sm text-gray-300 bg-ue-dark/50 nodrag cursor-text">

      <!-- Text Block -->
      <div v-if="data.type === 'text'" class="h-full flex flex-col">
        <div class="flex items-center gap-2 mb-1 border-b border-gray-700 pb-1 px-1">
            <span class="text-[10px] text-gray-500 uppercase">Size</span>
            <input
                type="number"
                :value="textFontSize"
                @input="(e: Event) => updateContent({ text: textContent, fontSize: Number((e.target as HTMLInputElement).value) })"
                class="w-12 bg-black/20 border border-gray-700 rounded px-1 text-xs text-gray-300 focus:outline-none"
                min="8"
                max="120"
            />
        </div>
        <textarea
            :value="textContent"
            @input="(e: Event) => updateContent({ text: (e.target as HTMLTextAreaElement).value, fontSize: textFontSize })"
            class="w-full flex-1 bg-transparent border-none resize-none focus:outline-none text-gray-300 min-h-[100px]"
            :style="{ fontSize: `${textFontSize}px`, lineHeight: '1.4' }"
            placeholder="Type here..."
        ></textarea>
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
        <div v-if="!data.content.reference" class="flex-1 flex items-center justify-center">
             <input
                :value="data.content.reference"
                @change="(e: Event) => updateContent({ reference: (e.target as HTMLInputElement).value })"
                class="w-full bg-black/20 border border-gray-700 rounded p-2 text-xs text-gray-300 focus:outline-none focus:border-ue-accent"
                placeholder="Paste Asset Reference here..."
            />
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
