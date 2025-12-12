<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import { storage } from '../../services/storage';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import BlueprintVisualizer from '../BlueprintVisualizer.vue';
import AIHelperView from '../AIHelperView.vue';
import { 
  Bold, Italic, Heading1, Heading2, Heading3, Link, Network, 
  Eye, EyeOff, Copy 
} from 'lucide-vue-next';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();
const showPreview = ref(true);

const page = computed(() => store.project?.pages[props.pageId]);

// Asset Resolution for Preview
const resolvedAssets = ref<Record<string, string>>({});

async function resolveAsset(assetId: string) {
    if (resolvedAssets.value[assetId]) return resolvedAssets.value[assetId];
    
    try {
        const blob = await storage.loadAsset(assetId);
        if (blob) {
            const url = URL.createObjectURL(blob);
            resolvedAssets.value[assetId] = url;
            return url;
        }
    } catch (e) {
        console.error('Failed to resolve asset for preview', assetId);
    }
    return '';
}

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

  renderer.image = ({ href, title, text }) => {
      // Check if href is a UUID (simple check: no http/https/blob)
      if (href && !href.startsWith('http') && !href.startsWith('blob:') && !href.startsWith('data:')) {
          // It's likely an asset ID.
          // We return a placeholder that we can hydrate or just use the resolved URL if available.
          // Since render is synchronous, we can't await.
          // We'll use a data attribute and let a watcher/observer handle it, 
          // OR check our reactive cache.
          
          const resolved = resolvedAssets.value[href];
          if (!resolved) {
              // Trigger load
              resolveAsset(href);
              return `<div class="loading-asset" data-asset-id="${href}">Loading ${text}...</div>`;
          }
          
          // Check if it's a video (we need metadata or guess from extension if available in ID, but ID is just UUID usually)
          // Actually, we stored the extension in the filename in storage, but here we just have ID.
          // We can try to guess from the resolved blob type if we had it, but we just have URL.
          // Let's assume image for standard markdown image syntax, unless we use a custom syntax for video.
          // OR, we can check the blob type in resolveAsset and store it.
          
          return `<img src="${resolved}" alt="${text}" title="${title || ''}" class="max-w-full rounded border border-cyber-green/20" />`;
      }
      return `<img src="${href}" alt="${text}" title="${title || ''}" class="max-w-full rounded border border-cyber-green/20" />`;
  };

  renderer.html = ((html: any) => {
      // Intercept video tags to resolve src if it's an asset ID
      const htmlStr = typeof html === 'string' ? html : html?.text || '';
      return htmlStr.replace(/<video src="([^"]+)"/g, (match: string, src: string) => {
          if (src && !src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
              const resolved = resolvedAssets.value[src];
              if (!resolved) {
                  resolveAsset(src);
                  return `<video src="" data-asset-id="${src}"`;
              }
              return `<video src="${resolved}"`;
          }
          return match;
      });
  }) as any;

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
    const selectedPage = filteredPages.value[autocompleteIndex.value];
    if (selectedPage) {
      selectAutocomplete(selectedPage.title);
    }
  } else if (e.key === 'Escape') {
    showAutocomplete.value = false;
  }
}

function insertText(prefix: string, suffix: string = '') {
  if (!textareaRef.value || !page.value) return;

  const textarea = textareaRef.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
  store.updatePage(page.value.id, { markdownBody: newText });

  setTimeout(() => {
    textarea.focus();
    // If text was selected, keep it selected inside the tags
    if (start !== end) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    } else {
        // If no text selected, place cursor between tags
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }
  }, 0);
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  const textarea = e.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;

  // 1. Handle Internal Page Links
  const pageId = e.dataTransfer?.getData('application/x-codex-page');
  if (pageId && store.project) {
    const targetPage = store.project.pages[pageId];
    if (targetPage) {
      const linkText = `[[${targetPage.title}]]`;
      const newText = text.substring(0, start) + linkText + text.substring(end);
      store.updatePage(page.value!.id, { markdownBody: newText });
      
      setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + linkText.length, start + linkText.length);
      }, 0);
      return;
    }
  }

  // 2. Handle Internal Assets (from Sidebar)
  const assetId = e.dataTransfer?.getData('application/x-codex-asset');
  if (assetId) {
      const linkText = `![Asset](${assetId})`;
      const newText = text.substring(0, start) + linkText + text.substring(end);
      store.updatePage(page.value!.id, { markdownBody: newText });
      return;
  }

  // 3. Handle External Files
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
      handleDroppedFiles(files, start, end, text);
  }
}

async function handleDroppedFiles(files: FileList, start: number, end: number, currentText: string) {
    let insertion = '';
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        try {
            const asset = await storage.saveAsset(file);
            if (file.type.startsWith('image/')) {
                insertion += `![${file.name}](${asset.id})\n`;
            } else if (file.type.startsWith('video/')) {
                // Use HTML for video as markdown doesn't support it natively
                // We need a way to resolve this ID in the renderer too.
                // For now, let's use a custom syntax or just HTML with a special class
                insertion += `<video src="${asset.id}" controls class="w-full max-h-96"></video>\n`;
            } else {
                insertion += `[${file.name}](${asset.id})\n`;
            }
        } catch (e) {
            console.error('Failed to upload file', file.name, e);
        }
    }

    if (insertion && page.value) {
        const newText = currentText.substring(0, start) + insertion + currentText.substring(end);
        store.updatePage(page.value.id, { markdownBody: newText });
    }
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.type.indexOf('image') !== -1 || item.type.indexOf('video') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        try {
            const asset = await storage.saveAsset(file);
            if (page.value) {
                const textarea = e.target as HTMLTextAreaElement;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                
                let insertion = '';
                if (file.type.startsWith('image/')) {
                    insertion = `![${file.name}](${asset.id})`;
                } else if (file.type.startsWith('video/')) {
                    insertion = `<video src="${asset.id}" controls class="w-full max-h-96"></video>`;
                }
                
                const newText = text.substring(0, start) + insertion + text.substring(end);
                store.updatePage(page.value.id, { markdownBody: newText });
            }
        } catch (err) {
            console.error('Failed to paste media', err);
        }
      }
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
        <Link class="w-3 h-3" /> INSERT_LINK
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
      <!-- Toolbar -->
      <div class="bg-cyber-panel px-2 py-1 flex items-center gap-1 border-b border-cyber-green/20 overflow-x-auto custom-scrollbar">
        <button @click="insertText('**', '**')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Bold">
            <Bold class="w-3.5 h-3.5" />
        </button>
        <button @click="insertText('*', '*')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Italic">
            <Italic class="w-3.5 h-3.5" />
        </button>
        <div class="w-[1px] h-4 bg-cyber-green/20 mx-1"></div>
        <button @click="insertText('# ')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Heading 1">
            <Heading1 class="w-3.5 h-3.5" />
        </button>
        <button @click="insertText('## ')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Heading 2">
            <Heading2 class="w-3.5 h-3.5" />
        </button>
        <button @click="insertText('### ')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Heading 3">
            <Heading3 class="w-3.5 h-3.5" />
        </button>
        <div class="w-[1px] h-4 bg-cyber-green/20 mx-1"></div>
        <button @click="insertText('[[', ']]')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Link Page">
            <Link class="w-3.5 h-3.5" />
        </button>
        <button @click="insertText('```blueprint\n', '\n```')" class="p-1.5 rounded hover:bg-cyber-green/10 text-cyber-text hover:text-cyber-green transition-colors" title="Code Block">
            <Network class="w-3.5 h-3.5" />
        </button>
        
        <div class="flex-1"></div>
        
        <!-- AI Helper Button -->
        <AIHelperView 
          v-if="page"
          :content="page.markdownBody"
          :context="page.title"
          @apply="(text: string) => page && store.updatePage(page.id, { markdownBody: text })"
        />
        
        <button
          @click="showPreview = !showPreview"
          class="text-xs text-cyber-purple hover:text-cyber-green font-mono transition-colors px-2 flex items-center gap-1"
        >
          <component :is="showPreview ? EyeOff : Eye" class="w-3 h-3" />
          {{ showPreview ? '[ HIDE ]' : '[ PREVIEW ]' }}
        </button>
      </div>

      <textarea
        ref="textareaRef"
        class="flex-1 bg-cyber-dark/80 text-cyber-text p-4 resize-none focus:outline-none font-mono text-sm custom-scrollbar selection:bg-cyber-green/30 selection:text-cyber-green"
        :value="page.markdownBody"
        @input="handleInput"
        @keydown="handleKeydown"
        @drop="handleDrop"
        @dragover.prevent
        @paste="handlePaste"
        @contextmenu.prevent="handleEditorContextMenu"
        placeholder="Start typing... Use [[ to link pages, drag & drop images/videos."
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
                <Copy class="w-3.5 h-3.5" />
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
