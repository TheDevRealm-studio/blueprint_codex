<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import { marked } from 'marked';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();
const showPreview = ref(true);

const page = computed(() => store.project?.pages.find(p => p.id === props.pageId));

const compiledMarkdown = computed(() => {
  if (!page.value) return '';
  
  // Custom renderer for [[WikiLinks]]
  const renderer = new marked.Renderer();
  
  // We need to preprocess the markdown to handle [[WikiLinks]] before marked sees it,
  // or use a custom extension. A simple regex replacement is often easier for basic WikiLinks.
  // Let's replace [[Page Name]] with a special link format that we can style and handle.
  
  let md = page.value.markdownBody;
  
  // Regex for [[Page Name]] or [[Page Name|Label]]
  md = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => {
    const pageName = p1.trim();
    const label = p2 ? p2.trim() : pageName;
    // Find the page ID if it exists
    const targetPage = store.project?.pages.find(p => p.title.toLowerCase() === pageName.toLowerCase());
    const targetId = targetPage ? targetPage.id : '';
    const isMissing = !targetPage;
    
    return `<a href="#" class="wiki-link ${isMissing ? 'missing' : ''}" data-page-id="${targetId}" data-page-name="${pageName}">${label}</a>`;
  });

  return marked(md, { renderer });
});

function handlePreviewClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains('wiki-link')) {
    e.preventDefault();
    const pageId = target.getAttribute('data-page-id');
    const pageName = target.getAttribute('data-page-name');
    
    if (pageId) {
      store.setActivePage(pageId);
    } else if (pageName) {
      if (confirm(`Page "${pageName}" does not exist. Create it?`)) {
        store.addPage(pageName);
        // The store will set the new page as active, but we might need to find it to get the ID
        // store.addPage sets activePageId automatically in our implementation
      }
    }
  }
}

function updateMarkdown(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  if (page.value) {
    store.updatePage(page.value.id, { markdownBody: target.value });
  }
}
</script>

<template>
  <div class="flex h-full" v-if="page">
    <div class="h-full border-r border-gray-800 flex flex-col transition-all duration-300" :class="showPreview ? 'w-1/2' : 'w-full'">
      <div class="bg-brand-surface px-4 py-2 flex justify-between items-center border-b border-gray-800">
        <span class="text-xs text-brand-text uppercase tracking-wider font-bold font-mono">Source Code</span>
        <button
          @click="showPreview = !showPreview"
          class="text-xs text-brand-purple hover:text-white font-mono"
        >
          {{ showPreview ? '[ HIDE PREVIEW ]' : '[ SHOW PREVIEW ]' }}
        </button>
      </div>
      <textarea
        class="flex-1 bg-brand-dark text-gray-300 p-4 resize-none focus:outline-none font-mono text-sm custom-scrollbar"
        :value="page.markdownBody"
        @input="updateMarkdown"
      ></textarea>
    </div>
    <div v-if="showPreview" class="w-1/2 h-full flex flex-col bg-brand-dark border-l border-gray-800">
      <div class="bg-brand-surface px-4 py-2 flex items-center justify-between border-b border-gray-800">
        <span class="text-xs text-brand-green uppercase tracking-wider font-bold font-mono">Preview Mode</span>
        <div class="flex gap-2">
           <span class="w-2 h-2 rounded-full bg-brand-green"></span>
           <span class="w-2 h-2 rounded-full bg-brand-purple"></span>
           <span class="w-2 h-2 rounded-full bg-brand-orange"></span>
        </div>
      </div>
      <div 
        class="flex-1 p-8 prose prose-invert max-w-none overflow-auto custom-scrollbar" 
        v-html="compiledMarkdown"
        @click="handlePreviewClick"
      ></div>
    </div>
  </div>
</template>

<style>
.wiki-link {
  color: #8B5CF6; /* Brand Purple */
  text-decoration: none;
  border-bottom: 1px solid rgba(139, 92, 246, 0.3);
  transition: all 0.2s;
}
.wiki-link:hover {
  background: rgba(139, 92, 246, 0.1);
  border-bottom-color: #8B5CF6;
}
.wiki-link.missing {
  color: #64748B; /* Gray */
  border-bottom-style: dashed;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #0A0F1C;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #1F2937;
  border-radius: 4px;
  border: 1px solid #374151;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #374151;
}
</style>
