<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from '../../stores/project';
import { storage } from '../../services/storage';
import { aiService } from '../../services/ai';
import type { Block, LinkBlock, Edge as BlockEdge, YoutubeBlock, WebsiteBlock, MediaBlock } from '../../types';
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import CustomNode from '../canvas/nodes/CustomNode.vue';
import { Type, ListOrdered, Image, Network, Code, Package, Trash2, Unplug, FileText, Sparkles } from 'lucide-vue-next';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{ pageId: string }>();
const store = useProjectStore();

const page = computed(() => store.project?.pages[props.pageId]);

// --- Vue Flow State ---

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

const { onConnect, onNodeDragStop, screenToFlowCoordinate, onNodesChange, onEdgesChange, onNodeContextMenu } = useVueFlow();

// Context Menu
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  nodeId: null as string | null
});

onNodeContextMenu((e) => {
  e.event.preventDefault();
  const event = e.event as MouseEvent;
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    nodeId: e.node.id
  };
});

function deleteNode() {
  if (contextMenu.value.nodeId && page.value) {
    const currentBlocks = [...page.value.blocks];
    const index = currentBlocks.findIndex(b => b.id === contextMenu.value.nodeId);
    if (index !== -1) {
      currentBlocks.splice(index, 1);
      store.updatePage(page.value.id, { blocks: currentBlocks });
    }
  }
  closeContextMenu();
}

function disconnectNode() {
  if (contextMenu.value.nodeId && page.value) {
    const currentEdges = page.value.edges || [];
    const newEdges = currentEdges.filter(e => e.source !== contextMenu.value.nodeId && e.target !== contextMenu.value.nodeId);
    store.updatePage(page.value.id, { edges: newEdges });
  }
  closeContextMenu();
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

// --- History / Undo / Redo ---
const history = ref<{ blocks: Block[], edges: BlockEdge[] }[]>([]);
const historyIndex = ref(-1);
const isUndoing = ref(false);

function saveHistory() {
  if (!page.value) return;

  const state = {
    blocks: JSON.parse(JSON.stringify(page.value.blocks || [])),
    edges: JSON.parse(JSON.stringify(page.value.edges || []))
  };

  // Check if identical to current top to avoid duplicates
  if (historyIndex.value >= 0) {
      const current = history.value[historyIndex.value];
      if (JSON.stringify(current) === JSON.stringify(state)) return;
  }

  // Slice if we are in the middle
  if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1);
  }

  history.value.push(state);
  historyIndex.value++;

  // Limit history size
  if (history.value.length > 50) {
      history.value.shift();
      historyIndex.value--;
  }
}

function undo() {
    if (historyIndex.value > 0) {
        historyIndex.value--;
        const state = history.value[historyIndex.value];
        if (state) {
            isUndoing.value = true;
            store.updatePage(page.value!.id, {
                blocks: JSON.parse(JSON.stringify(state.blocks)),
                edges: JSON.parse(JSON.stringify(state.edges))
            });
        }
    }
}

function redo() {
    if (historyIndex.value < history.value.length - 1) {
        historyIndex.value++;
        const state = history.value[historyIndex.value];
        if (state) {
            isUndoing.value = true;
            store.updatePage(page.value!.id, {
                blocks: JSON.parse(JSON.stringify(state.blocks)),
                edges: JSON.parse(JSON.stringify(state.edges))
            });
        }
    }
}

function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Prevent deletion if user is typing in an input
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
            return;
        }

        const selectedNodes = nodes.value.filter((n: any) => n.selected);
        if (selectedNodes.length > 0) {
            e.preventDefault();
            deleteNodes(selectedNodes.map((n: any) => n.id));
        }
    }
}

function deleteNodes(nodeIds: string[]) {
    if (!page.value || nodeIds.length === 0) return;

    const ids = new Set(nodeIds);
    const currentBlocks = [...page.value.blocks];
    const newBlocks = currentBlocks.filter(b => !ids.has(b.id));

    if (newBlocks.length !== currentBlocks.length) {
        store.updatePage(page.value.id, { blocks: newBlocks });
    }
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu);
  window.addEventListener('keydown', handleKeyDown);
  // Initial history state
  if (page.value) {
      saveHistory();
  }
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('keydown', handleKeyDown);
});

// Sync from Store to Local State
watch(() => page.value, (newPage: any) => {
  if (!newPage) return;

  // History Tracking
  if (isUndoing.value) {
      isUndoing.value = false;
  } else {
      saveHistory();
  }

  // --- Optimized Node Sync ---
  const newBlocks = newPage.blocks;
  const newBlockIds = new Set(newBlocks.map((b: Block) => b.id));

  // 1. Remove deleted nodes
  for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i];
      if (node && !newBlockIds.has(node.id)) {
          nodes.value.splice(i, 1);
      }
  }

  // 2. Update or Add nodes
  for (const block of newBlocks) {
      const existingNode = nodes.value.find(n => n.id === block.id);

      if (existingNode) {
          const desiredZ = block.type === 'region' ? 0 : 10;
          if ((existingNode as any).zIndex !== desiredZ) {
            (existingNode as any).zIndex = desiredZ;
          }

          // Update position if changed
          if (existingNode.position.x !== block.x || existingNode.position.y !== block.y) {
              existingNode.position = { x: block.x, y: block.y };
          }

          // Update data only if necessary to avoid reactivity overhead
          // We check for reference equality on content since store updates usually preserve references for unchanged blocks
          if (existingNode.data.content !== block.content ||
              existingNode.data.width !== block.width ||
              existingNode.data.height !== block.height ||
              existingNode.data.label !== getBlockLabel(block)) {

              existingNode.data = {
                  type: block.type,
                  content: block.content,
                  width: block.width,
                  height: block.height,
                  label: getBlockLabel(block),
                  pageId: props.pageId,
                  pins: block.pins
              };
          }
      } else {
          // Add new node
          nodes.value.push({
              id: block.id,
              type: 'custom',
              position: { x: block.x, y: block.y },
            zIndex: block.type === 'region' ? 0 : 10,
              data: {
                  type: block.type,
                  content: block.content,
                  width: block.width,
                  height: block.height,
                  label: getBlockLabel(block),
                  pageId: props.pageId,
                  pins: block.pins
              },
          });
      }
  }

  // --- Optimized Edge Sync ---
  const newEdges = newPage.edges || [];
  const newEdgeIds = new Set(newEdges.map((e: BlockEdge) => e.id));

  // 1. Remove deleted edges
  for (let i = edges.value.length - 1; i >= 0; i--) {
      const edge = edges.value[i];
      if (edge && !newEdgeIds.has(edge.id)) {
          edges.value.splice(i, 1);
      }
  }

  // 2. Update or Add edges
  for (const edge of newEdges) {
      const existingEdge = edges.value.find(e => e.id === edge.id);
      if (!existingEdge) {
          edges.value.push({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              animated: true,
              style: { stroke: '#555' },
          });
      }
      // Edges rarely change properties other than existence, so we skip deep update for now
  }
}, { immediate: true, deep: true });

function getBlockLabel(block: Block) {
  if (block.type === 'region') return block.content?.title || 'Region';
    if (block.type === 'media') return block.content.label || 'Media';
    if (block.type === 'steps') return 'Steps';
    if (block.type === 'blueprint') return 'Blueprint';
    if (block.type === 'asset') return 'Asset';
    if (block.type === 'youtube') return 'YouTube';
    if (block.type === 'website') return 'Website';
    return 'Note';
}

// --- Event Handlers ---

onConnect((params: Connection) => {
  const newEdge: BlockEdge = {
    id: crypto.randomUUID(),
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle
  };

  // Update Store
  if (page.value) {
    const currentEdges = page.value.edges || [];
    store.updatePage(page.value.id, { edges: [...currentEdges, newEdge] });
  }
});

onNodesChange((changes) => {
  if (!page.value) return;

  let blocksChanged = false;
  let currentBlocks = [...page.value.blocks];

  changes.forEach((change) => {
    if (change.type === 'remove') {
      const index = currentBlocks.findIndex(b => b.id === change.id);
      if (index !== -1) {
        currentBlocks.splice(index, 1);
        blocksChanged = true;
      }
    }
  });

  if (blocksChanged) {
    store.updatePage(page.value.id, { blocks: currentBlocks });
  }
});

onEdgesChange((changes) => {
  if (!page.value) return;

  let edgesChanged = false;
  let currentEdges = [...(page.value.edges || [])];

  changes.forEach((change) => {
    if (change.type === 'remove') {
      const index = currentEdges.findIndex(e => e.id === change.id);
      if (index !== -1) {
        currentEdges.splice(index, 1);
        edgesChanged = true;
      }
    }
  });

  if (edgesChanged) {
    store.updatePage(page.value.id, { edges: currentEdges });
  }
});

onNodeDragStop((e) => {
  // Update block positions in store
  if (!page.value) return;

  const updatedBlocks = page.value.blocks.map((block: Block) => {
    // Find the matching node in the event nodes or local state
    const matchingNode = e.nodes.find((n: Node) => n.id === block.id) || nodes.value.find((n: Node) => n.id === block.id);
    if (matchingNode) {
      return { ...block, x: matchingNode.position.x, y: matchingNode.position.y };
    }
    return block;
  });

  store.updatePage(page.value.id, { blocks: updatedBlocks });
});

const isDragging = ref(false);

function onDragEnter() {
    isDragging.value = true;
}

function onDragLeave(e: DragEvent) {
    // Only set to false if we're leaving the main container, not entering a child
    if (e.currentTarget === e.target) {
        isDragging.value = false;
    }
}

async function onDrop(event: DragEvent) {
  isDragging.value = false;
  console.log('Drop event detected', event);

  const unrealAssetRef = event.dataTransfer?.getData('application/x-codex-asset-ref') || '';
  const plainText = event.dataTransfer?.getData('text/plain') || '';

  // 1. Handle Internal Page Links
  const pageId = event.dataTransfer?.getData('application/x-codex-page');
  if (pageId && store.project && page.value) {
     const targetPage = store.project.pages[pageId];
     if (targetPage) {
        const position = screenToFlowCoordinate({
            x: event.clientX,
            y: event.clientY,
        });

        const newBlock: LinkBlock = {
            id: crypto.randomUUID(),
            type: 'link',
            content: {
                pageId: targetPage.id,
                title: targetPage.title
            },
            x: position.x,
            y: position.y,
            width: 200,
            height: 100
        };

        const currentBlocks = page.value.blocks || [];
        store.updatePage(page.value.id, { blocks: [...currentBlocks, newBlock] });
     }
     return;
  }

  // 1.5 Handle Internal Assets
  const assetId = event.dataTransfer?.getData('application/x-codex-asset');
  if (assetId && page.value) {
      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      createMediaBlock(assetId, position.x, position.y);
      return;
  }

  // 1.6 Handle Unreal Assets
  const unrealAssetData = event.dataTransfer?.getData('application/x-codex-asset-data');
  if (unrealAssetData && page.value) {
      let asset: any | null = null;
      try {
          asset = JSON.parse(unrealAssetData);
      } catch (e) {
          console.warn('Failed to parse Unreal asset drag payload, falling back to asset-ref', e);
      }

      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      // Construct UE Reference format: Type'/Game/Path/Name.Name'
      // My asset.path is /Game/Path/Name (no extension)
      const reference = asset
        ? `${asset.asset_type || 'Asset'}'${asset.path}.${asset.name}'`
        : (unrealAssetRef ? `Asset'${unrealAssetRef}.${plainText || unrealAssetRef.split('/').pop() || 'Asset'}'` : '');

      if (!reference) {
          console.warn('Unreal asset drop detected, but no reference could be built');
          return;
      }

      const newBlock: Block = {
          id: crypto.randomUUID(),
          type: 'asset',
          content: { reference },
          x: position.x,
          y: position.y,
          width: 250,
          height: 100
      };

      const currentBlocks = page.value.blocks || [];
      store.updatePage(page.value.id, { blocks: [...currentBlocks, newBlock] });
      return;
  }

  // 1.65 Fallback: Unreal asset ref only
  if (unrealAssetRef && page.value) {
      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      const name = plainText || unrealAssetRef.split('/').pop() || 'Asset';
      const reference = `Asset'${unrealAssetRef}.${name}'`;

      const newBlock: Block = {
          id: crypto.randomUUID(),
          type: 'asset',
          content: { reference },
          x: position.x,
          y: position.y,
          width: 250,
          height: 100
      };

      const currentBlocks = page.value.blocks || [];
      store.updatePage(page.value.id, { blocks: [...currentBlocks, newBlock] });
      return;
  }

  // 2. Handle Files (Images/Videos)
  const files = event.dataTransfer?.files;
  if (files && files.length > 0 && page.value) {
      console.log('Processing dropped files:', files.length);

      const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
      });

      // Process files in background without blocking UI
      handleDroppedFiles(Array.from(files), position);
  } else {
      console.log('No files found in drop event. DataTransfer types:', event.dataTransfer?.types);
  }
}

async function handleDroppedFiles(fileArray: File[], position: { x: number; y: number }) {
  const pageId = props.pageId;
  const newBlocks: MediaBlock[] = [];
  const uploads: Array<{ file: File; blockId: string }> = [];

  // 1. Create optimistic blocks immediately
  for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file) continue;

      let kind: 'image' | 'video' | null = null;
      if (file.type.startsWith('image/')) kind = 'image';
      else if (file.type.startsWith('video/')) kind = 'video';

      if (!kind) {
          console.log('Skipping file (not image/video):', file.name, file.type);
          continue;
      }

      const tempId = crypto.randomUUID();
      const blobUrl = URL.createObjectURL(file);

      const newBlock: MediaBlock = {
          id: tempId,
          type: 'media',
          content: {
              label: file.name,
              filePath: blobUrl, // Temporary URL
              kind: kind
          },
          x: position.x + (i * 50),
          y: position.y + (i * 50),
          width: kind === 'video' ? 400 : 300,
          height: 300
      };

      newBlocks.push(newBlock);
      uploads.push({ file, blockId: tempId });
  }

  if (newBlocks.length === 0) return;

  // 2. Update UI immediately
  const currentPage = store.project?.pages[pageId];
  if (currentPage) {
      store.updatePage(pageId, { blocks: [...currentPage.blocks, ...newBlocks] });
  }

  // 3. Process uploads in background
  uploads.forEach(async ({ file, blockId }) => {
      try {
          console.log('Starting background upload for:', file.name);
          const asset = await storage.saveAsset(file);

          // Update the specific block with the real Asset ID
          // Fetch latest state to avoid overwriting other changes
          const latestPage = store.project?.pages[pageId];
          if (latestPage) {
              const blockIndex = latestPage.blocks.findIndex(b => b.id === blockId);
              if (blockIndex !== -1) {
                  const block = latestPage.blocks[blockIndex] as MediaBlock;

                  // Revoke the temporary blob URL
                  if (block.content.filePath.startsWith('blob:')) {
                      URL.revokeObjectURL(block.content.filePath);
                  }

                  const updatedBlock = {
                      ...block,
                      content: {
                          ...block.content,
                          label: asset.name,
                          filePath: asset.id
                      }
                  };

                  const updatedBlocks = [...latestPage.blocks];
                  updatedBlocks[blockIndex] = updatedBlock;
                  store.updatePage(pageId, { blocks: updatedBlocks });
                  console.log('Block updated with real Asset ID:', asset.id);
              }
          }
      } catch (e) {
          console.error('Failed to upload file in background:', file.name, e);
      }
  });

  console.log('Optimistic blocks created, uploads running in background');
}

// --- Paste Handler ---

async function handlePaste(event: ClipboardEvent) {
    if (!page.value) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    // Calculate position (center of screen or mouse position if we tracked it)
    // For now, let's use a random offset from center or just a fixed point + random
    const x = 200 + Math.random() * 50;
    const y = 200 + Math.random() * 50;

    for (const item of items) {
        if (item.kind === 'string' && item.type === 'text/plain') {
            item.getAsString((text) => {
                if (isValidUrl(text)) {
                    if (isYoutubeUrl(text)) {
                        createYoutubeBlock(text, x, y);
                    } else {
                        createWebsiteBlock(text, x, y);
                    }
                }
            });
        } else if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                try {
                    const asset = await storage.saveAsset(file);
                    createMediaBlock(asset.id, x, y);
                } catch (e) {
                    console.warn('Failed to save asset to storage, using blob URL fallback', e);
                    const blobUrl = URL.createObjectURL(file);
                    createMediaBlock(blobUrl, x, y);
                }
            }
        }
    }
}

function isValidUrl(string: string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function isYoutubeUrl(url: string) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function createYoutubeBlock(url: string, x: number, y: number) {
    if (!page.value) return;
    const newBlock: YoutubeBlock = {
        id: crypto.randomUUID(),
        type: 'youtube',
        content: { url, title: 'YouTube Video' },
        x, y, width: 400, height: 300
    };
    store.updatePage(page.value.id, { blocks: [...page.value.blocks, newBlock] });
}

async function createWebsiteBlock(url: string, x: number, y: number) {
    if (!page.value) return;

    let title = 'Website Link';
    let description = '';
    let imageUrl = '';

    try {
        // Fetch metadata from our local server proxy
        const res = await fetch(`http://localhost:3001/api/metadata?url=${encodeURIComponent(url)}`);
        if (res.ok) {
            const data = await res.json();
            title = data.title || title;
            description = data.description || '';
            imageUrl = data.image || '';
        }
    } catch (e) {
        console.error('Failed to fetch metadata', e);
    }

    const newBlock: WebsiteBlock = {
        id: crypto.randomUUID(),
        type: 'website',
        content: { url, title, description, imageUrl },
        x, y, width: 400, height: 300
    };

    // Get latest state
    const currentPage = store.project?.pages[props.pageId];
    if (currentPage) {
        store.updatePage(props.pageId, { blocks: [...currentPage.blocks, newBlock] });
    }
}

function createMediaBlock(assetId: string, x: number, y: number) {
    if (!page.value) return;

    // We don't have the full asset metadata here synchronously, but we can fetch it or just use the ID.
    // The MediaDisplay component will handle loading.
    // We can try to guess the kind if we had the metadata, but for now default to 'image' and let MediaDisplay handle it?
    // Actually, MediaDisplay needs 'kind' prop.
    // Let's fetch metadata quickly or just default.

    storage.loadAsset(assetId).then(blob => {
        let kind: 'image' | 'video' = 'image';
        if (blob) {
             if (blob.type.startsWith('video')) kind = 'video';
        }

        const newBlock: MediaBlock = {
            id: crypto.randomUUID(),
            type: 'media',
            content: { label: 'Asset', filePath: assetId, kind },
            x, y, width: 300, height: 300
        };
        store.updatePage(page.value!.id, { blocks: [...page.value!.blocks, newBlock] });
    });
}

onMounted(() => {
    window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
    window.removeEventListener('paste', handlePaste);
});

// --- Toolbar ---

const availableBlocks = [
  { type: 'region', label: 'Region', icon: Package },
  { type: 'text', label: 'Text Block', icon: Type },
  { type: 'steps', label: 'Steps List', icon: ListOrdered },
  { type: 'media', label: 'Media', icon: Image },
  { type: 'blueprint', label: 'Blueprint', icon: Network },
  { type: 'code', label: 'Code', icon: Code },
  { type: 'asset', label: 'Asset Ref', icon: Package },
];

function addBlock(type: Block['type']) {
  if (!page.value) return;

  // Center of view? For now just random offset or center
  // We can use `project` from useVueFlow to project screen center to flow coords if we had access to viewport
  // For now, fixed position + random offset
  const x = 100 + Math.random() * 50;
  const y = 100 + Math.random() * 50;

  const size = getDefaultSize(type);

  const newBlock: Block = {
    id: crypto.randomUUID(),
    type,
    content: getDefaultContent(type),
    x,
    y,
    width: size.width,
    height: size.height
  };

  const newBlocks = [...page.value.blocks, newBlock];
  store.updatePage(page.value.id, { blocks: newBlocks });
}

function getDefaultContent(type: Block['type']) {
  switch (type) {
    case 'region': return { title: 'Lane' };
    case 'text': return 'New text block';
    case 'steps': return ['Step 1', 'Step 2'];
    case 'media': return { label: 'Image', filePath: '', kind: 'image' };
    case 'blueprint': return { blueprintString: '' };
    case 'code': return { code: '// Write your code here...', language: 'cpp' };
    default: return {};
  }
}

function getDefaultSize(type: Block['type']) {
  switch (type) {
    case 'region':
      return { width: 700, height: 360 };
    case 'asset':
      return { width: 280, height: 160 };
    case 'link':
      return { width: 240, height: 120 };
    default:
      return { width: 300, height: 200 };
  }
}

function getTextFromBlock(block: Block): string {
  if (block.type === 'text') {
    if (typeof block.content === 'string') return block.content;
    return String(block.content?.text || '');
  }
  return '';
}

function collectBlocksInsideRegion(region: Block, blocks: Block[]): Block[] {
  const rx1 = region.x;
  const ry1 = region.y;
  const rx2 = region.x + region.width;
  const ry2 = region.y + region.height;

  const inside: Block[] = [];
  for (const b of blocks) {
    if (b.id === region.id) continue;
    if (b.type === 'region') continue;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (cx >= rx1 && cx <= rx2 && cy >= ry1 && cy <= ry2) inside.push(b);
  }

  inside.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return inside;
}

function blockToMarkdownBullet(block: Block): string {
  switch (block.type) {
    case 'asset':
      return `- [[${String(block.content?.reference || '').trim()}]]`;
    case 'blueprint': {
      const bp = String(block.content?.blueprintString || '').trim();
      const excerpt = bp.length > 2000 ? `${bp.slice(0, 2000)}\n...` : bp;
      return `- Blueprint:\n\n\`\`\`blueprint\n${excerpt}\n\`\`\``;
    }
    case 'link':
      return `- [[${String((block as any).content?.title || 'Page')}]]`;
    case 'media': {
      const label = String(block.content?.label || 'Media');
      const filePath = String(block.content?.filePath || '');
      const kind = String(block.content?.kind || 'image');
      if (kind === 'video') return `- <video src="${filePath}" controls></video>`;
      return `- ![${label}](${filePath})`;
    }
    case 'steps': {
      const steps = Array.isArray(block.content) ? block.content : [];
      const items = steps.map((s: any, i: number) => `  ${i + 1}. ${String(s)}`).join('\n');
      return `- Steps:\n${items}`;
    }
    case 'code': {
      const lang = String(block.content?.language || 'text');
      const code = String(block.content?.code || '').trim();
      const excerpt = code.length > 2000 ? `${code.slice(0, 2000)}\n...` : code;
      return `- Code:\n\n\`\`\`${lang}\n${excerpt}\n\`\`\``;
    }
    case 'text': {
      const text = getTextFromBlock(block).trim();
      const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
      const excerpt = firstLine.length > 140 ? `${firstLine.slice(0, 140)}...` : firstLine;
      return `- ${excerpt || 'Text'}`;
    }
    default:
      return `- ${block.type}`;
  }
}

function buildCollectionMarkdownFromCanvasBlocks(title: string, blocks: Block[]): string {
  const regions = blocks.filter(b => b.type === 'region');
  const nonRegions = blocks.filter(b => b.type !== 'region');
  const used = new Set<string>();

  let md = `# ${title}\n\n`;

  for (const region of regions) {
    const regionTitle = String(region.content?.title || 'Lane').trim();
    md += `## ${regionTitle}\n\n`;
    const inside = collectBlocksInsideRegion(region, blocks);
    if (!inside.length) {
      md += `- (empty)\n\n`;
      continue;
    }
    for (const b of inside) {
      used.add(b.id);
      md += `${blockToMarkdownBullet(b)}\n`;
    }
    md += `\n`;
  }

  const remaining = nonRegions.filter(b => !used.has(b.id));
  if (remaining.length) {
    remaining.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    md += `## Unsorted\n\n`;
    for (const b of remaining) md += `${blockToMarkdownBullet(b)}\n`;
    md += `\n`;
  }

  return md;
}

async function createCollectionPageFromCanvas() {
  if (!page.value || !store.project) return;

  const defaultTitle = `${page.value.title} Collection`;
  const title = prompt('Collection page title:', defaultTitle) || '';
  if (!title.trim()) return;

  const base = buildCollectionMarkdownFromCanvasBlocks(title.trim(), page.value.blocks || []);

  const useAI = aiService.isEnabled()
    ? confirm('Use AI to rewrite the collection page into cleaner documentation?')
    : false;

  let markdownBody = base;
  if (useAI) {
    try {
      const promptText = `Rewrite this Canvas collection into clean, practical Unreal Engine documentation in Markdown.
Rules:
- Keep ALL wiki-links exactly as-is (like [[Blueprint'/Game/...Name.Name']]).
- Keep code blocks intact.
- No emojis.
- Keep it concise and structured.

Input Markdown:
${base}`;

      const res = await aiService.customRequest(promptText, 1200);
      const text = res.text.trim();
      if (text) markdownBody = text;
    } catch (e) {
      console.warn('AI collection rewrite failed, using base markdown', e);
    }
  }

  store.addPage(title.trim());
  const newId = (store as any).activePageId as string | null;
  if (!newId) return;

  store.updatePage(newId, {
    category: 'Collections',
    tags: ['Collection'],
    markdownBody,
    viewMode: 'document',
    metadata: {
      ...(store.project.pages[newId] as any)?.metadata,
      createdAt: (store.project.pages[newId] as any)?.metadata?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceCanvasPageId: page.value.id
    }
  } as any);

  store.setActivePage(newId);
}

async function generateSystemMapFromSelectedNode() {
  if (!page.value) return;

  const selected = nodes.value.filter((n: any) => n.selected);
  const seedNode = selected[0];
  if (!seedNode) {
    alert('Select a Blueprint or Text node first.');
    return;
  }

  const seedBlock = page.value.blocks.find(b => b.id === seedNode.id);
  if (!seedBlock || (seedBlock.type !== 'blueprint' && seedBlock.type !== 'text')) {
    alert('System Map works with Text or Blueprint nodes.');
    return;
  }

  if (!aiService.isEnabled()) {
    alert('AI is not configured. Open Settings and add your API key/model.');
    return;
  }

  const goal = prompt('System goal (optional):', '') ?? '';
  const triggers = prompt('Key events/triggers (optional):', '') ?? '';
  const constraints = prompt('Constraints / perf concerns (optional):', '') ?? '';

  const seedText = seedBlock.type === 'text'
    ? getTextFromBlock(seedBlock)
    : String(seedBlock.content?.blueprintString || '');

  const promptText = `You are generating a structured Unreal Engine system map from a seed note/blueprint.
Return ONLY valid JSON. No markdown.

Seed type: ${seedBlock.type}
Seed content (may be truncated):
${seedText.slice(0, 8000)}

User notes:
- goal: ${goal}
- triggers: ${triggers}
- constraints: ${constraints}

Output JSON schema:
{
  "title": string,
  "overview": string,
  "components": string[],
  "dataFlow": string[],
  "events": string[],
  "assets": string[],
  "failurePoints": string[],
  "todo": string[]
}

For assets: use Unreal reference format like Blueprint'/Game/Path/Name.Name' when you can.
`;

  let data: any = null;
  try {
    const res = await aiService.customRequest(promptText, 1400);
    data = JSON.parse(res.text.trim());
  } catch (e) {
    console.error('Failed to generate system map JSON', e);
    alert('AI returned an invalid system map.');
    return;
  }

  const title = String(data?.title || 'System Map');
  const x = (seedBlock.x ?? 100) - 80;
  const y = (seedBlock.y ?? 100) - 80;

  const regionId = crypto.randomUUID();
  const newBlocks: Block[] = [];

  newBlocks.push({
    id: regionId,
    type: 'region',
    content: { title },
    x,
    y,
    width: 980,
    height: 640
  } as any);

  const mkText = (heading: string, lines: any, dx: number, dy: number, w: number, h: number) => {
    const arr = Array.isArray(lines) ? lines : [];
    const body = arr.map((s: any) => `- ${String(s)}`).join('\n');
    const text = `## ${heading}\n\n${body}`.trim();
    newBlocks.push({
      id: crypto.randomUUID(),
      type: 'text',
      content: { text, fontSize: 12 },
      x: x + dx,
      y: y + dy,
      width: w,
      height: h
    } as any);
  };

  const overview = String(data?.overview || '').trim();
  newBlocks.push({
    id: crypto.randomUUID(),
    type: 'text',
    content: { text: `## Overview\n\n${overview}`, fontSize: 12 },
    x: x + 20,
    y: y + 60,
    width: 460,
    height: 180
  } as any);

  mkText('Components', data?.components, 20, 260, 460, 240);
  mkText('Data Flow', data?.dataFlow, 500, 60, 460, 200);
  mkText('Events', data?.events, 500, 280, 460, 220);
  mkText('Failure Points', data?.failurePoints, 20, 520, 460, 200);
  mkText('TODO', data?.todo, 500, 520, 460, 200);

  const assets: any[] = Array.isArray(data?.assets) ? data.assets : [];
  const assetRefs = assets
    .map(a => String(a).trim())
    .filter(s => s.includes("'") && s.includes('/Game/') && s.endsWith("'"))
    .slice(0, 10);

  let ax = x + 20;
  for (const ref of assetRefs) {
    newBlocks.push({
      id: crypto.randomUUID(),
      type: 'asset',
      content: { reference: ref },
      x: ax,
      y: y + 740,
      width: 300,
      height: 120
    } as any);
    ax += 320;
  }

  store.updatePage(page.value.id, { blocks: [...page.value.blocks, ...newBlocks] });
}

</script>

<template>
  <div
    class="w-full h-full bg-ue-dark relative"
    @drop.prevent="onDrop"
    @dragover.prevent
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
  >
    <!-- Drag Overlay -->
    <div v-if="isDragging" class="absolute inset-0 z-50 bg-ue-accent/20 border-4 border-ue-accent flex items-center justify-center pointer-events-none">
        <div class="text-white text-2xl font-bold bg-black/80 px-6 py-4 rounded-lg shadow-xl border border-ue-accent backdrop-blur-sm">
            Drop to Add Media
        </div>
    </div>

    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-zoom="1"
      :min-zoom="0.1"
      :max-zoom="4"
      :multi-selection-key-code="'Control'"
      :delete-key-code="['Delete', 'Backspace']"
      :only-render-visible-elements="true"
      fit-view-on-init
      class="bg-ue-dark"
    >
      <template #node-custom="props">
        <CustomNode v-bind="props" />
      </template>

      <Background pattern-color="#333" :gap="20" />
      <Controls />
    </VueFlow>

    <!-- Floating Toolbar -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-ue-panel border border-black rounded-lg shadow-xl p-2 flex gap-2 z-10">
      <button
        v-for="block in availableBlocks"
        :key="block.type"
        @click="addBlock(block.type as any)"
        class="flex flex-col items-center justify-center w-16 h-14 rounded hover:bg-white/10 transition-colors group"
        :title="block.label"
      >
        <component :is="block.icon" class="w-5 h-5 mb-1 text-gray-300 group-hover:text-white group-hover:scale-110 transition-all" />
        <span class="text-[10px] text-gray-400 uppercase font-bold">{{ block.label.split(' ')[0] }}</span>
      </button>

      <div class="w-px bg-white/10 mx-1"></div>

      <button
        @click="createCollectionPageFromCanvas"
        class="flex flex-col items-center justify-center w-16 h-14 rounded hover:bg-white/10 transition-colors group"
        title="Create Collection Page from Canvas"
      >
        <FileText class="w-5 h-5 mb-1 text-gray-300 group-hover:text-white group-hover:scale-110 transition-all" />
        <span class="text-[10px] text-gray-400 uppercase font-bold">Collection</span>
      </button>

      <button
        @click="generateSystemMapFromSelectedNode"
        class="flex flex-col items-center justify-center w-16 h-14 rounded hover:bg-white/10 transition-colors group"
        title="Generate System Map from Selected Node"
      >
        <Sparkles class="w-5 h-5 mb-1 text-gray-300 group-hover:text-white group-hover:scale-110 transition-all" />
        <span class="text-[10px] text-gray-400 uppercase font-bold">System</span>
      </button>
    </div>

    <!-- Context Menu -->
    <div v-if="contextMenu.visible"
         class="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[150px]"
         :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }">        <button @click.stop="disconnectNode" class="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2">
            <Unplug class="w-3 h-3" />
            Disconnect Node
        </button>        <button @click.stop="deleteNode" class="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2">
            <Trash2 class="w-3 h-3" />
            Discard Node
        </button>
    </div>
  </div>
</template>

<style>
/* Override Vue Flow styles to match UE theme */
.vue-flow__controls {
  box-shadow: none;
  border: 1px solid #000;
}
.vue-flow__controls-button {
  background: #1E1E1E;
  border-bottom: 1px solid #000;
  fill: #aaa;
}
.vue-flow__controls-button:hover {
  background: #333;
  fill: #fff;
}
.vue-flow__edge-path {
  stroke: #777;
  stroke-width: 2;
}
.vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #F08D49; /* UE Accent */
}
</style>
