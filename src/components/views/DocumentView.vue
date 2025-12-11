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

// Autocomplete State
const showAutocomplete = ref(false);
const autocompleteQuery = ref('');
const autocompleteIndex = ref(0);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const autocompletePos = ref({ top: 0, left: 0 });

const filteredPages = computed(() => {
  if (!store.project) return [];
  const query = autocompleteQuery.value.toLowerCase();
  return Object.values(store.project.pages)
    .filter(p => p.title.toLowerCase().includes(query) && p.id !== page.value?.id)
    .slice(0, 5);
});

function handleInput(e: Event) {
  updateMarkdown(e);
  
  const target = e.target as HTMLTextAreaElement;
  const cursor = target.selectionStart;
  const text = target.value;
  
  // Check for [[ trigger
  const lastTwoChars = text.slice(cursor - 2, cursor);
  if (lastTwoChars === '[[') {
    showAutocomplete.value = true;
    autocompleteQuery.value = '';
    updateAutocompletePos(target);
    return;
  }

  if (showAutocomplete.value) {
    // Find the [[ before cursor
    const lastOpen = text.lastIndexOf('[[', cursor);
    if (lastOpen !== -1) {
      autocompleteQuery.value = text.slice(lastOpen + 2, cursor);
    } else {
      showAutocomplete.value = false;
    }
  }
}

function updateAutocompletePos(textarea: HTMLTextAreaElement) {
  // Simple approximation or use a library like get-caret-coordinates
  // For now, just show near cursor or fixed position
  // A real implementation would calculate pixel coordinates
  const { offsetLeft, offsetTop } = textarea;
  autocompletePos.value = { top: offsetTop + 20, left: offsetLeft + 20 }; 
}

function selectAutocomplete(pageTitle: string) {
  if (!textareaRef.value || !page.value) return;
  
  const textarea = textareaRef.value;
  const cursor = textarea.selectionStart;
  const text = textarea.value;
  const lastOpen = text.lastIndexOf('[[', cursor);
  
  if (lastOpen !== -1) {
    const newText = text.slice(0, lastOpen) + `[[${pageTitle}]]` + text.slice(cursor);
    store.updatePage(page.value.id, { markdownBody: newText });
    showAutocomplete.value = false;
    
    setTimeout(() => {
      textarea.focus();
      const newCursor = lastOpen + pageTitle.length + 4;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!showAutocomplete.value) return;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    autocompleteIndex.value = (autocompleteIndex.value + 1) % filteredPages.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    autocompleteIndex.value = (autocompleteIndex.value - 1 + filteredPages.value.length) % filteredPages.value.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredPages.value[autocompleteIndex.value]) {
      selectAutocomplete(filteredPages.value[autocompleteIndex.value].title);
    }
  } else if (e.key === 'Escape') {
    showAutocomplete.value = false;
  }
}

function handleDrop(e: DragEvent) {
  const pageId = e.dataTransfer?.getData('application/x-codex-page');
  if (pageId && store.project && page.value) {
    // We handle the insertion manually to ensure [[Link]] format
    e.preventDefault();
    
    const targetPage = store.project.pages[pageId];
    if (targetPage) {
      const linkText = `[[${targetPage.title}]]`;
      const textarea = e.target as HTMLTextAreaElement;
      
      // Browser updates selectionStart during dragover (if we don't preventDefault it)
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      
      const newText = text.substring(0, start) + linkText + text.substring(end);
      
      store.updatePage(page.value.id, { markdownBody: newText });
      
      // Restore focus and place cursor after link
      setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + linkText.length, start + linkText.length);
      }, 0);
    }
  }
}

// Context Menu
const editorContextMenu = ref({
  visible: false,
  x: 0,
  y: 0
});

function handleEditorContextMenu(e: MouseEvent) {
  editorContextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY
  };
  
  const closeMenu = () => {
    editorContextMenu.value.visible = false;
    window.removeEventListener('click', closeMenu);
  };
  // Delay to prevent immediate close
  setTimeout(() => window.addEventListener('click', closeMenu), 0);
}

function triggerInsertLink() {
  if (!textareaRef.value || !page.value) return;
  
  const textarea = textareaRef.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  
  // Insert [[
  const newText = text.substring(0, start) + '[[' + text.substring(end);
  store.updatePage(page.value.id, { markdownBody: newText });
  
  // Move cursor and trigger autocomplete
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + 2, start + 2);
    
    showAutocomplete.value = true;
    autocompleteQuery.value = '';
    updateAutocompletePos(textarea);
  }, 0);
}
</script>

<template>
  <div class="flex h-full relative font-mono" v-if="page">
    <!-- Context Menu -->
    <div v-if="editorContextMenu.visible" 
         class="fixed z-50 bg-cyber-panel border border-cyber-green/30 shadow-[0_0_15px_rgba(0,0,0,0.5)] rounded py-1 min-w-[150px]"
         :style="{ top: editorContextMenu.y + 'px', left: editorContextMenu.x + 'px' }">
      <div @click="triggerInsertLink" class="px-4 py-1 text-sm text-cyber-text hover:bg-cyber-green/20 hover:text-cyber-green cursor-pointer flex items-center gap-2">
        <span>🔗</span> INSERT_LINK
      </div>
    </div>

    <!-- Autocomplete Popup -->
    <div v-if="showAutocomplete && filteredPages.length > 0" 
         class="absolute z-50 bg-cyber-panel border border-cyber-green/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] rounded w-64 overflow-hidden"
         :style="{ top: '40px', left: '20px' }"> <!-- Fixed position for stability -->
      <div v-for="(p, i) in filteredPages" 
           :key="p.id"
           class="px-3 py-2 text-sm cursor-pointer hover:bg-cyber-green/10 border-l-2 border-transparent"
           :class="{ 'bg-cyber-green/5 text-cyber-green border-cyber-green': i === autocompleteIndex, 'text-cyber-text': i !== autocompleteIndex }"
           @click="selectAutocomplete(p.title)">
        {{ p.title }}
      </div>
    </div>

    <div class="h-full border-r border-cyber-green/20 flex flex-col transition-all duration-300" :class="showPreview ? 'w-1/2' : 'w-full'">
      <div class="bg-cyber-panel px-4 py-2 flex justify-between items-center border-b border-cyber-green/20">
        <span class="text-xs text-cyber-text/70 uppercase tracking-wider font-bold font-mono flex items-center gap-2">
          <span class="text-cyber-purple">&lt;&gt;</span> SOURCE_CODE
        </span>
        <button
          @click="showPreview = !showPreview"
          class="text-xs text-cyber-purple hover:text-cyber-green font-mono transition-colors"
        >
          {{ showPreview ? '[ HIDE_PREVIEW ]' : '[ SHOW_PREVIEW ]' }}
        </button>
      </div>
      <textarea
        ref="textareaRef"
        class="flex-1 bg-cyber-dark/80 text-cyber-text p-4 resize-none focus:outline-none font-mono text-sm custom-scrollbar selection:bg-cyber-green/30 selection:text-cyber-green"
        :value="page.markdownBody"
        @input="handleInput"
        @keydown="handleKeydown"
        @drop="handleDrop"
        @contextmenu.prevent="handleEditorContextMenu"
      ></textarea>
    </div>
    <div v-if="showPreview" class="w-1/2 h-full flex flex-col bg-cyber-dark/80 border-l border-cyber-green/20">
      <div class="bg-cyber-panel px-4 py-2 flex items-center justify-between border-b border-cyber-green/20">
        <span class="text-xs text-cyber-green uppercase tracking-wider font-bold font-mono flex items-center gap-2">
          <span class="text-cyber-green">></span> PREVIEW_MODE
        </span>
        <div class="flex gap-2">
           <span class="w-2 h-2 rounded-full bg-cyber-green shadow-[0_0_5px_rgba(0,255,157,0.5)]"></span>
           <span class="w-2 h-2 rounded-full bg-cyber-purple shadow-[0_0_5px_rgba(124,58,237,0.5)]"></span>
           <span class="w-2 h-2 rounded-full bg-cyber-orange shadow-[0_0_5px_rgba(245,158,11,0.5)]"></span>
        </div>
      </div>
      <div class="flex-1 p-8 prose prose-invert max-w-none overflow-auto custom-scrollbar" @click="handlePreviewClick">
        <template v-for="(segment, index) in parsedContent" :key="index">
          <div v-if="segment.type === 'text'" v-html="renderMarkdown(segment.content)"></div>
          <div v-else-if="segment.type === 'blueprint'" class="my-6 border border-cyber-green/30 rounded overflow-hidden bg-cyber-card not-prose shadow-[0_0_10px_rgba(0,0,0,0.3)]">
            <div class="bg-cyber-panel px-3 py-1 text-xs text-cyber-text/70 border-b border-cyber-green/20 flex justify-between items-center">
              <span class="font-mono text-cyber-blue">BLUEPRINT_VISUALIZATION</span>
              <button class="hover:text-cyber-green transition-colors" title="Copy Blueprint String">
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
  color: #7C3AED; /* Cyber Purple */
  text-decoration: none;
  border-bottom: 1px solid rgba(124, 58, 237, 0.3);
  transition: all 0.2s;
}
.wiki-link:hover {
  background: rgba(124, 58, 237, 0.1);
  border-bottom-color: #7C3AED;
  color: #00FF9D; /* Hover Green */
  text-shadow: 0 0 5px rgba(0, 255, 157, 0.5);
}
.wiki-link.missing {
  color: #94A3B8; /* Gray */
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
