<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../stores/project';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();

const page = computed(() => store.project?.pages[props.pageId]);

const allCategories = computed(() => {
  const p = store.project;
  if (!p) return [] as string[];
  const cats = new Set<string>();
  for (const page of Object.values(p.pages)) {
    if (page.category) cats.add(page.category);
  }
  return Array.from(cats).sort((a, b) => a.localeCompare(b));
});

const metadata = computed(() => {
  if (!page.value) return {};
  return page.value.metadata || {};
});

function updateMetadata(key: string, value: any) {
  if (!page.value) return;

  const currentMetadata = page.value.metadata || {};
  const newMetadata = { ...currentMetadata, [key]: value, updatedAt: new Date().toISOString() };

  store.updatePage(props.pageId, { metadata: newMetadata });
}

function addTag(e: Event) {
  const input = e.target as HTMLInputElement;
  const val = input.value.trim();
  if (val && page.value) {
    const currentTags = page.value.tags || [];
    if (!currentTags.includes(val)) {
      store.updatePage(props.pageId, { tags: [...currentTags, val] });
    }
    input.value = '';
  }
}

function removeTag(tag: string) {
  if (page.value) {
    const currentTags = page.value.tags || [];
    store.updatePage(props.pageId, { tags: currentTags.filter(t => t !== tag) });
  }
}

function updateCategory(e: Event) {
  const input = e.target as HTMLInputElement;
  const val = input.value.trim();
  if (!page.value) return;
  store.updatePage(props.pageId, { category: val || 'General' });
}

const statusColors = {
  draft: 'text-gray-400 border-gray-600',
  review: 'text-yellow-400 border-yellow-600',
  verified: 'text-green-400 border-green-600',
  deprecated: 'text-red-400 border-red-600'
};
</script>

<template>
  <div v-if="page" class="w-64 bg-ue-panel border-l border-black flex flex-col h-full text-xs">
    <div class="p-3 border-b border-black font-bold text-gray-300 uppercase tracking-wider">
      Properties
    </div>

    <div class="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

      <!-- Status -->
      <div class="flex flex-col gap-1">
        <label class="text-gray-500 font-bold">Status</label>
        <select
          :value="metadata.status || 'draft'"
          @change="(e) => updateMetadata('status', (e.target as HTMLSelectElement).value)"
          class="bg-black/20 border rounded px-2 py-1 focus:outline-none focus:border-ue-accent appearance-none cursor-pointer"
          :class="statusColors[metadata.status as keyof typeof statusColors] || statusColors.draft"
        >
          <option value="draft">Draft</option>
          <option value="review">In Review</option>
          <option value="verified">Verified</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>

      <!-- Engine Version -->
      <div class="flex flex-col gap-1">
        <label class="text-gray-500 font-bold">Engine Version</label>
        <input
          :value="metadata.engineVersion"
          @change="(e) => updateMetadata('engineVersion', (e.target as HTMLInputElement).value)"
          class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent"
          placeholder="e.g. 5.3"
        />
      </div>

      <!-- Owner -->
      <div class="flex flex-col gap-1">
        <label class="text-gray-500 font-bold">Owner</label>
        <input
          :value="metadata.owner"
          @change="(e) => updateMetadata('owner', (e.target as HTMLInputElement).value)"
          class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent"
          placeholder="Name..."
        />
      </div>

      <!-- Tags -->
      <div class="flex flex-col gap-2">
        <label class="text-gray-500 font-bold">Tags</label>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="tag in page.tags"
            :key="tag"
            class="bg-ue-accent/20 text-ue-accent border border-ue-accent/50 px-1.5 py-0.5 rounded flex items-center gap-1"
          >
            {{ tag }}
            <button @click="removeTag(tag)" class="hover:text-white">×</button>
          </span>
        </div>
        <input
          @keydown.enter="addTag"
          class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent"
          placeholder="+ Add Tag"
        />
      </div>

      <!-- Category -->
      <div class="flex flex-col gap-1">
        <label class="text-gray-500 font-bold">Category</label>
        <input
          :value="page.category"
          @change="updateCategory"
          class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent"
          placeholder="General"
          list="codex-categories"
        />
        <datalist id="codex-categories">
          <option v-for="c in allCategories" :key="c" :value="c" />
        </datalist>
      </div>

      <!-- Timestamps -->
      <div class="mt-4 pt-4 border-t border-gray-800 flex flex-col gap-2 text-[10px] text-gray-600">
        <div class="flex justify-between">
          <span>Created:</span>
          <span>{{ metadata.createdAt ? new Date(metadata.createdAt).toLocaleDateString() : '-' }}</span>
        </div>
        <div class="flex justify-between">
          <span>Updated:</span>
          <span>{{ metadata.updatedAt ? new Date(metadata.updatedAt).toLocaleDateString() : '-' }}</span>
        </div>
      </div>

    </div>
  </div>
</template>
