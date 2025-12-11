<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import BlueprintVisualizer from '../BlueprintVisualizer.vue';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();
const showPreview = ref(true);

const page = computed(() => store.project?.pages[props.pageId]);

interface ContentSegment {
  type: 'text' | 'blueprint';
  content: string;
}

const parsedContent = computed<ContentSegment[]>(() => {
  if (!page.value) return [];

  let md = page.value.markdownBody;
  const segments: ContentSegment[] = [];
  const regex = /```blueprint\s*([\s\S]*?)\s*```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(md)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: md.slice(lastIndex, match.index) });
    }
    // Blueprint match
    const bpContent = match[1] || '';
    segments.push({ type: 'blueprint', content: bpContent.trim() });
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < md.length) {
    segments.push({ type: 'text', content: md.slice(lastIndex) });
  }

  return segments;
});

function renderMarkdown(text: string) {
  // Custom renderer for [[WikiLinks]] and Syntax Highlighting
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }) => {
    const validLang = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(text, { language: validLang }).value;
    return `<pre><code class="hljs language-${validLang}">${highlighted}</code></pre>`;
  };

  // Regex for [[Page Name]] or [[Page Name|Label]]
  const processed = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => {
    const pageName = p1.trim();
    const label = p2 ? p2.trim() : pageName;
    // Find the page ID if it exists
    const targetPage = Object.values(store.project?.pages || {}).find(p => p.title.toLowerCase() === pageName.toLowerCase());
    const targetId = targetPage ? targetPage.id : '';
    const isMissing = !targetPage;

    return `<a href="#" class="wiki-link ${isMissing ? 'missing' : ''}" data-page-id="${targetId}" data-page-name="${pageName}">${label}</a>`;
  });

  return marked(processed, { renderer });
}

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

function handleDrop(e: DragEvent) {
  const pageId = e.dataTransfer?.getData('application/x-codex-page');
  if (pageId && store.project && page.value) {
    const targetPage = store.project.pages[pageId];
    if (targetPage) {
      const linkText = `[[${targetPage.title}]]`;

      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      const newText = text.substring(0, start) + linkText + text.substring(end);

      store.updatePage(page.value.id, { markdownBody: newText });

      // Restore cursor position (approximate)
      setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + linkText.length, start + linkText.length);
      }, 0);
    }
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
        @drop.prevent="handleDrop"
        @dragover.prevent
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
      <div class="flex-1 p-8 prose prose-invert max-w-none overflow-auto custom-scrollbar" @click="handlePreviewClick">
        <template v-for="(segment, index) in parsedContent" :key="index">
          <div v-if="segment.type === 'text'" v-html="renderMarkdown(segment.content)"></div>
          <div v-else-if="segment.type === 'blueprint'" class="my-6 border border-gray-700 rounded-lg overflow-hidden bg-gray-900 not-prose">
            <div class="bg-gray-800 px-3 py-1 text-xs text-gray-400 border-b border-gray-700 flex justify-between items-center">
              <span>Blueprint Visualization</span>
              <button class="hover:text-white" title="Copy Blueprint String">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <div class="h-96 relative">
              <BlueprintVisualizer :blueprint="segment.content" />
            </div>
          </div>
        </template>
      </div>
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
