<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../stores/project';
import { unrealService } from '../services/unreal';

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

const isDecisionPage = computed(() => metadata.value.decisionType === 'adr');

const linkedAssetQuery = ref('');
const linkedPageQuery = ref('');

const assetSearchResults = computed(() => {
  const q = linkedAssetQuery.value.trim();
  if (!q) return [] as any[];
  return unrealService.search(q);
});

const pageSearchResults = computed(() => {
  const q = linkedPageQuery.value.trim().toLowerCase();
  if (!store.project) return [] as any[];
  const pages = Object.values(store.project.pages);
  if (!q) return pages.slice(0, 30);
  return pages
    .filter(p => String(p.title || '').toLowerCase().includes(q))
    .slice(0, 30);
});

function buildUnrealRefFromAsset(asset: any): string {
  return `${asset.asset_type || 'Asset'}'${asset.path}.${asset.name}'`;
}

function addDecisionLinkedAsset(asset: any) {
  if (!page.value) return;
  const ref = buildUnrealRefFromAsset(asset);
  const current = (page.value.metadata?.decisionLinkedAssets || []).slice();
  if (!current.includes(ref)) current.push(ref);
  updateMetadata('decisionLinkedAssets', current);
  linkedAssetQuery.value = '';
}

function removeDecisionLinkedAsset(refToRemove: string) {
  if (!page.value) return;
  const current = (page.value.metadata?.decisionLinkedAssets || []).filter(r => r !== refToRemove);
  updateMetadata('decisionLinkedAssets', current);
}

function addDecisionLinkedPage(pageId: string) {
  if (!page.value) return;
  const current = (page.value.metadata?.decisionLinkedPages || []).slice();
  if (!current.includes(pageId)) current.push(pageId);
  updateMetadata('decisionLinkedPages', current);
  linkedPageQuery.value = '';
}

function removeDecisionLinkedPage(pageId: string) {
  if (!page.value) return;
  const current = (page.value.metadata?.decisionLinkedPages || []).filter(pid => pid !== pageId);
  updateMetadata('decisionLinkedPages', current);
}

const relatedDecisions = computed(() => {
  if (!store.project || !page.value) return [] as any[];
  const currentAssetRef = page.value.metadata?.unrealAssetRef ? String(page.value.metadata.unrealAssetRef) : '';
  const currentPageId = page.value.id;
  const out: any[] = [];

  for (const p of Object.values(store.project.pages)) {
    const md = p.metadata;
    if (md?.decisionType !== 'adr') continue;
    const linkedAssets = Array.isArray(md.decisionLinkedAssets) ? md.decisionLinkedAssets : [];
    const linkedPages = Array.isArray(md.decisionLinkedPages) ? md.decisionLinkedPages : [];

    const hitAsset = currentAssetRef ? linkedAssets.includes(currentAssetRef) : false;
    const hitPage = linkedPages.includes(currentPageId);
    if (hitAsset || hitPage) out.push(p);
  }

  return out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
});

function openPage(pageId: string) {
  store.setActivePage(pageId);
}

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

      <!-- Decision Record (ADR) -->
      <div v-if="isDecisionPage" class="mt-2 pt-4 border-t border-gray-800 flex flex-col gap-3">
        <div class="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Decision Record</div>

        <div class="flex flex-col gap-1">
          <label class="text-gray-500 font-bold">Decision Status</label>
          <select
            :value="metadata.decisionStatus || 'proposed'"
            @change="(e) => updateMetadata('decisionStatus', (e.target as HTMLSelectElement).value)"
            class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent appearance-none cursor-pointer"
          >
            <option value="proposed">Proposed</option>
            <option value="accepted">Accepted</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-gray-500 font-bold">Linked Unreal Assets</label>
          <div class="flex flex-col gap-1">
            <div
              v-for="r in (metadata.decisionLinkedAssets || [])"
              :key="r"
              class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 flex items-center justify-between gap-2"
            >
              <span class="truncate" :title="r">{{ r }}</span>
              <button class="text-gray-500 hover:text-white" @click="removeDecisionLinkedAsset(String(r))">×</button>
            </div>
          </div>

          <div class="relative">
            <input
              v-model="linkedAssetQuery"
              class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent w-full"
              placeholder="Search /Game assets to link…"
            />
            <div
              v-if="assetSearchResults.length"
              class="absolute z-10 mt-1 w-full bg-ue-panel border border-black rounded max-h-48 overflow-auto custom-scrollbar"
            >
              <button
                v-for="a in assetSearchResults"
                :key="a.file_path"
                @click="addDecisionLinkedAsset(a)"
                class="w-full text-left px-2 py-2 hover:bg-white/5"
              >
                <div class="text-gray-200 font-bold truncate">{{ a.name }}</div>
                <div class="text-[10px] text-gray-500 truncate">{{ a.asset_type }} • {{ a.path }}</div>
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-gray-500 font-bold">Linked Pages</label>
          <div class="flex flex-col gap-1">
            <div
              v-for="pid in (metadata.decisionLinkedPages || [])"
              :key="pid"
              class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 flex items-center justify-between gap-2"
            >
              <span class="truncate" :title="pid">{{ store.project?.pages[String(pid)]?.title || pid }}</span>
              <button class="text-gray-500 hover:text-white" @click="removeDecisionLinkedPage(String(pid))">×</button>
            </div>
          </div>

          <div class="relative">
            <input
              v-model="linkedPageQuery"
              class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-ue-accent w-full"
              placeholder="Search pages to link…"
            />
            <div
              v-if="linkedPageQuery.trim() && pageSearchResults.length"
              class="absolute z-10 mt-1 w-full bg-ue-panel border border-black rounded max-h-48 overflow-auto custom-scrollbar"
            >
              <button
                v-for="p in pageSearchResults"
                :key="p.id"
                @click="addDecisionLinkedPage(p.id)"
                class="w-full text-left px-2 py-2 hover:bg-white/5"
              >
                <div class="text-gray-200 font-bold truncate">{{ p.title }}</div>
                <div class="text-[10px] text-gray-500 truncate">{{ p.category }}</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Related Decisions -->
      <div v-if="!isDecisionPage" class="mt-2 pt-4 border-t border-gray-800 flex flex-col gap-2">
        <div class="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Related Decisions</div>
        <div v-if="relatedDecisions.length === 0" class="text-[10px] text-gray-600 italic">None linked.</div>
        <button
          v-for="d in relatedDecisions"
          :key="d.id"
          @click="openPage(d.id)"
          class="bg-black/20 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 hover:border-ue-accent text-left"
        >
          {{ d.title }}
        </button>
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
