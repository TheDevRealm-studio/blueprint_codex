import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Project, DocPage, FileSystemNode } from '../types';
import { storage } from '../services/storage';
import { unrealService } from '../services/unreal';
import { aiService } from '../services/ai';

import { templates } from '../config/templates';

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([]);
  const currentProjectId = ref<string | null>(null);
  const activePageId = ref<string | null>(null);
  const openPageIds = ref<string[]>([]);
  const viewMode = ref<'editor' | 'graph' | 'project-graph'>('editor');
  const isCommandPaletteOpen = ref(false);
  const showKnowledgeGraph = ref(false);

  const serverStatus = ref<'online' | 'offline' | 'checking'>('checking');
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Initialize
  async function init() {
    try {
      const loaded = await storage.loadProjects();
      // Check environment
      // @ts-ignore
      if (window.__TAURI__) {
        serverStatus.value = 'online';
      } else {
        try {
          await fetch('http://localhost:3001/api/projects');
          serverStatus.value = 'online';
        } catch {
          serverStatus.value = 'offline';
        }
      }

      if (loaded.length > 0) {
      // Migration: Convert old array-based pages to new structure if needed
      projects.value = loaded.map(p => {
        if (Array.isArray(p.pages)) {
           const newPages: Record<string, DocPage> = {};
           const newStructure: FileSystemNode[] = [];
           // @ts-ignore - handling legacy data
           (p.pages as DocPage[]).forEach(page => {
             newPages[page.id] = page;
             newStructure.push({
               id: crypto.randomUUID(),
               name: page.title,
               type: 'page',
               pageId: page.id
             });
           });
           return {
             ...p,
             pages: newPages,
             structure: newStructure
           } as Project;
        }
        return p;
      });

      if (!currentProjectId.value && projects.value[0]) {
        currentProjectId.value = projects.value[0].id;
      }
    } else {
      // Default project
      createProject('My Unreal Project');
    }
  } catch (e) {
    console.error('Failed to initialize project store', e);
    serverStatus.value = 'offline';
    // Ensure we have a project to work with even if storage failed
    if (projects.value.length === 0) {
      createProject('My Unreal Project');
    }
  }
  }

  // Call init immediately, but wait for next tick to ensure environment is ready
  setTimeout(() => {
    init();
  }, 100);

  // Persist changes
  watch([projects], async () => {
    if (serverStatus.value === 'offline') return;

    saveStatus.value = 'saving';
    try {
      await storage.saveProjects(projects.value);
      saveStatus.value = 'saved';
      setTimeout(() => {
        if (saveStatus.value === 'saved') saveStatus.value = 'idle';
      }, 2000);
    } catch (e) {
      saveStatus.value = 'error';
      serverStatus.value = 'offline'; // Assume offline if save fails
    }
  }, { deep: true });

  const storedId = localStorage.getItem('codex-active-project');
  if (storedId) currentProjectId.value = storedId;

  watch(currentProjectId, (newId) => {
    if (newId) localStorage.setItem('codex-active-project', newId);
  });

  const project = computed(() =>
    projects.value.find(p => p.id === currentProjectId.value) || projects.value[0]
  );

  const activePage = computed(() => {
    if (!project.value || !activePageId.value) return null;
    return project.value.pages[activePageId.value];
  });

  function createProject(name: string) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      structure: [],
      pages: {},
      media: []
    };
    projects.value.push(newProject);
    currentProjectId.value = newProject.id;
    activePageId.value = null;
  }

  function selectProject(id: string) {
    currentProjectId.value = id;
    activePageId.value = null;
  }

  function findNode(nodes: FileSystemNode[], id: string): FileSystemNode | undefined {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return undefined;
  }

  function addPage(title: string, parentNodeId?: string, templateId?: string) {
    if (!project.value) return;

    const id = crypto.randomUUID();

    // Find template
    const template = templates.find(t => t.id === templateId) || templates[0];
    let initialMarkdown = '# ' + title + '\n\nStart writing...';
    let initialTags: string[] = [];

    if (template) {
        initialMarkdown = template.markdown.replace('Actor Name', title).replace('Game Mode Name', title).replace('System Name', title);
        initialTags = template.tags || [];
    }

    const newPage: DocPage = {
      id,
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      category: 'General',
      tags: initialTags,
      blocks: [],
      edges: [],
      markdownBody: initialMarkdown,
      viewMode: 'document'
    };

    // Add to flat storage
    project.value.pages[id] = newPage;

    // Add to structure
    const newNode: FileSystemNode = {
      id: crypto.randomUUID(),
      name: title,
      type: 'page',
      pageId: id
    };

    if (parentNodeId) {
       const parent = findNode(project.value.structure, parentNodeId);
       if (parent && parent.type === 'folder') {
         parent.children = parent.children || [];
         parent.children.push(newNode);
         parent.isOpen = true;
       } else {
         project.value.structure.push(newNode);
       }
    } else {
      project.value.structure.push(newNode);
    }

    activePageId.value = id;
  }

  function addFolder(name: string, parentNodeId?: string) {
    if (!project.value) return;
    const newNode: FileSystemNode = {
        id: crypto.randomUUID(),
        name,
        type: 'folder',
        children: [],
        isOpen: true
    };
     if (parentNodeId) {
         const parent = findNode(project.value.structure, parentNodeId);
         if (parent && parent.type === 'folder') {
             parent.children = parent.children || [];
             parent.children.push(newNode);
             parent.isOpen = true;
         } else {
             project.value.structure.push(newNode);
         }
     } else {
         project.value.structure.push(newNode);
     }
  }

  function setActivePage(id: string) {
    activePageId.value = id;
    if (!openPageIds.value.includes(id)) {
      openPageIds.value.push(id);
    }
    viewMode.value = 'editor';

    // Increment view count
    if (project.value && project.value.pages[id]) {
        const page = project.value.pages[id];
        page.viewCount = (page.viewCount || 0) + 1;
    }
  }

  function closePage(id: string) {
    const index = openPageIds.value.indexOf(id);
    if (index !== -1) {
      openPageIds.value.splice(index, 1);
      // If we closed the active page, switch to another one
      if (activePageId.value === id) {
        if (openPageIds.value.length > 0) {
          // Try to go to the one to the left, or the first one
          const newIndex = Math.max(0, index - 1);
          activePageId.value = openPageIds.value[newIndex] || null;
        } else {
          activePageId.value = null;
        }
      }
    }
  }

  function setViewMode(mode: 'editor' | 'graph' | 'project-graph') {
    viewMode.value = mode;
    showKnowledgeGraph.value = mode === 'graph' || mode === 'project-graph';
  }

  watch(showKnowledgeGraph, (show) => {
      if (show) {
          if (viewMode.value === 'editor') viewMode.value = 'graph';
      } else {
          viewMode.value = 'editor';
      }
  });


  function updatePage(id: string, updates: Partial<DocPage>) {
    if (!project.value) return;
    const page = project.value.pages[id];
    if (page) {
      Object.assign(page, updates);
    }
  }

  function toggleFolder(nodeId: string) {
      if (!project.value) return;
      const node = findNode(project.value.structure, nodeId);
      if (node && node.type === 'folder') {
          node.isOpen = !node.isOpen;
      }
  }

  function renameNode(id: string, newName: string) {
    if (!project.value) return;
    const node = findNode(project.value.structure, id);
    if (node) {
      node.name = newName;
      if (node.type === 'page' && node.pageId) {
        const page = project.value.pages[node.pageId];
        if (page) page.title = newName;
      }
    }
  }

  function deleteNode(id: string) {
    if (!project.value) return;

    // Helper to recursively delete content
    function deleteContentRecursively(node: FileSystemNode) {
        if (node.type === 'page' && node.pageId && project.value) {
            delete project.value.pages[node.pageId];
            if (activePageId.value === node.pageId) activePageId.value = null;
        }
        if (node.children) {
            node.children.forEach(deleteContentRecursively);
        }
    }

    // Helper to remove from tree
    function removeFromTree(nodes: FileSystemNode[]): boolean {
      const idx = nodes.findIndex(n => n.id === id);
      if (idx !== -1) {
        const node = nodes[idx];
        if (!node) return false;

        // Recursively delete content
        deleteContentRecursively(node);

        nodes.splice(idx, 1);
        return true;
      }

      for (const node of nodes) {
        if (node.children && removeFromTree(node.children)) return true;
      }
      return false;
    }

    removeFromTree(project.value.structure);
  }

  function moveNode(nodeId: string, targetFolderId: string | null) {
    if (!project.value) return;
    if (nodeId === targetFolderId) return; // Can't move into self

    // Check for circular move (moving parent into child)
    if (targetFolderId) {
        const node = findNode(project.value.structure, nodeId);
        if (node && node.children) {
            const targetInChildren = findNode(node.children, targetFolderId);
            if (targetInChildren) return; // Target is inside the node we are moving
        }
    }

    // 1. Find and remove node
    let nodeToMove: FileSystemNode | null = null;

    function extract(nodes: FileSystemNode[]): boolean {
      const idx = nodes.findIndex(n => n.id === nodeId);
      if (idx !== -1) {
        nodeToMove = nodes[idx] || null;
        nodes.splice(idx, 1);
        return true;
      }
      for (const node of nodes) {
        if (node.children && extract(node.children)) return true;
      }
      return false;
    }

    extract(project.value.structure);

    if (!nodeToMove) return;

    // 2. Insert into target
    if (targetFolderId === null) {
      // Root
      project.value.structure.push(nodeToMove);
    } else {
      const target = findNode(project.value.structure, targetFolderId);
      if (target && target.type === 'folder') {
        target.children = target.children || [];
        target.children.push(nodeToMove);
        target.isOpen = true;
      } else {
        // Fallback to root if target not found
        project.value.structure.push(nodeToMove);
      }
    }
  }

  function importProject(importedProject: Project) {
    // Check if project with same ID exists
    const existingIndex = projects.value.findIndex(p => p.id === importedProject.id);
    if (existingIndex !== -1) {
      if (confirm(`Project "${importedProject.name}" already exists. Overwrite?`)) {
        projects.value[existingIndex] = importedProject;
      } else {
        // Create copy with new ID
        importedProject.id = crypto.randomUUID();
        importedProject.name = `${importedProject.name} (Imported)`;
        projects.value.push(importedProject);
      }
    } else {
      projects.value.push(importedProject);
    }
    currentProjectId.value = importedProject.id;
    activePageId.value = null;
    openPageIds.value = [];
  }

  async function linkUnrealProject() {
    if (!project.value) return;
    const path = await unrealService.selectProject();
    if (path) {
      project.value.unrealProjectPath = path;
      // Auto-save handled by watcher
    }
  }

  function addLink(sourceId: string, targetId: string) {
    if (!project.value) return;
    const sourcePage = project.value.pages[sourceId];
    const targetPage = project.value.pages[targetId];

    if (sourcePage && targetPage) {
      const linkText = `\n\nSee also: [[${targetPage.title}]]`;
      updatePage(sourceId, {
        markdownBody: (sourcePage.markdownBody || '') + linkText
      });
    }
  }

  type UnrealAssetLike = {
    name: string;
    path: string;
    asset_type?: string;
    file_path?: string;
  };

  function buildUnrealAssetRef(asset: UnrealAssetLike): string {
    const assetType = asset.asset_type || 'Asset';
    // asset.path expected like: /Game/Folder/AssetName
    // ref expected like: Type'/Game/Folder/AssetName.AssetName'
    return `${assetType}'${asset.path}.${asset.name}'`;
  }

  function defaultTagsForUnrealAsset(asset: UnrealAssetLike): string[] {
    const tags = new Set<string>();
    tags.add('Asset');
    if (asset.asset_type) tags.add(asset.asset_type);

    // Use folder segments as lightweight categories (top 2)
    const parts = asset.path.replace(/^\/Game\/?/, '').split('/').filter(Boolean);
    for (const part of parts.slice(0, 2)) {
      // Avoid adding the asset name as a tag
      if (part && part !== asset.name) tags.add(part);
    }

    return Array.from(tags).filter(t => t && t.length <= 32).slice(0, 8);
  }

  async function suggestTagsForUnrealAsset(asset: UnrealAssetLike): Promise<string[]> {
    const fallback = defaultTagsForUnrealAsset(asset);
    if (!aiService.isEnabled()) return fallback;

    const prompt = `You are helping categorize Unreal Engine assets for a personal knowledge base.
Return ONLY a JSON array of 3 to 8 short tags (strings). No markdown.

Asset:
- name: ${asset.name}
- type: ${asset.asset_type || 'Unknown'}
- path: ${asset.path}

Rules:
- Tags should be short (1-3 words)
- Prefer pipeline-style tags (UI, VFX, SFX, Character, Environment, Material, Texture, Blueprint, Level, Animation, etc.)
- Avoid duplicates and avoid the exact full path as a tag.
`;

    try {
      const res = await aiService.customRequest(prompt, 200);
      const raw = res.text.trim();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      const tags = parsed
        .filter((t: any) => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0 && t.length <= 32);
      return Array.from(new Set(tags)).slice(0, 8);
    } catch {
      return fallback;
    }
  }

  function findDocPageByUnrealRef(ref: string): DocPage | null {
    if (!project.value) return null;
    const pages = Object.values(project.value.pages);
    return pages.find(p => p.metadata?.unrealAssetRef === ref) || null;
  }

  async function createOrUpdateDocPageForUnrealAsset(
    asset: UnrealAssetLike,
    options?: { useAI?: boolean; openPage?: boolean }
  ) {
    if (!project.value) return;

    const useAI = options?.useAI ?? aiService.isEnabled();
    const openPage = options?.openPage ?? true;

    const ref = buildUnrealAssetRef(asset);
    const existing = findDocPageByUnrealRef(ref);

    const title = `ASSET: ${asset.name}`;
    const slug = `asset-${asset.name}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

    const baseMarkdown =
`# ${asset.name}

**Reference**: [[${ref}]]

## Overview

Describe what this asset is and where it is used.

## Notes

- 
`;

    let markdownBody = baseMarkdown;
    let tags = defaultTagsForUnrealAsset(asset);

    // If AI is enabled, generate a better doc stub and tags
    if (useAI && aiService.isEnabled()) {
      const docPrompt = `Create a concise Unreal Engine asset documentation page in Markdown.
Include sections: Overview, Usage, Related, Notes.
Include the exact reference wiki-link somewhere: [[${ref}]]
Do NOT use emojis.
Keep it practical and short.

Asset:
- name: ${asset.name}
- type: ${asset.asset_type || 'Unknown'}
- path: ${asset.path}
`;

      try {
        const res = await aiService.customRequest(docPrompt, 900);
        const text = res.text.trim();
        if (text.length > 0) markdownBody = text;
      } catch {
        // fall back to baseMarkdown
      }

      tags = await suggestTagsForUnrealAsset(asset);
    }

    if (existing) {
      // Merge: keep existing markdown if it's already populated; ensure ref exists.
      const hasRef = existing.markdownBody?.includes(ref);
      const updatedMarkdown = hasRef ? existing.markdownBody : `${existing.markdownBody || ''}\n\n[[${ref}]]\n`;

      updatePage(existing.id, {
        title: existing.title || title,
        slug: existing.slug || slug,
        category: existing.category || 'Assets',
        tags: Array.from(new Set([...(existing.tags || []), ...tags])),
        markdownBody: updatedMarkdown,
        metadata: {
          ...(existing.metadata || {}),
          unrealAssetRef: ref,
          unrealAssetType: asset.asset_type,
          unrealAssetPath: asset.path,
          unrealAssetFilePath: asset.file_path
        }
      });

      if (openPage) setActivePage(existing.id);
      return;
    }

    const id = crypto.randomUUID();
    const newPage: DocPage = {
      id,
      title,
      slug: slug || id,
      category: 'Assets',
      tags,
      blocks: [],
      edges: [],
      markdownBody,
      viewMode: 'document',
      metadata: {
        unrealAssetRef: ref,
        unrealAssetType: asset.asset_type,
        unrealAssetPath: asset.path,
        unrealAssetFilePath: asset.file_path,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    project.value.pages[id] = newPage;
    project.value.structure.push({
      id: crypto.randomUUID(),
      name: title,
      type: 'page',
      pageId: id
    });

    if (openPage) setActivePage(id);
  }

  function parseUnrealRef(ref: string): { assetType: string; path: string; name: string } | null {
    const match = ref.match(/^([A-Za-z0-9_]+)'([^']+)'$/);
    if (!match) return null;
    const assetType = match[1] || 'Asset';
    const inner = match[2] || '';
    const dotIdx = inner.lastIndexOf('.');
    if (dotIdx <= 0) return null;
    const path = inner.slice(0, dotIdx);
    const name = inner.slice(dotIdx + 1);
    if (!path || !name) return null;
    return { assetType, path, name };
  }

  function collectUnrealRefsFromMarkdown(markdown: string): string[] {
    const refs: string[] = [];
    const regex = /\[\[([A-Za-z0-9_]+)'([^']+)'\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      const assetType = match[1];
      const inner = match[2];
      if (!assetType || !inner) continue;
      refs.push(`${assetType}'${inner}'`);
    }
    return refs;
  }

  function scanBrokenUnrealReferences() {
    if (!project.value) return { broken: [], total: 0 };

    const assetsRef = unrealService.getAssets();
    const unrealAssets = assetsRef.value || [];
    const assetKeySet = new Set(unrealAssets.map(a => `${a.path}::${a.name}`));

    const broken: Array<{ ref: string; pageId: string; pageTitle: string; source: 'markdown' | 'canvas' }> = [];
    let total = 0;

    for (const page of Object.values(project.value.pages)) {
      // Markdown refs
      const mdRefs = collectUnrealRefsFromMarkdown(page.markdownBody || '');
      for (const ref of mdRefs) {
        total++;
        const parsed = parseUnrealRef(ref);
        if (!parsed) continue;
        const key = `${parsed.path}::${parsed.name}`;
        if (!assetKeySet.has(key)) {
          broken.push({ ref, pageId: page.id, pageTitle: page.title, source: 'markdown' });
        }
      }

      // Canvas refs
      for (const block of page.blocks || []) {
        if (block.type !== 'asset' || !block.content?.reference) continue;
        total++;
        const ref = String(block.content.reference);
        const parsed = parseUnrealRef(ref);
        if (!parsed) continue;
        const key = `${parsed.path}::${parsed.name}`;
        if (!assetKeySet.has(key)) {
          broken.push({ ref, pageId: page.id, pageTitle: page.title, source: 'canvas' });
        }
      }
    }

    return { broken, total };
  }

  function bestGuessReplacementRef(oldRef: string): string | null {
    const parsed = parseUnrealRef(oldRef);
    if (!parsed) return null;

    const results = unrealService.search(parsed.name);
    const best = results[0];
    if (!best) return null;
    return buildUnrealAssetRef(best);
  }

  function replaceUnrealReferenceEverywhere(oldRef: string, newRef: string) {
    if (!project.value) return 0;
    let pagesChanged = 0;

    for (const page of Object.values(project.value.pages)) {
      let changed = false;
      let markdownBody = page.markdownBody || '';

      if (markdownBody.includes(oldRef)) {
        markdownBody = markdownBody.split(oldRef).join(newRef);
        changed = true;
      }

      const blocks = page.blocks || [];
      const newBlocks = blocks.map(b => {
        if (b.type === 'asset' && b.content?.reference === oldRef) {
          changed = true;
          return { ...b, content: { ...b.content, reference: newRef } } as any;
        }
        return b;
      });

      if (changed) {
        pagesChanged++;
        updatePage(page.id, { markdownBody, blocks: newBlocks, metadata: { ...(page.metadata || {}), updatedAt: new Date().toISOString() } });
      }
    }

    return pagesChanged;
  }

  function estimatePagesAffectedByRef(oldRef: string) {
    if (!project.value) return 0;
    let count = 0;
    for (const page of Object.values(project.value.pages)) {
      const inMarkdown = (page.markdownBody || '').includes(oldRef);
      const inBlocks = (page.blocks || []).some(b => b.type === 'asset' && b.content?.reference === oldRef);
      if (inMarkdown || inBlocks) count++;
    }
    return count;
  }

  function runReferenceHygieneAutoFix() {
    const { broken } = scanBrokenUnrealReferences();
    if (broken.length === 0) {
      alert('No broken Unreal references found.');
      return;
    }

    const mapping = new Map<string, string>();
    for (const item of broken) {
      if (mapping.has(item.ref)) continue;
      const replacement = bestGuessReplacementRef(item.ref);
      if (replacement && replacement !== item.ref) mapping.set(item.ref, replacement);
    }

    if (mapping.size === 0) {
      alert('Found broken references, but no safe replacement guesses were found.');
      return;
    }

    const previewLines: string[] = [];
    let estimatedPages = 0;
    let idx = 0;
    for (const [oldRef, newRef] of mapping.entries()) {
      estimatedPages += estimatePagesAffectedByRef(oldRef);
      if (idx < 12) previewLines.push(`- ${oldRef}  ->  ${newRef}`);
      idx++;
    }

    const ok = confirm(
      `Reference Hygiene Auto-fix Preview\n\n` +
      `Broken references found: ${broken.length}\n` +
      `Unique replacements: ${mapping.size}\n` +
      `Estimated pages affected: ~${estimatedPages}\n\n` +
      `${previewLines.join('\n')}` +
      `${mapping.size > 12 ? '\n\n...more mappings (see console)' : ''}` +
      `\n\nApply these replacements?`
    );
    if (!ok) return;

    if (mapping.size > 12) {
      console.table(Array.from(mapping.entries()).map(([oldRef, newRef]) => ({ oldRef, newRef })));
    }

    let fixed = 0;
    for (const [oldRef, newRef] of mapping.entries()) {
      fixed += replaceUnrealReferenceEverywhere(oldRef, newRef);
    }

    alert(`Auto-fix complete. Updated ${fixed} page(s).`);
  }

  // Watch for project changes to load Unreal context
  watch(project, (newVal) => {
    if (newVal && newVal.unrealProjectPath) {
      unrealService.scanProject(newVal.unrealProjectPath);
    }
  }, { immediate: true });

  return {
    projects,
    currentProjectId,
    project,
    activePageId,
    activePage,
    openPageIds,
    createProject,
    selectProject,
    addPage,
    addFolder,
    setActivePage,
    closePage,
    setViewMode,
    viewMode,
    updatePage,
    toggleFolder,
    renameNode,
    deleteNode,
    moveNode,
    importProject,
    linkUnrealProject,
    addLink,

    // Unreal AI / Hygiene helpers
    createOrUpdateDocPageForUnrealAsset,
    suggestTagsForUnrealAsset,
    scanBrokenUnrealReferences,
    runReferenceHygieneAutoFix,
    serverStatus,
    saveStatus,
    isCommandPaletteOpen,
    showKnowledgeGraph
  };
});
